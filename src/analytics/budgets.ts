import { addMonthsToKey, daysInMonthKey, isInMonth, lastMonths, monthKey, parseISO } from '@/domain/dates';
import { safeRatio } from '@/domain/money';
import type { Budget, Category, Cents, ID, ISODate, MonthKey, Transaction } from '@/domain/types';
import { addTo, compareDesc, compareText, isFlow } from './internal/common';
import type { BudgetHealth, BudgetOverview, BudgetStatus, BudgetSuggestion } from './types';

/** Fração do orçamento a partir da qual a categoria entra em alerta. */
const ALERT_THRESHOLD = 0.8;
/**
 * Dias decorridos mínimos para projetar o fim do mês pelo ritmo diário. Antes disso, poucas compras seriam
 * multiplicadas por até 31 (ex.: R$ 194,60 no dia 1º => "deve fechar em R$ 6.032,60") e gerariam alarmes falsos.
 * Exportado para a tela de Orçamentos explicar por que ainda não há projeção.
 */
export const MIN_PACE_DAYS = 7;
/** Sugestões são arredondadas para cima em múltiplos de R$ 10. */
const SUGGESTION_STEP: Cents = 1000;

/** Em caso de duplicidade (não deveria acontecer), vence o orçamento atualizado mais recentemente. */
function preferNewer(current: Budget | null, candidate: Budget): Budget {
  return current === null || candidate.updatedAt > current.updatedAt ? candidate : current;
}

/** Orçamento vigente de cada categoria no mês (específico > padrão), em uma passada. */
function resolveAll(budgets: Budget[], month: MonthKey): Map<ID, Budget> {
  const specific = new Map<ID, Budget>();
  const fallback = new Map<ID, Budget>();
  for (const b of budgets) {
    if (b.month === month) specific.set(b.categoryId, preferNewer(specific.get(b.categoryId) ?? null, b));
    else if (b.month === null) fallback.set(b.categoryId, preferNewer(fallback.get(b.categoryId) ?? null, b));
  }
  for (const [categoryId, b] of specific) fallback.set(categoryId, b);
  return fallback;
}

/**
 * Orçamento vigente de uma categoria em um mês: o específico do mês (month === mês) tem prioridade;
 * senão o padrão (month === null); senão null.
 */
export function resolveBudget(budgets: Budget[], categoryId: ID, month: MonthKey): Budget | null {
  return (
    resolveAll(
      budgets.filter((b) => b.categoryId === categoryId),
      month,
    ).get(categoryId) ?? null
  );
}

function budgetHealth(spent: Cents, budgeted: Cents, percent: number, projected: Cents): BudgetHealth {
  if (spent > budgeted) return 'estourado';
  if (percent >= ALERT_THRESHOLD || projected > budgeted) return 'alerta';
  return 'ok';
}

/** Despesa que conta como "gasto" de orçamento no mês: paga ou pendente, com categoria, com data no mês. */
function isMonthExpense(tx: Transaction, month: MonthKey): tx is Transaction & { categoryId: ID } {
  return tx.type === 'despesa' && tx.categoryId !== null && isInMonth(tx.date, month);
}

/**
 * Total de despesas (pagas + pendentes) de uma categoria no mês — o mesmo `spent` de budgetStatuses
 * (usado, por exemplo, no formulário de orçamento antes de a categoria ter orçamento).
 */
export function categorySpent(transactions: Transaction[], categoryId: ID, month: MonthKey): Cents {
  let total = 0;
  for (const tx of transactions) if (isMonthExpense(tx, month) && tx.categoryId === categoryId) total += tx.amount;
  return total;
}

interface CategorySpending {
  /** Gastos variáveis (sem recorrência/parcelamento) com data <= today. */
  variableToDate: Cents;
  /** Gastos fixos (recorrência ou parcela) e qualquer gasto com data > today. */
  scheduled: Cents;
}

/**
 * Situação de cada categoria (de despesa, não arquivada) que tem orçamento vigente no mês,
 * ordenada por percent desc (empate: nome).
 *
 * spent = despesas pagas + pendentes da categoria no mês.
 * projected (mês corrente, dias decorridos = dia de `today`): o RITMO DIÁRIO só é aplicado aos gastos variáveis
 * já ocorridos — `round(variáveisAtéHoje / diasDecorridos * diasNoMês) + agendados`, onde "agendados" são os
 * lançamentos de recorrência/parcela (valor fixo, não se repetem no mês) e os lançamentos com data futura.
 * Sem lançamentos fixos/futuros, é exatamente spent / diasDecorridos * diasNoMês. Isso evita que uma conta fixa
 * (ex.: aluguel pago no dia 1º ou gerado como pendente para o dia 25) seja extrapolada para o mês inteiro.
 * O ritmo só vale a partir do 7º dia do mês (MIN_PACE_DAYS): antes, projected = spent (ainda não há dias suficientes
 * para medir o ritmo) — e, portanto, o alerta vem só de percent >= 80%.
 * Meses passados e futuros: projected = spent.
 */
export function budgetStatuses(
  budgets: Budget[],
  transactions: Transaction[],
  categories: Category[],
  month: MonthKey,
  today: ISODate,
): BudgetStatus[] {
  const resolved = resolveAll(budgets, month);
  const eligible = categories.filter((c) => c.kind === 'despesa' && !c.archived && resolved.has(c.id));
  if (eligible.length === 0) return [];

  const spending = new Map<ID, CategorySpending>();
  for (const c of eligible) spending.set(c.id, { variableToDate: 0, scheduled: 0 });
  for (const tx of transactions) {
    if (!isMonthExpense(tx, month)) continue;
    const entry = spending.get(tx.categoryId);
    if (!entry) continue;
    const fixed = tx.recurringId !== null || tx.installment !== null;
    if (!fixed && tx.date <= today) entry.variableToDate += tx.amount;
    else entry.scheduled += tx.amount;
  }

  const isCurrentMonth = monthKey(today) === month;
  const elapsedDays = parseISO(today).day;
  const usePace = isCurrentMonth && elapsedDays >= MIN_PACE_DAYS;
  const monthDays = daysInMonthKey(month);

  const statuses: BudgetStatus[] = [];
  for (const category of eligible) {
    const budget = resolved.get(category.id);
    const entry = spending.get(category.id);
    if (!budget || !entry) continue;
    const { variableToDate, scheduled } = entry;
    const spent = variableToDate + scheduled;
    const budgeted = budget.amount;
    const percent = budgeted > 0 ? spent / budgeted : spent > 0 ? Infinity : 0;
    const projected = usePace ? Math.round((variableToDate / elapsedDays) * monthDays) + scheduled : spent;
    statuses.push({
      categoryId: category.id,
      categoryName: category.name,
      icon: category.icon,
      color: category.color,
      budgetId: budget.id,
      isDefault: budget.month === null,
      budgeted,
      spent,
      remaining: budgeted - spent,
      percent,
      projected,
      status: budgetHealth(spent, budgeted, percent, projected),
    });
  }
  return statuses.sort(
    (a, b) => compareDesc(a.percent, b.percent) || compareText(a.categoryName, b.categoryName),
  );
}

/**
 * Visão consolidada dos orçamentos do mês. `unbudgetedSpent` soma TODAS as despesas do mês (pagas + pendentes)
 * que não estão em nenhum item — categorias sem orçamento, arquivadas, inexistentes ou sem categoria —
 * de modo que totalSpent + unbudgetedSpent = total de despesas do mês.
 */
export function budgetOverview(
  budgets: Budget[],
  transactions: Transaction[],
  categories: Category[],
  month: MonthKey,
  today: ISODate,
): BudgetOverview {
  const items = budgetStatuses(budgets, transactions, categories, month, today);
  const covered = new Set(items.map((i) => i.categoryId));
  let totalBudgeted = 0;
  let totalSpent = 0;
  for (const item of items) {
    totalBudgeted += item.budgeted;
    totalSpent += item.spent;
  }
  let unbudgetedSpent = 0;
  for (const tx of transactions) {
    if (tx.type !== 'despesa' || !isInMonth(tx.date, month)) continue;
    if (tx.categoryId !== null && covered.has(tx.categoryId)) continue;
    unbudgetedSpent += tx.amount;
  }
  return {
    month,
    totalBudgeted,
    totalSpent,
    totalRemaining: totalBudgeted - totalSpent,
    percent: safeRatio(totalSpent, totalBudgeted) ?? 0,
    items,
    unbudgetedSpent,
  };
}

/**
 * Sugestões de orçamento por categoria de despesa (não arquivada) com base na média dos últimos `months`
 * (padrão 3) meses anteriores a `month` (média sobre os meses que tiveram qualquer lançamento).
 * Só inclui categorias com média > 0. `suggested` arredonda a média para cima em múltiplos de R$ 10.
 * Ordenado por média desc (empate: nome da categoria).
 */
export function suggestBudgets(
  transactions: Transaction[],
  categories: Category[],
  month: MonthKey,
  months = 3,
): BudgetSuggestion[] {
  if (months <= 0) return [];
  const window = new Set(lastMonths(addMonthsToKey(month, -1), Math.floor(months)));
  const eligible = new Map<ID, Category>();
  for (const c of categories) if (c.kind === 'despesa' && !c.archived) eligible.set(c.id, c);

  const activeMonths = new Set<MonthKey>();
  const totals = new Map<ID, Cents>();
  const monthsWithSpending = new Map<ID, Set<MonthKey>>();
  for (const tx of transactions) {
    if (!isFlow(tx)) continue;
    const key = monthKey(tx.date);
    if (!window.has(key)) continue;
    activeMonths.add(key);
    if (tx.type !== 'despesa' || tx.categoryId === null || !eligible.has(tx.categoryId)) continue;
    addTo(totals, tx.categoryId, tx.amount);
    const set = monthsWithSpending.get(tx.categoryId) ?? new Set<MonthKey>();
    set.add(key);
    monthsWithSpending.set(tx.categoryId, set);
  }
  if (activeMonths.size === 0) return [];

  const suggestions: (BudgetSuggestion & { name: string })[] = [];
  for (const [categoryId, total] of totals) {
    const average = Math.round(total / activeMonths.size);
    if (average <= 0) continue;
    suggestions.push({
      categoryId,
      average,
      suggested: Math.ceil(average / SUGGESTION_STEP) * SUGGESTION_STEP,
      monthsWithData: monthsWithSpending.get(categoryId)?.size ?? 0,
      name: eligible.get(categoryId)?.name ?? '',
    });
  }
  return suggestions
    .sort((a, b) => b.average - a.average || compareText(a.name, b.name))
    .map(({ name: _name, ...s }) => s);
}
