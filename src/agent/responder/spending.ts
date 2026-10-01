/** Consultas de gastos/receitas, maiores gastos, comparação entre meses e resumo do mês. */
import {
  averageMonthlyExpense,
  averageMonthlyIncome,
  cashflowForecast,
  compareMonthsByCategory,
  monthSummary,
  monthlySeries,
  resolveBudget,
  topExpenses,
  type CategoryTotal,
} from '@/analytics';
import {
  addMonthsToKey,
  daysInMonth,
  formatDateBR,
  formatMonthLong,
  formatMonthShort,
  isInMonth,
  makeISO,
  monthKey,
  parseISO,
} from '@/domain/dates';
import { formatBRL, formatPercent, formatSignedBRL } from '@/domain/money';
import { capitalize, plural } from '@/domain/text';
import type { CategoryKind, MonthKey, Transaction } from '@/domain/types';
import {
  accountPhrase,
  categoryLabel,
  formatNumber,
  joinList,
  money,
  monthPeriod,
  paragraphs,
  periodMonth,
  periodPhraseStart,
  relativeChange,
  sentences,
  toneOfAmount,
} from '../format';
import type { AgentCard } from '../types';
import {
  breakdownFor,
  findAccount,
  findCategory,
  periodOrThisMonth,
  referenceMonth,
  sum,
  transactionsIn,
  type Handler,
  type TurnContext,
} from './context';

const MAX_PIE_SLICES = 6;

/** Gráfico de pizza por categoria (valores em centavos), agrupando o excedente em "Outras". */
export function categoryPie(title: string, rows: CategoryTotal[]): AgentCard | null {
  if (rows.length < 2) return null;
  const head = rows.slice(0, MAX_PIE_SLICES - 1);
  const rest = rows.slice(MAX_PIE_SLICES - 1);
  const data = head.map((r) => ({ label: r.name, value: r.total, color: r.color }));
  if (rest.length === 1) data.push({ label: rest[0].name, value: rest[0].total, color: rest[0].color });
  else if (rest.length > 1) data.push({ label: 'Outras', value: sum(rest.map((r) => r.total)), color: '#94a3b8' });
  return { type: 'chart', title, chart: 'pie', data };
}

/** Lista das maiores categorias (rótulo com ícone, valor e participação). */
export function categoryList(title: string, rows: CategoryTotal[], limit = 5): AgentCard {
  return {
    type: 'list',
    title,
    items: rows.slice(0, limit).map((r) => ({
      label: categoryLabel(r),
      value: formatBRL(r.total),
      hint: `${formatPercent(r.share)} · ${plural(r.count, 'lançamento', 'lançamentos')}`,
    })),
  };
}

function flowQuery(ctx: TurnContext, kind: CategoryKind) {
  const { data, entities: e } = ctx;
  const period = periodOrThisMonth(ctx);
  const category = findCategory(data, e.categoryId);
  const filterCategory = category && category.kind === kind ? category : undefined;
  const account = findAccount(data, e.accountId);
  const txs = transactionsIn(data, period, kind, { categoryId: filterCategory?.id, accountId: account?.id });
  const total = sum(txs.map((t) => t.amount));
  const pending = sum(txs.filter((t) => t.status === 'pendente').map((t) => t.amount));
  const isExpense = kind === 'despesa';
  const scope = `${filterCategory ? `${isExpense ? ' com' : ' de'} ${categoryLabel(filterCategory)}` : ''}${account ? ` ${accountPhrase(account)}` : ''}`;
  const month = periodMonth(period);
  const memory = { lastPeriod: period, lastCategoryId: filterCategory?.id, lastAccountId: account?.id };
  const followUps = isExpense
    ? ['Onde estou gastando mais?', 'Compara com o mês passado', 'Como está meu orçamento?']
    : ['Resumo do mês', 'Quanto gastei este mês?', 'Vou fechar o mês no azul?'];

  if (txs.length === 0) {
    return {
      text: `${periodPhraseStart(period)}, não encontrei ${isExpense ? 'despesas' : 'receitas'}${scope}. Se faltou registrar algo, é só me contar — por exemplo: “${isExpense ? 'gastei 50 no mercado' : 'recebi 5000 de salário'}”.`,
      suggestions: followUps,
      memory,
    };
  }

  const parts: (string | null)[] = [
    `${periodPhraseStart(period)}, você ${isExpense ? 'gastou' : 'recebeu'} ${money(total)}${scope} em ${plural(txs.length, 'lançamento', 'lançamentos')}.`,
  ];
  if (pending > 0)
    parts.push(`Desse total, ${formatBRL(pending)} ainda ${isExpense ? 'está pendente (a pagar)' : 'está pendente (a receber)'}.`);

  if (month) {
    const average =
      isExpense
        ? averageMonthlyExpense(data.transactions, month, 3, filterCategory ? [filterCategory.id] : undefined)
        : filterCategory
          ? 0
          : averageMonthlyIncome(data.transactions, month, 3);
    if (average > 0) {
      const change = relativeChange(total, average) ?? 0;
      const ongoing = month === ctx.month ? ' (e o mês ainda não acabou)' : '';
      parts.push(
        Math.abs(change) < 0.05
          ? `Está em linha com a sua média dos 3 meses anteriores (${formatBRL(average)})${ongoing}.`
          : `Sua média nos 3 meses anteriores é ${formatBRL(average)} — ${formatPercent(Math.abs(change))} ${change > 0 ? 'acima' : 'abaixo'}${ongoing}.`,
      );
    }
    if (isExpense && filterCategory) {
      const budget = resolveBudget(data.budgets, filterCategory.id, month);
      if (budget && budget.amount > 0) {
        const remaining = budget.amount - total;
        parts.push(
          remaining >= 0
            ? `Isso é ${formatPercent(total / budget.amount)} do orçamento de ${formatBRL(budget.amount)}; restam ${formatBRL(remaining)}.`
            : `⚠️ O orçamento de ${formatBRL(budget.amount)} já foi ultrapassado em ${formatBRL(-remaining)}.`,
        );
      }
    }
  }

  const cards: AgentCard[] = [
    {
      type: 'stat',
      title: `${isExpense ? 'Gastos' : 'Receitas'} — ${period.label}`,
      value: formatBRL(total),
      hint: plural(txs.length, 'lançamento', 'lançamentos'),
      tone: isExpense ? 'neutral' : 'positive',
    },
  ];
  if (!filterCategory) {
    const rows = breakdownFor(data, period, kind, account?.id);
    const top = rows.slice(0, 3).map((r) => `${categoryLabel(r)} (${formatBRL(r.total)})`);
    if (rows.length > 1) parts.push(`${isExpense ? 'Onde mais pesou' : 'Principais fontes'}: ${joinList(top)}.`);
    cards.push(categoryList(isExpense ? 'Por categoria' : 'Por origem', rows));
    const pie = categoryPie(isExpense ? 'Gastos por categoria' : 'Receitas por categoria', rows);
    if (pie) cards.push(pie);
  } else {
    const items = [...txs]
      .sort((a, b) => b.amount - a.amount || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, 5)
      .map((t) => ({ label: t.description, value: formatBRL(t.amount), hint: formatDateBR(t.date) }));
    cards.push({ type: 'list', title: 'Maiores lançamentos', items });
  }

  const suggestions = [...followUps];
  if (month === ctx.month) suggestions.unshift('E no mês passado?');
  return { text: sentences(parts), cards, suggestions, memory };
}

/** consultar_gastos */
export const spendingQuery: Handler = (ctx) => flowQuery(ctx, 'despesa');

/** consultar_receitas */
export const incomeQuery: Handler = (ctx) => flowQuery(ctx, 'receita');

function biggestTransactions(ctx: TurnContext, limit: number): Transaction[] {
  const period = periodOrThisMonth(ctx);
  const month = periodMonth(period);
  if (month) return topExpenses(ctx.data.transactions, month, limit);
  return transactionsIn(ctx.data, period, 'despesa')
    .sort((a, b) => b.amount - a.amount || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit);
}

/** maiores_gastos */
export const topSpending: Handler = (ctx) => {
  const { data } = ctx;
  const period = periodOrThisMonth(ctx);
  const rows = breakdownFor(data, period, 'despesa');
  const memory = { lastPeriod: period };
  if (rows.length === 0) {
    return {
      text: `${periodPhraseStart(period)}, ainda não há despesas registradas. Registre seus gastos (ex.: “gastei 45 no mercado”) e eu mostro para onde o dinheiro está indo.`,
      suggestions: ['O que você sabe fazer?', 'Resumo do mês'],
      memory,
    };
  }
  const top = rows.slice(0, 3).map((r) => `${categoryLabel(r)} (${formatBRL(r.total)}, ${formatPercent(r.share)})`);
  const biggest = biggestTransactions(ctx, 5);
  const parts: (string | null)[] = [
    `${periodPhraseStart(period)}, seu dinheiro foi principalmente para ${joinList(top)}.`,
    biggest[0]
      ? `O maior lançamento foi “${biggest[0].description}” (${formatBRL(biggest[0].amount)}, em ${formatDateBR(biggest[0].date)}).`
      : null,
  ];
  const want = rows.find((r) => r.categoryId !== null && findCategory(data, r.categoryId)?.group === 'desejos');
  if (want && want.total > 0) {
    const cut = Math.round(want.total * 0.2);
    parts.push(
      `💡 ${categoryLabel(want)} é o seu maior gasto com desejos: cortar 20% ali libera ${formatBRL(cut)}${periodMonth(period) ? ' por mês' : ' no período'}.`,
    );
  }
  const cards: AgentCard[] = [];
  const pie = categoryPie('Para onde foi o dinheiro', rows);
  if (pie) cards.push(pie);
  cards.push(categoryList('Maiores categorias', rows));
  if (biggest.length > 0)
    cards.push({
      type: 'list',
      title: 'Maiores lançamentos',
      items: biggest.map((t) => ({
        label: t.description,
        value: formatBRL(t.amount),
        hint: `${formatDateBR(t.date)} · ${findCategory(data, t.categoryId)?.name ?? 'Sem categoria'}`,
      })),
    });
  return {
    text: sentences(parts),
    cards,
    suggestions: ['Compara com o mês passado', 'Como está meu orçamento?', 'Dicas para economizar'],
    memory,
  };
};

/** Total de despesas do mês até o dia `day` (limitado ao fim do mês). */
function expenseUntilDay(transactions: Transaction[], month: MonthKey, day: number): number {
  const [y, m] = month.split('-').map(Number);
  const cut = makeISO(y, m, Math.min(day, daysInMonth(y, m)));
  return sum(
    transactions.filter((t) => t.type === 'despesa' && isInMonth(t.date, month) && t.date <= cut).map((t) => t.amount),
  );
}

/** comparar_meses */
export const compareMonths: Handler = (ctx) => {
  const { data, entities: e, today } = ctx;
  const mentioned = e.period ? (periodMonth(e.period) ?? monthKey(e.period.start)) : null;
  let other = mentioned && mentioned !== ctx.month ? mentioned : addMonthsToKey(ctx.month, -1);
  let base = ctx.month;
  if (other > base) [base, other] = [other, base];
  const ongoing = base === ctx.month;
  const baseLong = formatMonthLong(base);
  const otherLong = formatMonthLong(other);
  const category = findCategory(data, e.categoryId);
  const memory = { lastPeriod: monthPeriod(other, today), lastCategoryId: category?.id };
  const suggestions = ['Onde estou gastando mais?', 'Resumo do mês', 'Dicas para economizar'];

  if (category) {
    const kind = category.kind;
    const a = sum(transactionsIn(data, monthPeriod(base, today), kind, { categoryId: category.id }).map((t) => t.amount));
    const b = sum(transactionsIn(data, monthPeriod(other, today), kind, { categoryId: category.id }).map((t) => t.amount));
    const change = relativeChange(a, b);
    const trend = monthlySeries(
      data.transactions.filter((t) => t.categoryId === category.id),
      base,
      6,
    );
    const text = sentences([
      `Com ${categoryLabel(category)}: ${money(a)} em ${baseLong}${ongoing ? ' (até agora)' : ''} contra ${money(b)} em ${otherLong}.`,
      change === null
        ? a > 0
          ? `Em ${otherLong} não houve lançamentos nessa categoria.`
          : null
        : Math.abs(change) < 0.01
          ? 'Praticamente igual.'
          : `${change > 0 ? 'Aumento' : 'Queda'} de ${formatPercent(Math.abs(change))} (${formatSignedBRL(a - b)}).`,
      ongoing && change !== null && change < 0 ? 'Lembre que o mês ainda não acabou.' : null,
    ]);
    return {
      text,
      cards: [
        {
          type: 'chart',
          title: `${category.name} nos últimos 6 meses`,
          chart: 'bar',
          data: trend.map((m) => ({
            label: formatMonthShort(m.month),
            value: kind === 'despesa' ? m.expense : m.income,
            color: category.color,
          })),
        },
      ],
      suggestions,
      memory,
    };
  }

  const sa = monthSummary(data.transactions, base);
  const sb = monthSummary(data.transactions, other);
  if (sa.transactionCount === 0 && sb.transactionCount === 0) {
    return {
      text: `Ainda não há lançamentos em ${baseLong} nem em ${otherLong} para comparar. Registre seus gastos e receitas e eu mostro a evolução mês a mês.`,
      suggestions: ['O que você sabe fazer?'],
      memory,
    };
  }
  const rows = compareMonthsByCategory(data.transactions, data.categories, base, other);
  const increases = rows.filter((r) => r.diff > 0).slice(0, 3);
  const decreases = rows.filter((r) => r.diff < 0).slice(0, 3);
  const fmtRow = (r: (typeof rows)[number]) => `${categoryLabel(r)} (${formatSignedBRL(r.diff)})`;
  const parts: (string | null)[] = [
    `${capitalize(baseLong)}${ongoing ? ' (até agora)' : ''}: despesas de ${money(sa.expense)} e receitas de ${formatBRL(sa.income)}.`,
    `${capitalize(otherLong)}: despesas de ${money(sb.expense)} e receitas de ${formatBRL(sb.income)}.`,
  ];
  if (ongoing) {
    const day = parseISO(today).day;
    const current = expenseUntilDay(data.transactions, base, day);
    const sameDay = expenseUntilDay(data.transactions, other, day);
    if (sameDay > 0) {
      const diff = current - sameDay;
      parts.push(
        diff === 0
          ? `Até o dia ${day}, você gastou o mesmo que no mesmo período de ${otherLong}.`
          : `Comparando até o dia ${day}, você está gastando ${formatBRL(Math.abs(diff))} ${diff < 0 ? 'a menos 👏' : 'a mais'} que em ${otherLong} (${formatBRL(current)} contra ${formatBRL(sameDay)}).`,
      );
    }
    if (increases.length) parts.push(`Já passaram do total de ${otherLong}: ${joinList(increases.map(fmtRow))}.`);
  } else {
    const change = relativeChange(sa.expense, sb.expense);
    if (change !== null && Math.abs(change) >= 0.01)
      parts.push(
        `As despesas ${change > 0 ? 'subiram' : 'caíram'} ${formatPercent(Math.abs(change))} (${formatSignedBRL(sa.expense - sb.expense)}).`,
      );
    if (increases.length) parts.push(`Maiores altas: ${joinList(increases.map(fmtRow))}.`);
    if (decreases.length) parts.push(`Maiores quedas: ${joinList(decreases.map(fmtRow))}.`);
  }
  const series = monthlySeries(data.transactions, base, 6);
  return {
    text: sentences(parts),
    cards: [
      {
        type: 'chart',
        title: 'Despesas por mês',
        chart: 'bar',
        data: series.map((m) => ({ label: formatMonthShort(m.month), value: m.expense })),
      },
      {
        type: 'list',
        title: `Variação por categoria (${formatMonthShort(base)} vs ${formatMonthShort(other)})`,
        items: rows.slice(0, 6).map((r) => ({
          label: categoryLabel(r),
          value: formatSignedBRL(r.diff),
          hint: `${formatBRL(r.current)} contra ${formatBRL(r.previous)}`,
          tone: r.diff > 0 ? 'negative' : r.diff < 0 ? 'positive' : 'neutral',
        })),
      },
    ],
    suggestions,
    memory,
  };
};

/** resumo_mes */
export const monthSummaryReply: Handler = (ctx) => {
  const { data, today } = ctx;
  const month = referenceMonth(ctx);
  const s = monthSummary(data.transactions, month);
  const long = formatMonthLong(month);
  const isCurrent = month === ctx.month;
  const memory = { lastPeriod: monthPeriod(month, today) };
  if (s.transactionCount === 0) {
    return {
      text: `Ainda não há receitas nem despesas em ${long}. Registre seus lançamentos (ex.: “gastei 50 no mercado”) e eu monto o resumo para você.`,
      suggestions: ['O que você sabe fazer?', 'Dicas para economizar'],
      memory,
    };
  }
  const targetPct = data.settings.savingsRateTarget > 0 ? data.settings.savingsRateTarget : 20;
  const net = s.net;
  const result =
    net >= 0
      ? sentences([
          `Sobra de ${money(net)}`,
          s.savingsRate !== null
            ? `— você poupou ${formatPercent(s.savingsRate)} da renda${s.invested > 0 ? ` (contando ${formatBRL(s.invested)} investidos)` : ''}${s.savingsRate * 100 >= targetPct ? `, acima da sua meta de ${formatNumber(targetPct)}%. 👏` : `; sua meta é ${formatNumber(targetPct)}%.`}`
            : '.',
        ])
      : `Você gastou ${money(-net)} a mais do que ganhou.`;
  const rows = breakdownFor(data, monthPeriod(month, today), 'despesa');
  const top = rows.slice(0, 3).map((r) => `${categoryLabel(r)} (${formatBRL(r.total)})`);
  let forecastLine: string | null = null;
  if (isCurrent && data.accounts.some((a) => !a.archived && a.type !== 'investimento')) {
    const forecast = cashflowForecast(data, today);
    forecastLine =
      forecast.projectedEndBalance >= 0
        ? `A previsão é fechar o mês com ${formatBRL(forecast.projectedEndBalance)} em caixa.`
        : `⚠️ A previsão é fechar o mês em ${formatBRL(forecast.projectedEndBalance)} — vale segurar os gastos variáveis.`;
  }
  const text = paragraphs([
    `Resumo de ${long}${isCurrent ? ' até agora' : ''}: entraram ${money(s.income)} e saíram ${money(s.expense)}. ${result}`,
    s.pendingExpense > 0 || s.pendingIncome > 0
      ? `Ainda há ${formatBRL(s.pendingExpense)} a pagar e ${formatBRL(s.pendingIncome)} a receber (lançamentos pendentes).`
      : null,
    top.length ? `Maiores gastos: ${joinList(top)}.` : null,
    forecastLine,
  ]);
  const cards: AgentCard[] = [
    { type: 'stat', title: 'Receitas', value: formatBRL(s.income), tone: 'positive' },
    { type: 'stat', title: 'Despesas', value: formatBRL(s.expense), tone: 'neutral' },
    {
      type: 'stat',
      title: 'Resultado do mês',
      value: formatSignedBRL(net),
      hint: s.savingsRate !== null ? `Taxa de poupança: ${formatPercent(s.savingsRate)}` : undefined,
      tone: toneOfAmount(net),
    },
  ];
  const pie = categoryPie('Gastos por categoria', rows);
  if (pie) cards.push(pie);
  return {
    text,
    cards,
    suggestions: [
      'Onde estou gastando mais?',
      'Compara com o mês passado',
      isCurrent ? 'Vou fechar o mês no azul?' : `Relatório de ${long}`,
      'Como está meu orçamento?',
    ],
    memory,
  };
};
