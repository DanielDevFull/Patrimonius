/**
 * Funções puras da página de relatórios (sem React, sem banco). Testadas em report-utils.test.ts.
 */
import { categoryBreakdown, type GroupBreakdown, type MonthSummary } from '@/analytics';
import { endOfMonth, lastMonths, startOfMonth } from '@/domain/dates';
import { safeRatio } from '@/domain/money';
import type { BudgetGroup, Category, CategoryKind, Cents, ID, ISODate, MonthKey, Transaction } from '@/domain/types';

/* ------------------------------------------------------------------ */
/* Período                                                             */
/* ------------------------------------------------------------------ */

export type PeriodLength = 3 | 6 | 12;

export const PERIOD_OPTIONS: { value: `${PeriodLength}`; label: string }[] = [
  { value: '3', label: '3 meses' },
  { value: '6', label: '6 meses' },
  { value: '12', label: '12 meses' },
];

export function parsePeriod(value: string | null | undefined): PeriodLength {
  return value === '3' || value === '12' ? (Number(value) as PeriodLength) : 6;
}

/** Os `length` meses terminando em `endMonth` (inclusive), em ordem cronológica. */
export function periodMonths(endMonth: MonthKey, length: number): MonthKey[] {
  return lastMonths(endMonth, Math.max(1, Math.floor(length)));
}

/** Primeiro e último dia do período. */
export function periodRange(months: MonthKey[]): { start: ISODate; end: ISODate } {
  return { start: startOfMonth(months[0]), end: endOfMonth(months[months.length - 1]) };
}

/** Lançamentos (de qualquer tipo e status) com data dentro do período. */
export function periodTransactions(transactions: Transaction[], months: MonthKey[]): Transaction[] {
  if (months.length === 0) return [];
  const { start, end } = periodRange(months);
  return transactions.filter((tx) => tx.date >= start && tx.date <= end);
}

/** 'patrimonius-lancamentos-2026-05-a-2026-10.csv' (ou '…-2026-10.csv' para um único mês). */
export function csvFileName(months: MonthKey[]): string {
  const first = months[0];
  const last = months[months.length - 1];
  return first === last ? `patrimonius-lancamentos-${first}.csv` : `patrimonius-lancamentos-${first}-a-${last}.csv`;
}

/* ------------------------------------------------------------------ */
/* Categorias x meses                                                  */
/* ------------------------------------------------------------------ */

export interface CategoryMatrixRow {
  categoryId: ID | null;
  name: string;
  icon: string;
  color: string;
  /** Um valor por mês do período (mesma ordem de `months`). */
  values: Cents[];
  total: Cents;
  /** Média mensal no período (total ÷ nº de meses do período, arredondada ao centavo). */
  average: Cents;
}

export interface CategoryMatrix {
  months: MonthKey[];
  rows: CategoryMatrixRow[];
  monthTotals: Cents[];
  total: Cents;
  average: Cents;
}

/**
 * Tabela categorias x meses para um tipo (despesa/receita), por competência (pagos + pendentes).
 * Linhas ordenadas por total desc (empate: nome). Sem categoria/inexistente => linha 'Sem categoria'.
 * A média divide pelo número de meses do período (meses sem gasto contam como zero).
 */
export function categoryMatrix(
  transactions: Transaction[],
  categories: Category[],
  months: MonthKey[],
  kind: CategoryKind,
): CategoryMatrix {
  const byKey = new Map<ID | null, CategoryMatrixRow>();
  const monthTotals = months.map(() => 0);
  months.forEach((month, i) => {
    for (const r of categoryBreakdown(transactions, categories, month, kind)) {
      let row = byKey.get(r.categoryId);
      if (!row) {
        row = {
          categoryId: r.categoryId,
          name: r.name,
          icon: r.icon,
          color: r.color,
          values: months.map(() => 0),
          total: 0,
          average: 0,
        };
        byKey.set(r.categoryId, row);
      }
      row.values[i] += r.total;
      row.total += r.total;
      monthTotals[i] += r.total;
    }
  });
  const n = Math.max(1, months.length);
  const rows = [...byKey.values()]
    .map((row) => ({ ...row, average: Math.round(row.total / n) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));
  const total = monthTotals.reduce((s, v) => s + v, 0);
  return { months, rows, monthTotals, total, average: Math.round(total / n) };
}

/* ------------------------------------------------------------------ */
/* Fluxo de caixa                                                      */
/* ------------------------------------------------------------------ */

export interface CashflowRow extends MonthSummary {
  /** Soma dos resultados (receitas − despesas) do início do período até este mês. */
  accumulated: Cents;
}

export function cashflowRows(series: MonthSummary[]): CashflowRow[] {
  let running = 0;
  return series.map((m) => {
    running += m.net;
    return { ...m, accumulated: running };
  });
}

export interface CashflowTotals {
  income: Cents;
  expense: Cents;
  net: Cents;
  invested: Cents;
  /** (Σ resultado + Σ investido) ÷ Σ receitas; null sem receitas. */
  savingsRate: number | null;
}

export function cashflowTotals(series: MonthSummary[]): CashflowTotals {
  let income = 0;
  let expense = 0;
  let invested = 0;
  for (const m of series) {
    income += m.income;
    expense += m.expense;
    invested += m.invested;
  }
  const net = income - expense;
  return { income, expense, net, invested, savingsRate: safeRatio(net + invested, income) };
}

/* ------------------------------------------------------------------ */
/* Regra 50/30/20                                                      */
/* ------------------------------------------------------------------ */

export type RuleStatus = 'ok' | 'acima' | 'abaixo';

export interface RuleRow {
  group: BudgetGroup;
  actual: Cents;
  ideal: Cents;
  /** Participação real sobre a renda (null sem renda). */
  share: number | null;
  idealShare: number;
  /** actual − ideal */
  diff: Cents;
  /**
   * necessidades/desejos: 'ok' até o ideal, 'acima' depois dele (é um teto);
   * objetivos: 'ok' a partir do ideal, 'abaixo' antes dele (é um piso).
   */
  status: RuleStatus;
}

export const RULE_TARGETS: Record<BudgetGroup, number> = { necessidades: 0.5, desejos: 0.3, objetivos: 0.2 };

export function ruleRows(b: GroupBreakdown): RuleRow[] {
  const groups: BudgetGroup[] = ['necessidades', 'desejos', 'objetivos'];
  return groups.map((group) => {
    const actual = b[group];
    const ideal = b.ideal[group];
    const share = b.shares[group];
    const idealShare = RULE_TARGETS[group];
    const status: RuleStatus =
      group === 'objetivos' ? (actual >= ideal ? 'ok' : 'abaixo') : actual <= ideal ? 'ok' : 'acima';
    return { group, actual, ideal, share, idealShare, diff: actual - ideal, status };
  });
}

/** Renda que não foi gasta nem destinada a objetivos no mês (pode ser negativa se gastou mais que ganhou). */
export function unallocatedIncome(b: GroupBreakdown): Cents {
  return b.income - b.necessidades - b.desejos - b.objetivos - b.semGrupo;
}

/* ------------------------------------------------------------------ */
/* Comparativo                                                         */
/* ------------------------------------------------------------------ */

export type ChangeDirection = 'up' | 'down' | 'same';

export function changeDirection(diff: number): ChangeDirection {
  if (diff > 0) return 'up';
  if (diff < 0) return 'down';
  return 'same';
}

/** Variação relativa (atual − anterior) ÷ anterior; null se o anterior for 0. */
export function relativeChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}
