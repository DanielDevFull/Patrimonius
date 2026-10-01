import { addMonthsToKey, formatMonthLong, lastMonths, monthKey } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import { plural } from '@/domain/text';
import type { AccountType, Cents, FinanceData, ISODate, MonthKey } from '@/domain/types';
import { accountBalances } from './balances';
import { budgetStatuses, suggestBudgets } from './budgets';
import { debtsOverview } from './debts';
import { goalsOverview } from './goals';
import { isFlow } from './internal/common';
import { averageMonthlyExpense, averageMonthlyIncome, monthlySeries } from './summary';
import type {
  EmergencyFundLevel,
  EmergencyFundStatus,
  GoalProgress,
  HealthComponent,
  HealthGrade,
  HealthReport,
  MonthSummary,
} from './types';

/** Meses completos analisados (anteriores ao mês de `today`). */
const HISTORY_MONTHS = 3;
/** Tipos de conta cujo saldo conta como reserva de emergência. */
const RESERVE_ACCOUNT_TYPES: readonly AccountType[] = ['corrente', 'poupanca', 'carteira', 'investimento'];
/** Fração da despesa total usada como custo essencial quando não há gastos classificados como necessidades. */
const ESSENTIAL_SHARE_OF_EXPENSE = 0.6;
/** Fração da renda estimada usada como custo essencial quando não há despesas registradas. */
const ESSENTIAL_SHARE_OF_INCOME = 0.5;
const DEFAULT_EMERGENCY_MONTHS = 6;
const DEFAULT_SAVINGS_TARGET = 20;
/** Comprometimento da renda com parcelas: até 10% => nota 100; a partir de 50% => nota 0. */
const DEBT_RATIO_BEST = 0.1;
const DEBT_RATIO_WORST = 0.5;
/** Nota neutra para componentes sem dados configurados (orçamentos, metas). */
const NEUTRAL_SCORE = 50;

const WEIGHTS: Record<HealthComponent['key'], number> = {
  poupanca: 25,
  reserva: 25,
  dividas: 20,
  orcamento: 15,
  metas: 10,
  fluxo: 5,
};

const LABELS: Record<HealthComponent['key'], string> = {
  poupanca: 'Taxa de poupança',
  reserva: 'Reserva de emergência',
  dividas: 'Comprometimento com dívidas',
  orcamento: 'Orçamentos',
  metas: 'Metas',
  fluxo: 'Fluxo de caixa',
};

const numberFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** Número em pt-BR com até 1 casa decimal ('2,5'), sem '-0'. */
function formatNumber(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return numberFmt.format(rounded === 0 ? 0 : rounded);
}

/** '2,5 meses', '1 mês', '0 meses' (singular entre 0 e 2, exclusive, como em pt-BR). */
function formatMonths(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return `${formatNumber(rounded)} ${rounded > 0 && rounded < 2 ? 'mês' : 'meses'}`;
}

/** Razão (0.183) em porcentagem inteira ('18%'). */
function formatPct(ratio: number): string {
  const pct = Math.round(ratio * 100);
  return `${pct === 0 ? 0 : pct}%`;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return value > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function positiveOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** 'A', 'A e B', 'A, B e mais 2 categorias'. */
function joinNames(names: string[], noun: [string, string]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} e ${names[1]}`;
  return `${names[0]}, ${names[1]} e mais ${plural(names.length - 2, noun[0], noun[1])}`;
}

/**
 * Situação da reserva de emergência (ver EmergencyFundStatus).
 * monthlyEssential: média mensal de despesas em categorias do grupo 'necessidades' nos 3 meses completos anteriores
 * ao mês de today; se 0 => 60% da média de despesas totais; se 0 => 50% de settings.monthlyIncomeEstimate; senão 0.
 * level: sem_dados (monthlyEssential = 0), critica (< 1 mês), baixa (< 3), parcial (< target), completa.
 *
 * Detalhes: `reserve` = max(0, soma dos saldos dessas contas) — um cheque especial negativo reduz a reserva.
 * As médias ignoram meses sem nenhum lançamento (como averageMonthlyExpense). 'completa' vale sempre que
 * reserve >= target (portanto gap = 0 ⇔ completa, mesmo com meta menor que 3 meses).
 */
export function emergencyFund(data: FinanceData, today: ISODate): EmergencyFundStatus {
  const accounts = data.accounts.filter((a) => !a.archived && RESERVE_ACCOUNT_TYPES.includes(a.type));
  const balances = accountBalances(accounts, data.transactions, { asOf: today });
  let total = 0;
  for (const account of accounts) total += balances[account.id] ?? 0;
  const reserve = Math.max(0, total);

  const month = monthKey(today);
  const essentialIds = data.categories
    .filter((c) => c.kind === 'despesa' && c.group === 'necessidades')
    .map((c) => c.id);
  let monthlyEssential = averageMonthlyExpense(data.transactions, month, HISTORY_MONTHS, essentialIds);
  if (monthlyEssential <= 0)
    monthlyEssential = Math.round(
      averageMonthlyExpense(data.transactions, month, HISTORY_MONTHS) * ESSENTIAL_SHARE_OF_EXPENSE,
    );
  if (monthlyEssential <= 0) {
    const estimate = data.settings.monthlyIncomeEstimate;
    monthlyEssential =
      estimate !== null && estimate > 0 ? Math.round(estimate * ESSENTIAL_SHARE_OF_INCOME) : 0;
  }

  const targetMonths = positiveOr(data.settings.emergencyFundTargetMonths, DEFAULT_EMERGENCY_MONTHS);
  const target = Math.round(monthlyEssential * targetMonths);
  const monthsCovered = monthlyEssential > 0 ? reserve / monthlyEssential : null;

  let level: EmergencyFundLevel;
  if (monthsCovered === null) level = 'sem_dados';
  else if (reserve >= target) level = 'completa';
  else if (monthsCovered < 1) level = 'critica';
  else if (monthsCovered < 3) level = 'baixa';
  else level = 'parcial';

  return {
    reserve,
    monthlyEssential,
    monthsCovered,
    targetMonths,
    target,
    gap: Math.max(0, target - reserve),
    level,
  };
}

/* ------------------------------------------------------------------ */
/* Componentes do score                                                */
/* ------------------------------------------------------------------ */

type ComponentResult = Pick<HealthComponent, 'score' | 'value' | 'tip'>;

function component(key: HealthComponent['key'], result: ComponentResult): HealthComponent {
  return { key, label: LABELS[key], weight: WEIGHTS[key], ...result };
}

/** Taxa de poupança agregada dos meses completos com dados, comparada à meta das configurações. */
function savingsComponent(history: MonthSummary[], data: FinanceData): ComponentResult {
  const targetPct = positiveOr(data.settings.savingsRateTarget, DEFAULT_SAVINGS_TARGET);
  let income = 0;
  let saved = 0;
  for (const m of history) {
    income += m.income;
    saved += m.net + m.invested;
  }
  if (income <= 0)
    return {
      score: 0,
      value: 'Sem renda registrada',
      tip: 'Registre suas receitas (salário, renda extra) para o Pat medir quanto você consegue poupar todo mês.',
    };
  const rate = saved / income;
  const score = clampScore(((rate * 100) / targetPct) * 100);
  const value = `${formatPct(rate)} da renda`;
  if (rate < 0)
    return {
      score,
      value,
      tip: 'Nos últimos meses você gastou mais do que ganhou. Corte primeiro os desejos (restaurantes, compras, lazer) para voltar ao azul.',
    };
  if (rate * 100 < targetPct) {
    const months = history.length;
    const missing = Math.ceil((income * targetPct) / 100 / months - saved / months);
    return {
      score,
      value,
      tip: `Para chegar à meta de ${formatNumber(targetPct)}% da renda, poupe mais ${formatBRL(missing)} por mês — separe esse valor assim que receber.`,
    };
  }
  return {
    score,
    value,
    tip: `Você poupa acima da meta de ${formatNumber(targetPct)}%. Direcione a sobra para a reserva de emergência e para suas metas.`,
  };
}

function reserveComponent(fund: EmergencyFundStatus): ComponentResult {
  if (fund.monthsCovered === null)
    return {
      score: 0,
      value: 'Sem dados de gastos',
      tip: 'Registre suas despesas essenciais (moradia, mercado, contas) ou informe sua renda mensal nas configurações para o Pat calcular a reserva ideal.',
    };
  const score = clampScore((fund.monthsCovered / fund.targetMonths) * 100);
  const value = formatMonths(fund.monthsCovered);
  if (fund.gap <= 0)
    return {
      score,
      value,
      tip: `Sua reserva cobre ${value} de custos essenciais. Mantenha-a em uma aplicação de liquidez diária e direcione novos aportes para suas metas.`,
    };
  return {
    score,
    value,
    tip: `Faltam ${formatBRL(fund.gap)} para ${formatMonths(fund.targetMonths)} de reserva. Guardando ${formatBRL(Math.ceil(fund.gap / 12))} por mês, você completa em 1 ano.`,
  };
}

function debtsComponent(data: FinanceData, averageIncome: Cents): ComponentResult {
  const overview = debtsOverview(data.debts, data.debtPayments);
  const active = overview.items.filter((i) => i.debt.status === 'ativa' && i.currentBalance > 0);
  if (active.length === 0)
    return {
      score: 100,
      value: 'Sem dívidas ativas',
      tip: 'Você não tem dívidas ativas. Continue assim: use o cartão só para compras que cabem no orçamento do mês.',
    };
  // Itens já vêm ordenados por taxa desc: o primeiro é a dívida mais cara.
  const worst = active[0].debt;
  const worstLabel =
    worst.interestRate > 0 ? `${worst.name} (${formatNumber(worst.interestRate)}% a.m.)` : worst.name;
  if (averageIncome <= 0)
    return {
      score: 0,
      value: `${formatBRL(overview.totalMinimum)} por mês em parcelas`,
      tip: 'Registre suas receitas para o Pat medir quanto das parcelas cabe na sua renda.',
    };
  const ratio = overview.totalMinimum / averageIncome;
  const score =
    ratio <= DEBT_RATIO_BEST
      ? 100
      : ratio >= DEBT_RATIO_WORST
        ? 0
        : clampScore(((DEBT_RATIO_WORST - ratio) / (DEBT_RATIO_WORST - DEBT_RATIO_BEST)) * 100);
  const value = `${formatPct(ratio)} da renda`;
  if (ratio <= DEBT_RATIO_BEST)
    return {
      score,
      value,
      tip: `Parcelas sob controle. Se sobrar dinheiro, antecipe o pagamento de ${worstLabel}, a dívida mais cara.`,
    };
  return {
    score,
    value,
    tip: `As parcelas comprometem ${formatPct(ratio)} da sua renda. Priorize quitar ${worstLabel} e evite novas parcelas até ficar abaixo de 30%.`,
  };
}

function budgetComponent(data: FinanceData, today: ISODate, lastComplete: MonthSummary): ComponentResult {
  const month = lastComplete.month;
  const statuses = budgetStatuses(data.budgets, data.transactions, data.categories, month, today);
  if (statuses.length === 0) {
    const top = suggestBudgets(data.transactions, data.categories, monthKey(today))[0];
    const name = top ? data.categories.find((c) => c.id === top.categoryId)?.name : undefined;
    return {
      score: NEUTRAL_SCORE,
      value: 'Nenhum orçamento',
      tip:
        top && name
          ? `Crie orçamentos para as categorias em que você mais gasta — comece por ${name} (média de ${formatBRL(top.average)} por mês).`
          : 'Crie orçamentos mensais para suas principais categorias de gasto (ex.: mercado, restaurantes e lazer).',
    };
  }
  if (lastComplete.transactionCount === 0)
    return {
      score: NEUTRAL_SCORE,
      value: 'Sem lançamentos no último mês',
      tip: 'Registre seus gastos ao longo do mês: o Pat confere os orçamentos ao fim de cada mês.',
    };
  const over = statuses.filter((s) => s.status === 'estourado');
  const within = statuses.length - over.length;
  const score = clampScore((within / statuses.length) * 100);
  const value = `${within} de ${statuses.length} dentro do limite`;
  if (over.length === 0)
    return {
      score,
      value,
      tip: 'Todos os orçamentos ficaram dentro do limite no último mês. Que tal reduzir um pouco os limites e poupar a diferença?',
    };
  const names = joinNames(
    over.map((s) => s.categoryName),
    ['categoria', 'categorias'],
  );
  const single = over.length === 1;
  return {
    score,
    value,
    tip: single
      ? `Em ${formatMonthLong(month)}, ${names} passou do limite. Ajuste esse orçamento ou corte gastos nessa categoria.`
      : `Em ${formatMonthLong(month)}, ${names} passaram do limite. Ajuste esses orçamentos ou corte gastos nessas categorias.`,
  };
}

function isGoalOnTrack(goal: GoalProgress): boolean {
  return goal.track === 'no_ritmo' || (goal.track === 'sem_prazo' && goal.averageMonthlyContribution > 0);
}

function goalsComponent(data: FinanceData, today: ISODate): ComponentResult {
  const overview = goalsOverview(data.goals, data.goalContributions, today);
  const active = overview.items.filter((g) => g.track !== 'pausada' && g.track !== 'concluida');
  if (active.length === 0)
    return overview.completedCount > 0
      ? {
          score: NEUTRAL_SCORE,
          value: `Nenhuma meta ativa (${plural(overview.completedCount, 'concluída', 'concluídas')})`,
          tip: 'Parabéns pelas metas concluídas! Crie uma nova meta para manter o hábito de poupar.',
        }
      : {
          score: NEUTRAL_SCORE,
          value: 'Nenhuma meta ativa',
          tip: 'Crie uma meta (ex.: reserva de emergência, viagem ou troca do carro) para dar um destino ao que você poupa.',
        };
  const onTrack = active.filter(isGoalOnTrack).length;
  const score = clampScore((onTrack / active.length) * 100);
  const value = `${onTrack} de ${active.length} no ritmo`;
  // Itens já vêm ordenados por prioridade e prazo: a primeira fora do ritmo é a mais importante.
  const behind = active.find((g) => !isGoalOnTrack(g));
  if (!behind)
    return { score, value, tip: 'Todas as suas metas estão no ritmo. Mantenha os aportes mensais.' };
  let tip: string;
  if (behind.track === 'vencida')
    tip = `O prazo de "${behind.name}" já passou. Defina uma nova data ou ajuste o valor da meta (faltam ${formatBRL(behind.remaining)}).`;
  else if (behind.track === 'sem_prazo')
    tip = `Defina um prazo para "${behind.name}" e programe um aporte mensal — sem aportes recentes, ela não avança.`;
  else
    tip = `Para cumprir o prazo de "${behind.name}", aporte ${formatBRL(behind.requiredMonthly ?? behind.remaining)} por mês (sua média recente é ${formatBRL(behind.averageMonthlyContribution)}).`;
  return { score, value, tip };
}

function cashflowComponent(history: MonthSummary[]): ComponentResult {
  if (history.length === 0)
    return {
      score: 0,
      value: 'Sem histórico',
      tip: 'Registre suas receitas e despesas: o Pat avalia o fluxo de caixa ao fim de cada mês.',
    };
  const negative = history.filter((m) => m.net <= 0);
  const positive = history.length - negative.length;
  const score = clampScore((positive / history.length) * 100);
  const value = `${positive} de ${plural(history.length, 'mês', 'meses')} no azul`;
  if (negative.length === 0)
    return {
      score,
      value,
      tip: 'Você fechou os últimos meses no azul. Continue acompanhando a previsão de caixa.',
    };
  const months = joinNames(
    negative.map((m) => formatMonthLong(m.month)),
    ['mês', 'meses'],
  );
  return {
    score,
    value,
    tip: `Em ${months} você gastou tudo o que ganhou (ou mais). Revise os gastos variáveis e use a previsão de caixa para antecipar meses apertados.`,
  };
}

function gradeOf(score: number): HealthGrade {
  if (score >= 80) return 'excelente';
  if (score >= 65) return 'boa';
  if (score >= 50) return 'regular';
  if (score >= 35) return 'atencao';
  return 'critica';
}

/**
 * Score de saúde financeira 0..100 (pesos: poupanca 25, reserva 25, dividas 20, orcamento 15, metas 10, fluxo 5).
 * Ver HealthReport/HealthComponent. Sempre retorna os 6 componentes, com dicas em pt-BR.
 * dataQuality: 'insuficiente' (< 1 mês com lançamentos), 'parcial' (1-2), 'boa' (>= 3) nos últimos 3 meses completos + atual.
 *
 * Componentes (meses completos = os 3 anteriores ao mês de today; meses sem lançamentos são ignorados):
 * - poupanca: taxa de poupança agregada (Σ(net + invested) / Σ renda) ÷ meta × 100; sem renda => 0.
 * - reserva: monthsCovered / targetMonths × 100; sem dados de gastos => 0.
 * - dividas: Σ mínimos das dívidas ativas ÷ renda média (3 meses completos; fallback: renda estimada).
 *   <= 10% => 100, >= 50% => 0, linear entre eles; sem dívidas => 100; com dívidas e sem renda => 0.
 * - orcamento: % de orçamentos não estourados no último mês completo; sem orçamentos ou sem lançamentos nesse mês => 50.
 * - metas: % das metas em andamento no ritmo ('no_ritmo', ou 'sem_prazo' com aportes recentes); sem metas => 50.
 * - fluxo: % dos meses completos com dados que fecharam com receita - despesa > 0; sem histórico => 0.
 * score = round(Σ score × peso / 100); grade: >= 80 excelente, >= 65 boa, >= 50 regular, >= 35 atencao, senão critica.
 */
export function financialHealth(data: FinanceData, today: ISODate): HealthReport {
  const month = monthKey(today);
  const series = monthlySeries(data.transactions, addMonthsToKey(month, -1), HISTORY_MONTHS);
  const history = series.filter((m) => m.transactionCount > 0);
  const lastComplete = series[series.length - 1];

  const estimate = data.settings.monthlyIncomeEstimate;
  const recordedIncome = averageMonthlyIncome(data.transactions, month, HISTORY_MONTHS);
  const averageIncome =
    recordedIncome > 0 ? recordedIncome : estimate !== null && estimate > 0 ? estimate : 0;

  const components: HealthComponent[] = [
    component('poupanca', savingsComponent(history, data)),
    component('reserva', reserveComponent(emergencyFund(data, today))),
    component('dividas', debtsComponent(data, averageIncome)),
    component('orcamento', budgetComponent(data, today, lastComplete)),
    component('metas', goalsComponent(data, today)),
    component('fluxo', cashflowComponent(history)),
  ];

  let weighted = 0;
  for (const c of components) weighted += c.score * c.weight;
  const score = clampScore(weighted / 100);

  const qualityWindow = new Set<MonthKey>(lastMonths(month, HISTORY_MONTHS + 1));
  const monthsWithData = new Set<MonthKey>();
  for (const tx of data.transactions) {
    if (!isFlow(tx)) continue;
    const key = monthKey(tx.date);
    if (qualityWindow.has(key)) monthsWithData.add(key);
  }
  const dataQuality: HealthReport['dataQuality'] =
    monthsWithData.size === 0 ? 'insuficiente' : monthsWithData.size < 3 ? 'parcial' : 'boa';

  return { score, grade: gradeOf(score), components, dataQuality };
}
