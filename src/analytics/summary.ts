import { addMonthsToKey, isInMonth, lastMonths, monthKey } from '@/domain/dates';
import { CATEGORY_IDS } from '@/domain/defaults';
import { safeRatio } from '@/domain/money';
import type { Category, CategoryKind, Cents, ID, MonthKey, Transaction } from '@/domain/types';
import {
  UNCATEGORIZED,
  addTo,
  compareDesc,
  compareText,
  indexCategories,
  isFlow,
  statusIncluded,
  type FlowTransaction,
} from './internal/common';
import type { CategoryTotal, GroupBreakdown, MonthSummary } from './types';

export interface SummaryOptions {
  /** Padrão true: pendentes entram nos totais (visão por competência). */
  includePending?: boolean;
}

/* ------------------------------------------------------------------ */
/* Acumulador mensal (compartilhado por monthSummary e monthlySeries)  */
/* ------------------------------------------------------------------ */

interface MonthAccumulator {
  paidIncome: Cents;
  pendingIncome: Cents;
  paidExpense: Cents;
  pendingExpense: Cents;
  invested: Cents;
  count: number;
}

function emptyAccumulator(): MonthAccumulator {
  return { paidIncome: 0, pendingIncome: 0, paidExpense: 0, pendingExpense: 0, invested: 0, count: 0 };
}

function accumulate(acc: MonthAccumulator, tx: FlowTransaction): void {
  const paid = tx.status === 'pago';
  if (tx.type === 'receita') {
    if (paid) acc.paidIncome += tx.amount;
    else acc.pendingIncome += tx.amount;
  } else {
    if (paid) acc.paidExpense += tx.amount;
    else acc.pendingExpense += tx.amount;
    if (tx.categoryId === CATEGORY_IDS.investimentos) acc.invested += tx.amount;
  }
  acc.count += 1;
}

function finalize(month: MonthKey, acc: MonthAccumulator): MonthSummary {
  const income = acc.paidIncome + acc.pendingIncome;
  const expense = acc.paidExpense + acc.pendingExpense;
  const net = income - expense;
  return {
    month,
    income,
    expense,
    net,
    invested: acc.invested,
    savingsRate: safeRatio(net + acc.invested, income),
    paidIncome: acc.paidIncome,
    paidExpense: acc.paidExpense,
    pendingIncome: acc.pendingIncome,
    pendingExpense: acc.pendingExpense,
    transactionCount: acc.count,
  };
}

/**
 * Resumo de receitas/despesas de um mês (ver MonthSummary). Transferências são ignoradas.
 * Com includePending=false os pendentes são totalmente desconsiderados (pendingIncome/pendingExpense = 0
 * e não entram em transactionCount), de modo que sempre vale income = paidIncome + pendingIncome.
 */
export function monthSummary(
  transactions: Transaction[],
  month: MonthKey,
  opts?: SummaryOptions,
): MonthSummary {
  const includePending = opts?.includePending ?? true;
  const acc = emptyAccumulator();
  for (const tx of transactions) {
    if (!isFlow(tx) || !isInMonth(tx.date, month) || !statusIncluded(tx, includePending)) continue;
    accumulate(acc, tx);
  }
  return finalize(month, acc);
}

/** `count` resumos mensais terminando em `endMonth` (inclusive), em ordem cronológica. Uma única passada. */
export function monthlySeries(
  transactions: Transaction[],
  endMonth: MonthKey,
  count: number,
  opts?: SummaryOptions,
): MonthSummary[] {
  if (count <= 0) return [];
  const includePending = opts?.includePending ?? true;
  const months = lastMonths(endMonth, Math.floor(count));
  const accs = new Map<MonthKey, MonthAccumulator>();
  for (const m of months) accs.set(m, emptyAccumulator());
  for (const tx of transactions) {
    if (!isFlow(tx) || !statusIncluded(tx, includePending)) continue;
    const acc = accs.get(monthKey(tx.date));
    if (acc) accumulate(acc, tx);
  }
  return months.map((m) => finalize(m, accs.get(m) ?? emptyAccumulator()));
}

/* ------------------------------------------------------------------ */
/* Categorias                                                          */
/* ------------------------------------------------------------------ */

interface CategoryLabel {
  name: string;
  icon: string;
  color: string;
}

function labelFor(categoryId: ID | null, byId: Map<ID, Category>): CategoryLabel {
  const category = categoryId === null ? undefined : byId.get(categoryId);
  if (!category) return UNCATEGORIZED;
  return { name: category.name, icon: category.icon, color: category.color };
}

/** Chave de agrupamento: o id se a categoria existe, senão null ("Sem categoria"). */
function groupKey(tx: Transaction, byId: Map<ID, Category>): ID | null {
  return tx.categoryId !== null && byId.has(tx.categoryId) ? tx.categoryId : null;
}

/**
 * Totais por categoria para um tipo (despesa/receita) no mês, ordenados por total desc (empate: nome).
 * Lançamentos com categoria inexistente/nula são agrupados em { categoryId: null, name: 'Sem categoria' }.
 * Categorias arquivadas continuam aparecendo (o gasto aconteceu). Pendentes entram por padrão.
 */
export function categoryBreakdown(
  transactions: Transaction[],
  categories: Category[],
  month: MonthKey,
  kind: CategoryKind,
  opts?: SummaryOptions,
): CategoryTotal[] {
  const includePending = opts?.includePending ?? true;
  const byId = indexCategories(categories);
  const totals = new Map<ID | null, { total: Cents; count: number }>();
  let grandTotal = 0;
  for (const tx of transactions) {
    if (tx.type !== kind || !isInMonth(tx.date, month) || !statusIncluded(tx, includePending)) continue;
    const key = groupKey(tx, byId);
    const entry = totals.get(key) ?? { total: 0, count: 0 };
    entry.total += tx.amount;
    entry.count += 1;
    totals.set(key, entry);
    grandTotal += tx.amount;
  }
  const rows: CategoryTotal[] = [];
  for (const [categoryId, { total, count }] of totals) {
    rows.push({
      categoryId,
      ...labelFor(categoryId, byId),
      total,
      share: grandTotal > 0 ? total / grandTotal : 0,
      count,
    });
  }
  return rows.sort((a, b) => compareDesc(a.total, b.total) || compareText(a.name, b.name));
}

/**
 * Total gasto (ou recebido) em uma categoria em cada um dos `count` meses até endMonth (cronológico).
 * Considera pagos e pendentes (competência); transferências não têm categoria e nunca entram.
 */
export function categoryTrend(
  transactions: Transaction[],
  categoryId: ID,
  endMonth: MonthKey,
  count: number,
): { month: MonthKey; total: Cents }[] {
  if (count <= 0) return [];
  const months = lastMonths(endMonth, Math.floor(count));
  const totals = new Map<MonthKey, Cents>();
  for (const m of months) totals.set(m, 0);
  for (const tx of transactions) {
    if (!isFlow(tx) || tx.categoryId !== categoryId) continue;
    const key = monthKey(tx.date);
    if (totals.has(key)) addTo(totals, key, tx.amount);
  }
  return months.map((month) => ({ month, total: totals.get(month) ?? 0 }));
}

/** Média mensal de um tipo de lançamento nos `months` meses anteriores a `beforeMonth`, ignorando meses vazios. */
function averageMonthly(
  transactions: Transaction[],
  type: 'despesa' | 'receita',
  beforeMonth: MonthKey,
  months: number,
  categoryIds?: ID[],
): Cents {
  if (months <= 0) return 0;
  const window = new Set(lastMonths(addMonthsToKey(beforeMonth, -1), Math.floor(months)));
  const filter = categoryIds ? new Set(categoryIds) : null;
  const activeMonths = new Set<MonthKey>();
  let total = 0;
  for (const tx of transactions) {
    if (!isFlow(tx)) continue;
    const key = monthKey(tx.date);
    if (!window.has(key)) continue;
    activeMonths.add(key);
    if (tx.type !== type) continue;
    if (filter && (tx.categoryId === null || !filter.has(tx.categoryId))) continue;
    total += tx.amount;
  }
  return activeMonths.size > 0 ? Math.round(total / activeMonths.size) : 0;
}

/**
 * Média mensal de despesas nos `months` meses ANTERIORES a `beforeMonth` (exclusivo).
 * Meses sem nenhum lançamento (nem receita nem despesa) são ignorados na média; se nenhum mês tiver dados, retorna 0.
 * Se `categoryIds` for informado, considera só essas categorias (um mês com lançamentos em outras categorias
 * conta como mês com dados e entra com 0 na média). Pagos e pendentes entram; resultado arredondado ao centavo.
 */
export function averageMonthlyExpense(
  transactions: Transaction[],
  beforeMonth: MonthKey,
  months: number,
  categoryIds?: ID[],
): Cents {
  return averageMonthly(transactions, 'despesa', beforeMonth, months, categoryIds);
}

/** Igual a averageMonthlyExpense, para receitas. */
export function averageMonthlyIncome(
  transactions: Transaction[],
  beforeMonth: MonthKey,
  months: number,
): Cents {
  return averageMonthly(transactions, 'receita', beforeMonth, months);
}

/**
 * Distribuição das despesas do mês nos grupos da regra 50/30/20 (pagos + pendentes).
 * `ideal` = 50%/30%/20% da renda do mês, cada valor arredondado ao centavo.
 */
export function groupBreakdown(
  transactions: Transaction[],
  categories: Category[],
  month: MonthKey,
): GroupBreakdown {
  const byId = indexCategories(categories);
  let income = 0;
  let necessidades = 0;
  let desejos = 0;
  let objetivos = 0;
  let semGrupo = 0;
  for (const tx of transactions) {
    if (!isFlow(tx) || !isInMonth(tx.date, month)) continue;
    if (tx.type === 'receita') {
      income += tx.amount;
      continue;
    }
    const group = tx.categoryId === null ? null : (byId.get(tx.categoryId)?.group ?? null);
    if (group === 'necessidades') necessidades += tx.amount;
    else if (group === 'desejos') desejos += tx.amount;
    else if (group === 'objetivos') objetivos += tx.amount;
    else semGrupo += tx.amount;
  }
  return {
    month,
    income,
    necessidades,
    desejos,
    objetivos,
    semGrupo,
    shares: {
      necessidades: safeRatio(necessidades, income),
      desejos: safeRatio(desejos, income),
      objetivos: safeRatio(objetivos, income),
    },
    ideal: {
      necessidades: Math.round(income * 0.5),
      desejos: Math.round(income * 0.3),
      objetivos: Math.round(income * 0.2),
    },
  };
}

/** Maiores despesas do mês (pagas e pendentes), por valor desc, depois data desc (empate final: descrição, id). */
export function topExpenses(transactions: Transaction[], month: MonthKey, limit: number): Transaction[] {
  if (limit <= 0) return [];
  return transactions
    .filter((tx) => tx.type === 'despesa' && isInMonth(tx.date, month))
    .sort(
      (a, b) =>
        b.amount - a.amount ||
        (a.date === b.date ? 0 : a.date > b.date ? -1 : 1) ||
        compareText(a.description, b.description) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .slice(0, Math.floor(limit));
}

/**
 * Comparação entre dois meses por categoria de despesa (diferença = atual - anterior), ordenada por |diff| desc
 * (empate: maior valor atual, depois nome). Pagos e pendentes entram; categoria inexistente/nula => 'Sem categoria'.
 */
export function compareMonthsByCategory(
  transactions: Transaction[],
  categories: Category[],
  month: MonthKey,
  previousMonth: MonthKey,
): { categoryId: ID | null; name: string; icon: string; current: Cents; previous: Cents; diff: Cents }[] {
  const byId = indexCategories(categories);
  const current = new Map<ID | null, Cents>();
  const previous = new Map<ID | null, Cents>();
  for (const tx of transactions) {
    if (tx.type !== 'despesa') continue;
    const key = monthKey(tx.date);
    if (key === month) addTo(current, groupKey(tx, byId), tx.amount);
    // Se os dois meses forem iguais, o lançamento entra nos dois lados (diff = 0).
    if (key === previousMonth) addTo(previous, groupKey(tx, byId), tx.amount);
  }
  const keys = new Set<ID | null>([...current.keys(), ...previous.keys()]);
  const rows = [...keys].map((categoryId) => {
    const { name, icon } = labelFor(categoryId, byId);
    const cur = current.get(categoryId) ?? 0;
    const prev = previous.get(categoryId) ?? 0;
    return { categoryId, name, icon, current: cur, previous: prev, diff: cur - prev };
  });
  return rows.sort(
    (a, b) => Math.abs(b.diff) - Math.abs(a.diff) || b.current - a.current || compareText(a.name, b.name),
  );
}
