import {
  accountBalance,
  accountBalances,
  averageMonthlyExpense,
  averageMonthlyIncome,
  budgetStatuses,
  cashflowForecast,
  categoryBreakdown,
  debtsOverview,
  detectRecurringCandidates,
  emergencyFund,
  goalsOverview,
  groupBreakdown,
  monthSummary,
  monthlyToAnnualRate,
  netWorthHistory,
  upcomingItems,
  type RecurringCandidate,
} from '@/analytics';
import { ROUTES, newTransactionPath } from '@/app/navigation';
import {
  addMonthsToKey,
  daysInMonth,
  daysInMonthKey,
  diffDays,
  formatDateBR,
  formatMonthLong,
  isInMonth,
  makeISO,
  monthKey,
  parseISO,
  startOfMonth,
} from '@/domain/dates';
import { CATEGORY_IDS } from '@/domain/defaults';
import { formatBRL, formatPercent } from '@/domain/money';
import { plural } from '@/domain/text';
import {
  DEBT_TYPE_LABELS,
  type Category,
  type FinanceData,
  type ID,
  type ISODate,
  type MonthKey,
  type Transaction,
} from '@/domain/types';
import {
  categoryLabel,
  dateRelative,
  formatMonthsCount,
  formatNumber,
  joinList,
  median,
  monthlyEquivalent,
} from './format';
import type { Insight, InsightSeverity } from './types';

/** Máximo de insights devolvidos. */
const MAX_INSIGHTS = 12;
/** Aumento mínimo sobre a média (30%) e diferença mínima (R$ 100) para "gasto acima do normal". */
const ABOVE_AVERAGE_RATIO = 1.3;
const ABOVE_AVERAGE_MIN_DIFF = 10000;
/** Gasto incomum: mais de 3x a mediana da categoria e acima de R$ 200 (mínimo de 3 lançamentos de histórico). */
const UNUSUAL_FACTOR = 3;
const UNUSUAL_MIN_AMOUNT = 20000;
const UNUSUAL_MIN_HISTORY = 3;
const UNUSUAL_HISTORY_MONTHS = 6;
/** Assinaturas acima de 5% da renda. */
const SUBSCRIPTIONS_SHARE = 0.05;
/** Desvio (em pontos percentuais) a partir do qual a regra 50/30/20 merece um alerta. */
const RULE_503020_TOLERANCE = 0.1;
/** Uso do limite do cartão acima de 30%. */
const CARD_USAGE_LIMIT = 0.3;
/** Dívida cara: juros a partir de 4% a.m. */
const EXPENSIVE_DEBT_RATE = 4;
/** Dias sem lançamentos para lembrar o usuário. */
const STALE_DAYS = 7;
/** Abaixo disso, consideramos que há poucos dados. */
const FEW_TRANSACTIONS = 10;

const SEVERITY_RANK: Record<InsightSeverity, number> = { critico: 0, atencao: 1, info: 2, positivo: 3 };

interface InsightContext {
  data: FinanceData;
  today: ISODate;
  month: MonthKey;
  prevMonth: MonthKey;
  categories: Map<ID, Category>;
  /** Calculado sob demanda (usado por mais de uma regra). */
  candidates: () => RecurringCandidate[];
}

type Rule = (ctx: InsightContext) => Insight[];

function isGoalGroup(categoryId: ID | null, ctx: InsightContext): boolean {
  if (categoryId === null) return false;
  return ctx.categories.get(categoryId)?.group === 'objetivos';
}

/** Despesas de consumo (exclui o grupo 'objetivos': investimentos e pagamento de dívidas). */
function isConsumption(tx: Transaction, ctx: InsightContext): boolean {
  return tx.type === 'despesa' && !isGoalGroup(tx.categoryId, ctx);
}

/* ------------------------------------------------------------------ */
/* Fluxo de caixa                                                      */
/* ------------------------------------------------------------------ */

const negativeBalances: Rule = ({ data, today, month }) => {
  const accounts = data.accounts.filter((a) => !a.archived && a.type !== 'cartao_credito');
  if (accounts.length === 0) return [];
  const balances = accountBalances(accounts, data.transactions, { asOf: today });
  return accounts
    .filter((a) => balances[a.id] < 0)
    .map((a) => ({
      id: `saldo-negativo:${a.id}:${month}`,
      severity: 'critico',
      area: 'fluxo',
      title: `Saldo negativo em ${a.name}`,
      message: `${a.name} está com saldo de ${formatBRL(balances[a.id])}. Cubra esse valor o quanto antes (transfira de outra conta ou adie gastos) para não pagar juros de cheque especial.`,
      priority: 95,
      action: { label: 'Ver contas', to: ROUTES.accounts },
    }));
};

const forecastNegative: Rule = ({ data, today, month }) => {
  if (!data.accounts.some((a) => !a.archived && a.type !== 'investimento')) return [];
  const forecast = cashflowForecast(data, today);
  if (forecast.projectedEndBalance < 0) {
    return [
      {
        id: `previsao-negativa:${month}`,
        severity: 'critico',
        area: 'fluxo',
        title: 'Previsão: mês no vermelho',
        message: `Somando as contas a pagar e o seu ritmo de gastos, o saldo deve fechar ${formatMonthLong(month)} em ${formatBRL(forecast.projectedEndBalance)}. Adie compras que não são essenciais e veja o que dá para renegociar.`,
        priority: 90,
        action: { label: 'Ver previsão', to: ROUTES.dashboard },
      },
    ];
  }
  if (forecast.willGoNegative && forecast.lowestPoint.date > today) {
    return [
      {
        id: `previsao-saldo-negativo:${month}`,
        severity: 'critico',
        area: 'fluxo',
        title: 'Saldo pode ficar negativo',
        message: `Pela previsão, seu saldo chega a ${formatBRL(forecast.lowestPoint.balance)} ${dateRelative(forecast.lowestPoint.date, today)}, antes de voltar ao azul. Antecipe uma transferência ou reprograme algum pagamento.`,
        priority: 84,
        action: { label: 'Ver previsão', to: ROUTES.dashboard },
      },
    ];
  }
  return [];
};

const bills: Rule = ({ data, today, month }) => {
  const items = upcomingItems(data, today, 3).filter((i) => i.type === 'despesa');
  const out: Insight[] = [];
  const overdue = items.filter((i) => i.overdue);
  if (overdue.length > 0) {
    const total = overdue.reduce((s, i) => s + i.amount, 0);
    const latest = overdue.reduce((d, i) => (i.date > d ? i.date : d), overdue[0].date);
    const names = overdue.slice(0, 3).map((i) => `${i.description} (${formatDateBR(i.date)})`);
    if (overdue.length > 3) names.push(`mais ${overdue.length - 3}`);
    out.push({
      id: `contas-vencidas:${latest}:${month}`,
      severity: 'critico',
      area: 'fluxo',
      title: overdue.length === 1 ? `Conta vencida: ${overdue[0].description}` : `${overdue.length} contas vencidas`,
      message: `${overdue.length === 1 ? 'Há 1 conta vencida' : `Há ${overdue.length} contas vencidas`} somando ${formatBRL(total)}: ${joinList(names)}. Pague o quanto antes para evitar multa e juros — ou marque como paga, se já pagou.`,
      priority: 92,
      action: { label: 'Ver lançamentos', to: ROUTES.transactions },
    });
  }
  const dueSoon = items.filter((i) => !i.overdue && i.date >= today);
  if (dueSoon.length > 0) {
    const total = dueSoon.reduce((s, i) => s + i.amount, 0);
    const names = dueSoon
      .slice(0, 3)
      .map((i) => `${i.description} (${formatBRL(i.amount)}, ${dateRelative(i.date, today)})`);
    if (dueSoon.length > 3) names.push(`mais ${dueSoon.length - 3}`);
    out.push({
      id: `contas-vencendo:${dueSoon[0].date}:${month}`,
      severity: 'atencao',
      area: 'fluxo',
      title:
        dueSoon.length === 1
          ? `${dueSoon[0].description} vence ${dateRelative(dueSoon[0].date, today)}`
          : `${dueSoon.length} contas vencem nos próximos dias`,
      message: `${dueSoon.length === 1 ? 'Vence em breve' : 'Vencem em breve'}: ${joinList(names)}. Total: ${formatBRL(total)}. Confira se há saldo na conta.`,
      priority: 75,
      action: { label: 'Ver lançamentos', to: ROUTES.transactions },
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Orçamentos e gastos                                                 */
/* ------------------------------------------------------------------ */

const budgets: Rule = ({ data, today, month }) => {
  const statuses = budgetStatuses(data.budgets, data.transactions, data.categories, month, today);
  const daysLeft = Math.max(1, daysInMonthKey(month) - parseISO(today).day + 1);
  const out: Insight[] = [];
  for (const s of statuses) {
    const label = categoryLabel({ icon: s.icon, name: s.categoryName });
    if (s.status === 'estourado') {
      out.push({
        id: `orcamento-estourado:${s.categoryId}:${month}`,
        severity: 'critico',
        area: 'orcamento',
        title: `Orçamento de ${s.categoryName} estourado`,
        message: `Você já gastou ${formatBRL(s.spent)} em ${label}, ${formatBRL(s.spent - s.budgeted)} acima do orçamento de ${formatBRL(s.budgeted)}. Segure os gastos nessa categoria até o fim do mês (ou ajuste o limite, se ele estiver irreal).`,
        priority: 85,
        action: { label: 'Ver orçamentos', to: ROUTES.budgets },
      });
    } else if (s.status === 'alerta') {
      const nearLimit = s.percent >= 0.8;
      out.push({
        id: `orcamento-alerta:${s.categoryId}:${month}`,
        severity: 'atencao',
        area: 'orcamento',
        title: nearLimit
          ? `Orçamento de ${s.categoryName} quase no limite`
          : `${s.categoryName}: ritmo acima do orçamento`,
        message: nearLimit
          ? `Você já usou ${formatPercent(s.percent)} do orçamento de ${label} (${formatBRL(s.spent)} de ${formatBRL(s.budgeted)}). Restam ${formatBRL(s.remaining)} para ${plural(daysLeft, 'dia', 'dias')} — cerca de ${formatBRL(Math.floor(s.remaining / daysLeft))} por dia.`
          : `No ritmo atual, ${label} deve fechar o mês em ${formatBRL(s.projected)}, acima do orçamento de ${formatBRL(s.budgeted)}. Diminua um pouco o ritmo para caber no limite.`,
        priority: nearLimit ? 70 : 66,
        action: { label: 'Ver orçamentos', to: ROUTES.budgets },
      });
    }
  }
  return out;
};

const aboveAverage: Rule = (ctx) => {
  const { data, month } = ctx;
  const rows: { insight: Insight; diff: number }[] = [];
  for (const row of categoryBreakdown(data.transactions, data.categories, month, 'despesa')) {
    if (row.categoryId === null || isGoalGroup(row.categoryId, ctx)) continue;
    const average = averageMonthlyExpense(data.transactions, month, 3, [row.categoryId]);
    if (average <= 0) continue;
    const diff = row.total - average;
    if (row.total < average * ABOVE_AVERAGE_RATIO || diff <= ABOVE_AVERAGE_MIN_DIFF) continue;
    rows.push({
      diff,
      insight: {
        id: `gasto-acima-media:${row.categoryId}:${month}`,
        severity: 'atencao',
        area: 'gastos',
        title: `${row.name} acima do normal`,
        message: `Você já gastou ${formatBRL(row.total)} com ${categoryLabel(row)} em ${formatMonthLong(month)} — ${formatPercent(diff / average)} acima da sua média dos últimos 3 meses (${formatBRL(average)}). Vale rever esses gastos antes que o mês acabe.`,
        priority: 60,
        action: { label: 'Ver lançamentos', to: ROUTES.transactions },
      },
    });
  }
  return rows
    .sort((a, b) => b.diff - a.diff || (a.insight.id < b.insight.id ? -1 : 1))
    .slice(0, 3)
    .map((r) => r.insight);
};

const unusualExpenses: Rule = (ctx) => {
  const { data, today, month } = ctx;
  const historyStart = startOfMonth(addMonthsToKey(month, -UNUSUAL_HISTORY_MONTHS));
  const monthStart = startOfMonth(month);
  const historyByCategory = new Map<ID, number[]>();
  for (const tx of data.transactions) {
    if (tx.type !== 'despesa' || tx.categoryId === null) continue;
    if (tx.date < historyStart || tx.date >= monthStart) continue;
    const list = historyByCategory.get(tx.categoryId) ?? [];
    list.push(tx.amount);
    historyByCategory.set(tx.categoryId, list);
  }
  const found: { insight: Insight; ratio: number }[] = [];
  for (const tx of data.transactions) {
    if (!isConsumption(tx, ctx) || tx.categoryId === null || tx.recurringId !== null) continue;
    if (!isInMonth(tx.date, month) || tx.date > today || tx.amount <= UNUSUAL_MIN_AMOUNT) continue;
    const history = historyByCategory.get(tx.categoryId) ?? [];
    if (history.length < UNUSUAL_MIN_HISTORY) continue;
    const typical = median(history);
    if (typical <= 0 || tx.amount <= typical * UNUSUAL_FACTOR) continue;
    const ratio = tx.amount / typical;
    const category = ctx.categories.get(tx.categoryId);
    found.push({
      ratio,
      insight: {
        id: `gasto-incomum:${tx.id}:${month}`,
        severity: 'info',
        area: 'gastos',
        title: `Gasto fora do padrão em ${category?.name ?? 'uma categoria'}`,
        message: `“${tx.description}” (${formatBRL(tx.amount)}, ${formatDateBR(tx.date)}) é ${formatNumber(Math.floor(ratio * 10) / 10)}x o seu gasto típico em ${categoryLabel(category)} (${formatBRL(typical)}). Se foi planejado, tudo certo; se não, vale conferir.`,
        priority: 45,
        action: { label: 'Ver lançamentos', to: ROUTES.transactions },
      },
    });
  }
  return found
    .sort((a, b) => b.ratio - a.ratio || (a.insight.id < b.insight.id ? -1 : 1))
    .slice(0, 2)
    .map((f) => f.insight);
};

const spendingLessThanLastMonth: Rule = (ctx) => {
  const { data, today, month, prevMonth } = ctx;
  const { day } = parseISO(today);
  if (day < 5) return [];
  const [py, pm] = prevMonth.split('-').map(Number);
  const prevCut = makeISO(py, pm, Math.min(day, daysInMonth(py, pm)));
  let current = 0;
  let previous = 0;
  for (const tx of data.transactions) {
    if (!isConsumption(tx, ctx)) continue;
    if (isInMonth(tx.date, month) && tx.date <= today) current += tx.amount;
    else if (isInMonth(tx.date, prevMonth) && tx.date <= prevCut) previous += tx.amount;
  }
  const saved = previous - current;
  if (previous <= 0 || current >= previous * 0.9 || saved < 5000) return [];
  return [
    {
      id: `gastos-menores:${month}`,
      severity: 'positivo',
      area: 'gastos',
      title: 'Gastando menos que no mês passado',
      message: `Até hoje você gastou ${formatBRL(current)} em ${formatMonthLong(month)}, ${formatBRL(saved)} a menos (${formatPercent(saved / previous)}) que no mesmo período de ${formatMonthLong(prevMonth)}. Continue assim!`,
      priority: 22,
    },
  ];
};

/* ------------------------------------------------------------------ */
/* Poupança, reserva e regra 50/30/20                                  */
/* ------------------------------------------------------------------ */

const savingsRate: Rule = ({ data, month, prevMonth }) => {
  const prev = monthSummary(data.transactions, prevMonth);
  if (prev.income <= 0 || prev.savingsRate === null) return [];
  const targetPct = data.settings.savingsRateTarget > 0 ? data.settings.savingsRateTarget : 20;
  const target = targetPct / 100;
  const saved = prev.net + prev.invested;
  const prevLong = formatMonthLong(prevMonth);
  if (prev.savingsRate >= target) {
    return [
      {
        id: `poupanca-meta:${month}`,
        severity: 'positivo',
        area: 'economia',
        title: 'Meta de poupança batida',
        message: `Mandou bem! Em ${prevLong} você poupou ${formatPercent(prev.savingsRate)} da renda (${formatBRL(saved)}), acima da meta de ${formatNumber(targetPct)}%. Direcione a sobra para a reserva de emergência e para suas metas.`,
        priority: 30,
        action: { label: 'Ver metas', to: ROUTES.goals },
      },
    ];
  }
  if (saved < 0) {
    return [
      {
        id: `poupanca-abaixo:${month}`,
        severity: 'atencao',
        area: 'economia',
        title: 'Mês passado no vermelho',
        message: `Em ${prevLong} você gastou ${formatBRL(-saved)} a mais do que ganhou. Comece cortando os desejos (restaurantes, compras, lazer) e defina orçamentos para as categorias que mais pesam.`,
        priority: 72,
        action: { label: 'Ver orçamentos', to: ROUTES.budgets },
      },
    ];
  }
  const missing = Math.ceil(prev.income * target - saved);
  return [
    {
      id: `poupanca-abaixo:${month}`,
      severity: 'atencao',
      area: 'economia',
      title: 'Poupança abaixo da meta',
      message: `Em ${prevLong} você poupou ${formatPercent(prev.savingsRate)} da renda (${formatBRL(saved)}), abaixo da sua meta de ${formatNumber(targetPct)}%. Para chegar lá, separe mais ${formatBRL(missing)} assim que o salário cair.`,
      priority: 64,
      action: { label: 'Ver orçamentos', to: ROUTES.budgets },
    },
  ];
};

const emergency: Rule = ({ data, today, month }) => {
  const fund = emergencyFund(data, today);
  if (fund.monthsCovered === null) return [];
  if (fund.level === 'critica' || fund.level === 'baixa') {
    return [
      {
        id: `reserva-baixa:${month}`,
        severity: 'atencao',
        area: 'reserva',
        title: fund.level === 'critica' ? 'Reserva de emergência crítica' : 'Reserva de emergência baixa',
        message: `Sua reserva (${formatBRL(fund.reserve)}) cobre ${formatMonthsCount(fund.monthsCovered)} do seu custo essencial de ${formatBRL(fund.monthlyEssential)} por mês. A meta é ${formatMonthsCount(fund.targetMonths)} (${formatBRL(fund.target)}): guardando ${formatBRL(Math.ceil(fund.gap / 12))} por mês, você chega lá em 1 ano.`,
        priority: fund.level === 'critica' ? 68 : 55,
        action: { label: 'Ver metas', to: ROUTES.goals },
      },
    ];
  }
  if (fund.level === 'completa') {
    return [
      {
        id: `reserva-completa:${month}`,
        severity: 'positivo',
        area: 'reserva',
        title: 'Reserva de emergência completa',
        message: `Sua reserva de ${formatBRL(fund.reserve)} cobre ${formatMonthsCount(fund.monthsCovered)} de custos essenciais — a meta é ${formatMonthsCount(fund.targetMonths)}. Agora dá para focar nas outras metas.`,
        priority: 25,
      },
    ];
  }
  return [];
};

const rule503020: Rule = ({ data, month, prevMonth }) => {
  const g = groupBreakdown(data.transactions, data.categories, prevMonth);
  if (g.income <= 0) return [];
  const needs = g.shares.necessidades ?? 0;
  const wants = g.shares.desejos ?? 0;
  const needsDev = needs - 0.5;
  const wantsDev = wants - 0.3;
  if (Math.max(needsDev, wantsDev) < RULE_503020_TOLERANCE) return [];
  const prevLong = formatMonthLong(prevMonth);
  const isNeeds = needsDev >= wantsDev;
  return [
    {
      id: `regra-50-30-20:${month}`,
      severity: 'info',
      area: 'economia',
      title: isNeeds ? 'Custos essenciais acima de 50% da renda' : 'Desejos acima de 30% da renda',
      message: isNeeds
        ? `Em ${prevLong}, as necessidades (moradia, contas, mercado, transporte…) levaram ${formatPercent(needs)} da renda. A regra 50/30/20 sugere até 50%: vale renegociar contas fixas como planos, seguros e aluguel.`
        : `Em ${prevLong}, os desejos (restaurantes, lazer, compras, assinaturas…) levaram ${formatPercent(wants)} da renda. A regra 50/30/20 sugere até 30% — reduzir aqui é o caminho mais rápido para poupar.`,
      priority: 28,
      action: { label: 'Ver relatórios', to: ROUTES.reports },
    },
  ];
};

/* ------------------------------------------------------------------ */
/* Dívidas e cartão                                                    */
/* ------------------------------------------------------------------ */

const expensiveDebts: Rule = ({ data, month }) => {
  const overview = debtsOverview(data.debts, data.debtPayments);
  const expensive = overview.items.filter(
    (i) =>
      i.debt.status === 'ativa' &&
      i.currentBalance > 0 &&
      (i.debt.interestRate >= EXPENSIVE_DEBT_RATE || i.debt.type === 'cartao' || i.debt.type === 'cheque_especial'),
  );
  return expensive.slice(0, 2).map((item, index) => {
    const { debt } = item;
    const message =
      debt.interestRate > 0
        ? `${debt.name} cobra ${formatNumber(debt.interestRate)}% ao mês (cerca de ${formatNumber(monthlyToAnnualRate(debt.interestRate))}% ao ano): são ${formatBRL(item.monthlyInterest)} de juros por mês sobre ${formatBRL(item.currentBalance)}. Priorize quitar essa dívida — direcione para ela qualquer sobra antes de investir.`
        : `${debt.name} é uma dívida de ${DEBT_TYPE_LABELS[debt.type].toLowerCase()}, tipo que costuma ter os juros mais altos do mercado. Saldo: ${formatBRL(item.currentBalance)}. Priorize quitá-la ou negocie um parcelamento com juros menores.`;
    return {
      id: `divida-cara:${debt.id}:${month}`,
      severity: 'critico' as const,
      area: 'dividas' as const,
      title: `Priorize quitar ${debt.name}`,
      message,
      priority: 88 - index * 2,
      action: { label: 'Ver dívidas', to: ROUTES.debts },
    };
  });
};

const creditCardUsage: Rule = ({ data, month }) => {
  const out: Insight[] = [];
  for (const account of data.accounts) {
    if (account.archived || account.type !== 'cartao_credito' || !account.creditLimit || account.creditLimit <= 0)
      continue;
    const used = Math.max(0, -accountBalance(account, data.transactions, { includePending: true }));
    const ratio = used / account.creditLimit;
    if (ratio <= CARD_USAGE_LIMIT) continue;
    out.push({
      id: `cartao-limite:${account.id}:${month}`,
      severity: 'atencao',
      area: 'dividas',
      title: `${account.name}: ${formatPercent(ratio)} do limite usado`,
      message: `Você está usando ${formatBRL(used)} de ${formatBRL(account.creditLimit)} do limite (${formatPercent(ratio)}), contando as parcelas futuras. Acima de 30%, a fatura começa a apertar o orçamento: segure novas compras no cartão até esse valor baixar.`,
      priority: ratio > 0.7 ? 62 : 58,
      action: { label: 'Ver contas', to: ROUTES.accounts },
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Metas e patrimônio                                                  */
/* ------------------------------------------------------------------ */

const goals: Rule = ({ data, today, month, prevMonth }) => {
  const overview = goalsOverview(data.goals, data.goalContributions, today);
  const out: Insight[] = [];
  for (const g of overview.items) {
    const label = categoryLabel({ icon: g.icon, name: g.name });
    if (g.track === 'atrasada') {
      out.push({
        id: `meta-atrasada:${g.goalId}:${month}`,
        severity: 'atencao',
        area: 'metas',
        title: `Meta ${g.name} atrasada`,
        message: `Para cumprir o prazo de ${label} (${formatDateBR(g.targetDate ?? today)}), aporte ${formatBRL(g.requiredMonthly ?? g.remaining)} por mês — sua média recente é ${formatBRL(g.averageMonthlyContribution)}. Aumente os aportes ou ajuste o prazo.`,
        priority: 50,
        action: { label: 'Ver metas', to: ROUTES.goals },
      });
    } else if (g.track === 'vencida') {
      out.push({
        id: `meta-vencida:${g.goalId}:${month}`,
        severity: 'atencao',
        area: 'metas',
        title: `Prazo da meta ${g.name} venceu`,
        message: `O prazo de ${label} (${formatDateBR(g.targetDate ?? today)}) passou e ainda faltam ${formatBRL(g.remaining)}. Defina uma nova data para continuar acompanhando.`,
        priority: 52,
        action: { label: 'Ver metas', to: ROUTES.goals },
      });
    } else if (g.track === 'concluida') {
      const done = g.projectedCompletionDate;
      if (g.saved <= 0 || done === null || (monthKey(done) !== month && monthKey(done) !== prevMonth)) continue;
      out.push({
        id: `meta-concluida:${g.goalId}:${month}`,
        severity: 'positivo',
        area: 'metas',
        title: `Meta ${g.name} concluída! 🎉`,
        message: `Você juntou ${formatBRL(g.saved)} e completou ${label}. Parabéns! Que tal definir o próximo objetivo?`,
        priority: 35,
        action: { label: 'Ver metas', to: ROUTES.goals },
      });
    } else if (g.track !== 'pausada' && g.percent >= 0.9) {
      out.push({
        id: `meta-quase:${g.goalId}:${month}`,
        severity: 'positivo',
        area: 'metas',
        title: `Falta pouco para ${g.name}`,
        message: `${label} já está em ${formatPercent(g.percent)}: faltam só ${formatBRL(g.remaining)}. Mais um aporte e está feito!`,
        priority: 33,
        action: { label: 'Ver metas', to: ROUTES.goals },
      });
    }
  }
  return out;
};

const netWorthGrowth: Rule = ({ data, month, prevMonth }) => {
  if (data.accounts.length === 0 && data.assets.length === 0) return [];
  const [before, after] = netWorthHistory(data, prevMonth, 2);
  const diff = after.netWorth - before.netWorth;
  if (diff <= 0 || (diff < 10000 && diff < Math.abs(before.netWorth) * 0.01)) return [];
  return [
    {
      id: `patrimonio-cresceu:${month}`,
      severity: 'positivo',
      area: 'patrimonio',
      title: 'Patrimônio em alta',
      message: `Seu patrimônio líquido cresceu ${formatBRL(diff)} em ${formatMonthLong(prevMonth)}: de ${formatBRL(before.netWorth)} para ${formatBRL(after.netWorth)}. É o resultado de poupar e reduzir dívidas — continue!`,
      priority: 20,
      action: { label: 'Ver patrimônio', to: ROUTES.netWorth },
    },
  ];
};

/* ------------------------------------------------------------------ */
/* Recorrências e assinaturas                                          */
/* ------------------------------------------------------------------ */

const recurringCandidates: Rule = ({ month, candidates }) => {
  const list = candidates();
  if (list.length === 0) return [];
  const names = list.slice(0, 3).map((c) => `${c.description} (${formatBRL(c.amount)})`);
  if (list.length > 3) names.push(`mais ${list.length - 3}`);
  return [
    {
      id: `recorrencias-detectadas:${month}`,
      severity: 'info',
      area: 'recorrencia',
      title: list.length === 1 ? 'Lançamento recorrente detectado' : `${list.length} lançamentos recorrentes detectados`,
      message: `Encontrei lançamentos que se repetem todo mês e ainda não estão em Recorrências: ${joinList(names)}. Cadastre-os para eu prever suas contas e avisar antes do vencimento.`,
      priority: 30,
      action: { label: 'Ver recorrências', to: ROUTES.recurring },
    },
  ];
};

const subscriptions: Rule = ({ data, month, candidates }) => {
  const id = CATEGORY_IDS.assinaturas;
  let total = 0;
  for (const r of data.recurring) {
    if (r.active && r.type === 'despesa' && r.categoryId === id) total += monthlyEquivalent(r.amount, r.frequency);
  }
  for (const c of candidates()) if (c.type === 'despesa' && c.categoryId === id) total += c.amount;
  const recorded = averageMonthlyIncome(data.transactions, month, 3);
  const estimate = data.settings.monthlyIncomeEstimate ?? 0;
  const income = recorded > 0 ? recorded : estimate;
  if (income <= 0 || total <= income * SUBSCRIPTIONS_SHARE) return [];
  return [
    {
      id: `assinaturas-caras:${month}`,
      severity: 'info',
      area: 'recorrencia',
      title: 'Assinaturas pesando no bolso',
      message: `Suas assinaturas somam ${formatBRL(total)} por mês (${formatPercent(total / income)} da renda) — ${formatBRL(total * 12)} por ano. Revise as que você pouco usa: cada uma cancelada vira economia todo mês.`,
      priority: 32,
      action: { label: 'Ver recorrências', to: ROUTES.recurring },
    },
  ];
};

/* ------------------------------------------------------------------ */
/* Qualidade dos dados                                                 */
/* ------------------------------------------------------------------ */

const dataQuality: Rule = ({ data, today, month }) => {
  const out: Insight[] = [];
  if (!data.accounts.some((a) => !a.archived)) {
    out.push({
      id: `dados-sem-contas:${month}`,
      severity: 'info',
      area: 'dados',
      title: 'Cadastre suas contas',
      message:
        'Comece cadastrando onde seu dinheiro fica: conta corrente, poupança, carteira e cartão de crédito. Com os saldos iniciais, eu calculo quanto você tem e faço previsões.',
      priority: 60,
      action: { label: 'Cadastrar conta', to: ROUTES.accounts },
    });
  }
  if (data.transactions.length === 0) {
    out.push({
      id: `dados-sem-lancamentos:${month}`,
      severity: 'info',
      area: 'dados',
      title: 'Registre seu primeiro lançamento',
      message:
        'Anote seus gastos e receitas — no app ou falando comigo, por exemplo: “gastei 45 no mercado”. Quanto mais lançamentos, melhores as minhas análises.',
      priority: 55,
      action: { label: 'Novo lançamento', to: newTransactionPath('despesa') },
    });
    return out;
  }
  let last: ISODate | null = null;
  for (const tx of data.transactions) if (tx.date <= today && (last === null || tx.date > last)) last = tx.date;
  if (last !== null) {
    const gap = diffDays(last, today);
    if (gap >= STALE_DAYS) {
      out.push({
        id: `dados-parado:${last}:${month}`,
        severity: 'info',
        area: 'dados',
        title: 'Lançamentos em dia?',
        message: `Seu último lançamento foi há ${gap} dias (${formatDateBR(last)}). Registre os gastos recentes para manter saldos, orçamentos e previsões confiáveis — é rapidinho aqui pelo chat.`,
        priority: 48,
        action: { label: 'Novo lançamento', to: newTransactionPath('despesa') },
      });
    }
  }
  const flows = data.transactions.filter((t) => t.type !== 'transferencia');
  if (flows.length > 0 && flows.length < FEW_TRANSACTIONS) {
    out.push({
      id: `poucos-dados:${month}`,
      severity: 'info',
      area: 'dados',
      title: 'Quanto mais dados, melhor',
      message: `Você tem ${plural(flows.length, 'lançamento', 'lançamentos')} até agora. Com algumas semanas de registros eu consigo identificar padrões, prever o fim do mês e sugerir orçamentos sob medida.`,
      priority: 35,
    });
  }
  const recentStart = startOfMonth(addMonthsToKey(month, -3));
  const hasIncome = flows.some((t) => t.type === 'receita' && t.date >= recentStart);
  if (flows.length > 0 && !hasIncome && !(data.settings.monthlyIncomeEstimate && data.settings.monthlyIncomeEstimate > 0)) {
    out.push({
      id: `dados-sem-renda:${month}`,
      severity: 'info',
      area: 'dados',
      title: 'Registre sua renda',
      message:
        'Ainda não há receitas registradas nos últimos meses. Registre seu salário e outras entradas (ex.: “recebi 5000 de salário”) para eu calcular quanto você consegue poupar.',
      priority: 40,
      action: { label: 'Nova receita', to: newTransactionPath('receita') },
    });
  }
  return out;
};

const RULES: Rule[] = [
  negativeBalances,
  forecastNegative,
  bills,
  budgets,
  aboveAverage,
  unusualExpenses,
  savingsRate,
  emergency,
  expensiveDebts,
  goals,
  recurringCandidates,
  subscriptions,
  rule503020,
  spendingLessThanLastMonth,
  creditCardUsage,
  netWorthGrowth,
  dataQuality,
];

function hasAnyData(data: FinanceData): boolean {
  return (
    data.accounts.length > 0 ||
    data.transactions.length > 0 ||
    data.debts.length > 0 ||
    data.goals.length > 0 ||
    data.assets.length > 0
  );
}

/**
 * Gera insights proativos (alertas, conquistas e recomendações) a partir dos dados, ordenados por prioridade desc.
 * Remove os dispensados em settings.dismissedInsights para o mês corrente. Determinístico para (data, today).
 *
 * Detalhes:
 * - Cada insight tem id estável para a mesma situação no mesmo mês (termina com ':YYYY-MM' do mês de `today`).
 * - Sem nenhum dado (contas, lançamentos, dívidas, metas, bens): apenas insights da área 'dados' com orientação.
 * - Empates de prioridade: severidade (crítico → positivo), depois id. Limite de 12.
 */
export function generateInsights(data: FinanceData, today: ISODate): Insight[] {
  const month = monthKey(today);
  let cachedCandidates: RecurringCandidate[] | null = null;
  const ctx: InsightContext = {
    data,
    today,
    month,
    prevMonth: addMonthsToKey(month, -1),
    categories: new Map(data.categories.map((c) => [c.id, c])),
    candidates: () => (cachedCandidates ??= detectRecurringCandidates(data, today)),
  };
  const rules = hasAnyData(data) ? RULES : [dataQuality];
  const dismissed = data.settings.dismissedInsights ?? {};
  return rules
    .flatMap((rule) => rule(ctx))
    .filter((insight) => dismissed[insight.id] !== month)
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .slice(0, MAX_INSIGHTS);
}
