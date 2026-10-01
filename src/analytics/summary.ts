import type { Category, CategoryKind, Cents, ID, MonthKey, Transaction } from '@/domain/types';
import type { CategoryTotal, GroupBreakdown, MonthSummary } from './types';

export interface SummaryOptions {
  /** Padrão true: pendentes entram nos totais (visão por competência). */
  includePending?: boolean;
}

/** Resumo de receitas/despesas de um mês (ver MonthSummary). Transferências são ignoradas. */
export function monthSummary(transactions: Transaction[], month: MonthKey, opts?: SummaryOptions): MonthSummary {
  void transactions;
  void month;
  void opts;
  throw new Error('não implementado');
}

/** `count` resumos mensais terminando em `endMonth` (inclusive), em ordem cronológica. */
export function monthlySeries(
  transactions: Transaction[],
  endMonth: MonthKey,
  count: number,
  opts?: SummaryOptions,
): MonthSummary[] {
  void transactions;
  void endMonth;
  void count;
  void opts;
  throw new Error('não implementado');
}

/**
 * Totais por categoria para um tipo (despesa/receita) no mês, ordenados por total desc.
 * Lançamentos com categoria inexistente/nula são agrupados em { categoryId: null, name: 'Sem categoria' }.
 */
export function categoryBreakdown(
  transactions: Transaction[],
  categories: Category[],
  month: MonthKey,
  kind: CategoryKind,
  opts?: SummaryOptions,
): CategoryTotal[] {
  void transactions;
  void categories;
  void month;
  void kind;
  void opts;
  throw new Error('não implementado');
}

/** Total gasto (ou recebido) em uma categoria em cada um dos `count` meses até endMonth (cronológico). */
export function categoryTrend(
  transactions: Transaction[],
  categoryId: ID,
  endMonth: MonthKey,
  count: number,
): { month: MonthKey; total: Cents }[] {
  void transactions;
  void categoryId;
  void endMonth;
  void count;
  throw new Error('não implementado');
}

/**
 * Média mensal de despesas nos `months` meses ANTERIORES a `beforeMonth` (exclusivo).
 * Meses sem nenhum lançamento (nem receita nem despesa) são ignorados na média; se nenhum mês tiver dados, retorna 0.
 * Se `categoryIds` for informado, considera só essas categorias.
 */
export function averageMonthlyExpense(
  transactions: Transaction[],
  beforeMonth: MonthKey,
  months: number,
  categoryIds?: ID[],
): Cents {
  void transactions;
  void beforeMonth;
  void months;
  void categoryIds;
  throw new Error('não implementado');
}

/** Igual a averageMonthlyExpense, para receitas. */
export function averageMonthlyIncome(transactions: Transaction[], beforeMonth: MonthKey, months: number): Cents {
  void transactions;
  void beforeMonth;
  void months;
  throw new Error('não implementado');
}

/** Distribuição das despesas do mês nos grupos da regra 50/30/20. */
export function groupBreakdown(transactions: Transaction[], categories: Category[], month: MonthKey): GroupBreakdown {
  void transactions;
  void categories;
  void month;
  throw new Error('não implementado');
}

/** Maiores despesas do mês (por valor desc, depois data desc). */
export function topExpenses(transactions: Transaction[], month: MonthKey, limit: number): Transaction[] {
  void transactions;
  void month;
  void limit;
  throw new Error('não implementado');
}

/** Comparação entre dois meses por categoria de despesa (diferença = atual - anterior), ordenada por |diff| desc. */
export function compareMonthsByCategory(
  transactions: Transaction[],
  categories: Category[],
  month: MonthKey,
  previousMonth: MonthKey,
): { categoryId: ID | null; name: string; icon: string; current: Cents; previous: Cents; diff: Cents }[] {
  void transactions;
  void categories;
  void month;
  void previousMonth;
  throw new Error('não implementado');
}
