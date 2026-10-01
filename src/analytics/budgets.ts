import type { Budget, Category, ID, ISODate, MonthKey, Transaction } from '@/domain/types';
import type { BudgetOverview, BudgetStatus, BudgetSuggestion } from './types';

/**
 * Orçamento vigente de uma categoria em um mês: o específico do mês (month === mês) tem prioridade;
 * senão o padrão (month === null); senão null.
 */
export function resolveBudget(budgets: Budget[], categoryId: ID, month: MonthKey): Budget | null {
  void budgets;
  void categoryId;
  void month;
  throw new Error('não implementado');
}

/**
 * Situação de cada categoria (de despesa, não arquivada) que tem orçamento vigente no mês.
 * `today` é usado para a projeção do mês corrente.
 */
export function budgetStatuses(
  budgets: Budget[],
  transactions: Transaction[],
  categories: Category[],
  month: MonthKey,
  today: ISODate,
): BudgetStatus[] {
  void budgets;
  void transactions;
  void categories;
  void month;
  void today;
  throw new Error('não implementado');
}

/** Visão consolidada dos orçamentos do mês. */
export function budgetOverview(
  budgets: Budget[],
  transactions: Transaction[],
  categories: Category[],
  month: MonthKey,
  today: ISODate,
): BudgetOverview {
  void budgets;
  void transactions;
  void categories;
  void month;
  void today;
  throw new Error('não implementado');
}

/**
 * Sugestões de orçamento por categoria de despesa com base na média dos últimos `months` meses anteriores a `month`
 * (média sobre os meses que tiveram qualquer lançamento). Só inclui categorias com média > 0. Ordenado por média desc.
 */
export function suggestBudgets(
  transactions: Transaction[],
  categories: Category[],
  month: MonthKey,
  months?: number,
): BudgetSuggestion[] {
  void transactions;
  void categories;
  void month;
  void months;
  throw new Error('não implementado');
}
