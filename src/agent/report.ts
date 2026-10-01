import {
  budgetStatuses,
  categoryBreakdown,
  compareMonthsByCategory,
  goalsOverview,
  groupBreakdown,
  monthSummary,
  monthlySeries,
  suggestBudgets,
  topExpenses,
  type CategoryTotal,
} from '@/analytics';
import {
  addMonthsToKey,
  endOfMonth,
  formatDateBR,
  formatMonthLong,
  formatMonthShort,
  isInMonth,
  monthKey,
} from '@/domain/dates';
import { formatBRL, formatPercent, formatSignedBRL } from '@/domain/money';
import { capitalize } from '@/domain/text';
import type { FinanceData, ISODate, MonthKey } from '@/domain/types';
import { categoryLabel, formatNumber, joinList, relativeChange, sentences, toneOfAmount } from './format';
import type { AgentCard, MonthlyReport } from './types';

const MAX_PIE_SLICES = 6;

function pieCard(rows: CategoryTotal[]): AgentCard | null {
  if (rows.length < 2) return null;
  const head = rows.slice(0, MAX_PIE_SLICES - 1);
  const rest = rows.slice(MAX_PIE_SLICES - 1);
  const data = head.map((r) => ({ label: r.name, value: r.total, color: r.color }));
  if (rest.length === 1) data.push({ label: rest[0].name, value: rest[0].total, color: rest[0].color });
  else if (rest.length > 1)
    data.push({ label: 'Outras', value: rest.reduce((s, r) => s + r.total, 0), color: '#94a3b8' });
  return { type: 'chart', title: 'Despesas por categoria', chart: 'pie', data };
}

/**
 * Relatório narrativo do mês (o "fechamento do mês" escrito pelo agente).
 *
 * Parágrafos (quando há dados): aviso de fechamento parcial (mês corrente), receitas/despesas/sobra e taxa de
 * poupança, maiores categorias e regra 50/30/20, variações vs mês anterior, orçamentos, metas e uma recomendação
 * para o próximo mês. Cards: stats (receitas, despesas, resultado), lista e pizza por categoria, barras dos
 * últimos 6 meses e progresso dos orçamentos. Valores de gráficos em centavos. Mês sem dados => texto orientando.
 */
export function monthlyReport(data: FinanceData, month: MonthKey, today: ISODate): MonthlyReport {
  const long = formatMonthLong(month);
  const title = `Fechamento de ${long}`;
  const current = monthKey(today);
  const s = monthSummary(data.transactions, month);

  if (s.transactionCount === 0) {
    const paragraphs =
      month > current
        ? [
            `${capitalize(long)} ainda não começou. Quando o mês chegar, registre suas receitas e despesas e eu escrevo o fechamento.`,
          ]
        : [
            `Não há lançamentos em ${long}. Registre suas receitas e despesas ao longo do mês — no app ou aqui no chat, como “gastei 50 no mercado” — e eu monto o fechamento com análises e recomendações.`,
            'Dica: comece pelos gastos fixos (aluguel, contas, assinaturas) e pelo salário. Só isso já mostra quanto sobra por mês.',
          ];
    return { month, title, paragraphs, cards: [] };
  }

  const partial = month === current;
  const prevMonth = addMonthsToKey(month, -1);
  const prevLong = formatMonthLong(prevMonth);
  const nextLong = formatMonthLong(addMonthsToKey(month, 1));
  const prev = monthSummary(data.transactions, prevMonth);
  const targetPct = data.settings.savingsRateTarget > 0 ? data.settings.savingsRateTarget : 20;
  const target = targetPct / 100;
  const asOf = partial ? today : endOfMonth(month) < today ? endOfMonth(month) : today;
  const paragraphs: string[] = [];

  if (partial)
    paragraphs.push(`${capitalize(long)} ainda não terminou: este é um fechamento parcial, até ${formatDateBR(today)}.`);

  // 1) Receitas, despesas, sobra e taxa de poupança.
  const saved = s.net + s.invested;
  let rateSentence: string | null = null;
  if (s.savingsRate !== null) {
    const investedNote = s.invested > 0 ? ` (contando ${formatBRL(s.invested)} investidos)` : '';
    rateSentence =
      s.savingsRate >= target
        ? `Sua taxa de poupança foi de ${formatPercent(s.savingsRate)}${investedNote}, acima da meta de ${formatNumber(targetPct)}%. 👏`
        : `Sua taxa de poupança foi de ${formatPercent(s.savingsRate)}${investedNote}, abaixo da meta de ${formatNumber(targetPct)}%.`;
  }
  paragraphs.push(
    sentences([
      `Em ${long} entraram ${formatBRL(s.income)} e saíram ${formatBRL(s.expense)}.`,
      s.net >= 0 ? `Sobraram ${formatBRL(s.net)}.` : `Você gastou ${formatBRL(-s.net)} a mais do que ganhou.`,
      rateSentence ??
        'Não houve receitas registradas no mês, então não dá para calcular a taxa de poupança.',
      s.pendingExpense > 0 || s.pendingIncome > 0
        ? `Ainda constam como pendentes ${formatBRL(s.pendingExpense)} em despesas e ${formatBRL(s.pendingIncome)} em receitas.`
        : null,
    ]),
  );

  // 2) Maiores categorias, maior lançamento e regra 50/30/20.
  const rows = categoryBreakdown(data.transactions, data.categories, month, 'despesa');
  const biggest = topExpenses(data.transactions, month, 1)[0];
  const groups = groupBreakdown(data.transactions, data.categories, month);
  if (rows.length > 0) {
    paragraphs.push(
      sentences([
        `Os maiores gastos foram ${joinList(rows.slice(0, 3).map((r) => `${categoryLabel(r)} (${formatBRL(r.total)}, ${formatPercent(r.share)})`))}.`,
        biggest ? `O maior lançamento foi “${biggest.description}”, de ${formatBRL(biggest.amount)} em ${formatDateBR(biggest.date)}.` : null,
        groups.income > 0
          ? `Pela regra 50/30/20, as necessidades levaram ${formatPercent(groups.shares.necessidades ?? 0)} da renda, os desejos ${formatPercent(groups.shares.desejos ?? 0)} e os objetivos (poupança e dívidas) ${formatPercent(groups.shares.objetivos ?? 0)}.`
          : null,
      ]),
    );
  }

  // 3) Variações vs mês anterior.
  if (prev.transactionCount > 0) {
    const change = relativeChange(s.expense, prev.expense);
    const diffRows = compareMonthsByCategory(data.transactions, data.categories, month, prevMonth);
    const increases = diffRows.filter((r) => r.diff > 0).slice(0, 2);
    const decreases = diffRows.filter((r) => r.diff < 0).slice(0, 2);
    const fmt = (r: (typeof diffRows)[number]) => `${categoryLabel(r)} (${formatSignedBRL(r.diff)})`;
    paragraphs.push(
      sentences([
        change === null
          ? `Em ${prevLong} não houve despesas registradas.`
          : Math.abs(change) < 0.01
            ? `As despesas ficaram praticamente iguais às de ${prevLong}.`
            : `Comparado a ${prevLong}, as despesas ${change > 0 ? 'subiram' : 'caíram'} ${formatPercent(Math.abs(change))} (${formatSignedBRL(s.expense - prev.expense)})${partial ? ' — lembrando que o mês ainda está em andamento' : ''}.`,
        increases.length ? `Maiores altas: ${joinList(increases.map(fmt))}.` : null,
        !partial && decreases.length ? `Maiores quedas: ${joinList(decreases.map(fmt))}.` : null,
      ]),
    );
  } else {
    paragraphs.push('Este é o primeiro mês com registros — no próximo fechamento eu comparo a evolução.');
  }

  // 4) Orçamentos.
  const statuses = budgetStatuses(data.budgets, data.transactions, data.categories, month, today);
  const over = statuses.filter((b) => b.status === 'estourado');
  if (statuses.length > 0) {
    const within = statuses.length - over.length;
    paragraphs.push(
      sentences([
        over.length === 0
          ? statuses.length === 1
            ? `${partial ? 'Até agora, o' : 'O'} orçamento de ${statuses[0].categoryName} ${partial ? 'está' : 'ficou'} dentro do limite. 👏`
            : `${partial ? 'Até agora, todos' : 'Todos'} os ${statuses.length} orçamentos ${partial ? 'estão' : 'ficaram'} dentro do limite. 👏`
          : partial
            ? `Até agora, ${within} de ${statuses.length} orçamentos estão dentro do limite.`
            : `Dos ${statuses.length} orçamentos, ${within} ${within === 1 ? 'ficou' : 'ficaram'} dentro do limite.`,
        over.length
          ? `${joinList(over.map((b) => `${categoryLabel({ icon: b.icon, name: b.categoryName })} (+${formatBRL(b.spent - b.budgeted)})`))} ${
              partial
                ? over.length === 1 ? 'já passou do limite' : 'já passaram do limite'
                : over.length === 1 ? 'estourou o limite' : 'estouraram o limite'
            }.`
          : null,
      ]),
    );
  } else {
    const suggestion = suggestBudgets(data.transactions, data.categories, addMonthsToKey(month, 1)).find(
      (b) => data.categories.find((c) => c.id === b.categoryId)?.group !== 'objetivos',
    );
    const category = suggestion ? data.categories.find((c) => c.id === suggestion.categoryId) : undefined;
    if (suggestion && category)
      paragraphs.push(
        `Você ainda não usa orçamentos. Um bom começo: ${categoryLabel(category)} com limite de ${formatBRL(suggestion.suggested)} por mês (sua média é ${formatBRL(suggestion.average)}).`,
      );
  }

  // 5) Metas.
  const contributed = data.goalContributions
    .filter((c) => isInMonth(c.date, month))
    .reduce((sum, c) => sum + c.amount, 0);
  // Situação das metas na data do relatório (aportes posteriores não contam para um mês já fechado).
  const goals = goalsOverview(
    data.goals,
    data.goalContributions.filter((c) => c.date <= asOf),
    asOf,
  );
  const inProgress = goals.items.filter((g) => g.track !== 'concluida' && g.track !== 'pausada');
  const closest = [...inProgress].sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name, 'pt-BR'))[0];
  const completedNow = goals.items.filter(
    (g) => g.track === 'concluida' && g.projectedCompletionDate !== null && isInMonth(g.projectedCompletionDate, month) && g.saved > 0,
  );
  if (data.goals.length > 0) {
    paragraphs.push(
      sentences([
        contributed > 0
          ? `Você guardou ${formatBRL(contributed)} nas suas metas neste mês.`
          : contributed < 0
            ? `Houve resgate líquido de ${formatBRL(-contributed)} das metas neste mês.`
            : 'Não houve aportes nas metas neste mês.',
        completedNow.length ? `Meta concluída: ${joinList(completedNow.map((g) => categoryLabel(g)))}! 🎉` : null,
        closest ? `${categoryLabel(closest)} está em ${formatPercent(closest.percent)}.` : null,
      ]),
    );
  }

  // 6) Recomendação para o próximo mês.
  const topWant = rows.find((r) => r.categoryId !== null && data.categories.find((c) => c.id === r.categoryId)?.group === 'desejos');
  let recommendation: string;
  if (s.net < 0) {
    recommendation = `o foco é voltar ao azul. ${topWant ? `Defina um teto para ${categoryLabel(topWant)} e acompanhe o orçamento toda semana.` : 'Defina orçamentos para as categorias que mais pesam e acompanhe toda semana.'}`;
  } else if (over.length) {
    recommendation = `ajuste o orçamento de ${over[0].categoryName} para um valor realista ou corte gastos nessa categoria.`;
  } else if (s.income > 0 && saved < s.income * target) {
    const missing = Math.ceil(s.income * target - saved);
    recommendation = `separe ${formatBRL(missing)} a mais logo que o salário cair para chegar à meta de ${formatNumber(targetPct)}% de poupança.`;
  } else if (topWant && topWant.share >= 0.1) {
    const cut = Math.round(topWant.total * 0.15);
    recommendation = `tente reduzir ${categoryLabel(topWant)} em 15% — são ${formatBRL(cut)} a mais no bolso.`;
  } else {
    const goal = closest ? `a meta ${closest.name}` : 'a reserva de emergência';
    recommendation = `continue assim! Direcione a sobra para ${goal}.`;
  }
  paragraphs.push(`Para ${nextLong}: ${recommendation}`);

  // Cards.
  const expenseChange = relativeChange(s.expense, prev.expense);
  const cards: AgentCard[] = [
    { type: 'stat', title: 'Receitas', value: formatBRL(s.income), tone: 'positive' },
    {
      type: 'stat',
      title: 'Despesas',
      value: formatBRL(s.expense),
      hint:
        expenseChange !== null
          ? `${expenseChange >= 0 ? '+' : '-'}${formatPercent(Math.abs(expenseChange))} vs ${formatMonthShort(prevMonth)}`
          : undefined,
      tone: 'neutral',
    },
    {
      type: 'stat',
      title: s.net >= 0 ? 'Sobra do mês' : 'Resultado do mês',
      value: formatSignedBRL(s.net),
      hint: s.savingsRate !== null ? `Taxa de poupança: ${formatPercent(s.savingsRate)}` : undefined,
      tone: toneOfAmount(s.net),
    },
  ];
  if (rows.length > 0)
    cards.push({
      type: 'list',
      title: 'Maiores categorias',
      items: rows.slice(0, 5).map((r) => ({ label: categoryLabel(r), value: formatBRL(r.total), hint: formatPercent(r.share) })),
    });
  const pie = pieCard(rows);
  if (pie) cards.push(pie);
  cards.push({
    type: 'chart',
    title: 'Despesas nos últimos 6 meses',
    chart: 'bar',
    data: monthlySeries(data.transactions, month, 6).map((m) => ({ label: formatMonthShort(m.month), value: m.expense })),
  });
  if (statuses.length > 0)
    cards.push({
      type: 'progress',
      title: 'Orçamentos',
      items: statuses.map((b) => ({
        label: categoryLabel({ icon: b.icon, name: b.categoryName }),
        current: b.spent,
        target: b.budgeted,
        tone: b.status === 'estourado' ? 'negative' : b.status === 'alerta' ? 'warning' : 'positive',
      })),
    });

  return { month, title, paragraphs, cards };
}
