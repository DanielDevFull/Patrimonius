/**
 * Funções puras de apoio à tela de Orçamentos (sem acesso ao banco).
 */
import {
  averageMonthlyIncome,
  categoryBreakdown,
  type BudgetHealth,
  type BudgetStatus,
  type BudgetSuggestion,
  type CategoryTotal,
} from '@/analytics';
import { addMonthsToKey, daysInMonthKey, isInMonth, monthKey, parseISO } from '@/domain/dates';
import type {
  Budget,
  BudgetGroup,
  Category,
  Cents,
  ID,
  ISODate,
  MonthKey,
  Settings,
  Transaction,
} from '@/domain/types';
import type { BadgeTone } from '@/components/ui';

/* ------------------------------------------------------------------ */
/* Status e escopo                                                     */
/* ------------------------------------------------------------------ */

export const BUDGET_HEALTH_META: Record<BudgetHealth, { label: string; tone: BadgeTone }> = {
  ok: { label: 'Dentro do limite', tone: 'positive' },
  alerta: { label: 'Atenção', tone: 'warning' },
  estourado: { label: 'Estourado', tone: 'negative' },
};

/** 'padrao' = vale para todos os meses (month null); 'mes' = só o mês selecionado. */
export type BudgetScope = 'padrao' | 'mes';

export interface BudgetSavePlan {
  /** Mês a gravar no orçamento (null = padrão). */
  month: MonthKey | null;
  /** Orçamentos a remover depois de gravar. */
  removeIds: ID[];
}

/**
 * Como gravar um orçamento conforme o escopo escolhido.
 * - 'mes': grava um orçamento específico do mês (o padrão, se existir, continua valendo nos outros meses).
 * - 'padrao': grava o padrão e remove o orçamento específico da categoria NESTE mês (se houver), para que o novo
 *   padrão passe a valer também aqui. Exceções específicas de outros meses são preservadas.
 */
export function planBudgetSave(
  budgets: Budget[],
  categoryId: ID,
  scope: BudgetScope,
  month: MonthKey,
): BudgetSavePlan {
  if (scope === 'mes') return { month, removeIds: [] };
  const removeIds = budgets.filter((b) => b.categoryId === categoryId && b.month === month).map((b) => b.id);
  return { month: null, removeIds };
}

/** Orçamento padrão (month null) da categoria, se houver. */
export function defaultBudgetOf(budgets: Budget[], categoryId: ID): Budget | null {
  let found: Budget | null = null;
  for (const b of budgets) {
    if (b.categoryId !== categoryId || b.month !== null) continue;
    if (!found || b.updatedAt > found.updatedAt) found = b;
  }
  return found;
}

/** Quantos orçamentos específicos existem em um mês. */
export function specificBudgetCount(budgets: Budget[], month: MonthKey): number {
  return budgets.filter((b) => b.month === month).length;
}

/* ------------------------------------------------------------------ */
/* Categorias sem orçamento                                            */
/* ------------------------------------------------------------------ */

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/** Categorias de despesa ativas que ainda não têm orçamento vigente no mês (ordem alfabética). */
export function categoriesWithoutBudget(categories: Category[], items: BudgetStatus[]): Category[] {
  const covered = new Set(items.map((i) => i.categoryId));
  return categories
    .filter((c) => c.kind === 'despesa' && !c.archived && !covered.has(c.id))
    .sort((a, b) => collator.compare(a.name, b.name));
}

export interface UnbudgetedRow extends CategoryTotal {
  /** true se dá para criar um orçamento para a categoria (despesa ativa existente). */
  canBudget: boolean;
}

/** Gastos do mês em categorias sem orçamento (inclui "Sem categoria"), do maior para o menor. */
export function unbudgetedSpending(
  transactions: Transaction[],
  categories: Category[],
  month: MonthKey,
  items: BudgetStatus[],
): UnbudgetedRow[] {
  const covered = new Set(items.map((i) => i.categoryId));
  const active = new Set(categories.filter((c) => c.kind === 'despesa' && !c.archived).map((c) => c.id));
  return categoryBreakdown(transactions, categories, month, 'despesa')
    .filter((row) => row.categoryId === null || !covered.has(row.categoryId))
    .map((row) => ({ ...row, canBudget: row.categoryId !== null && active.has(row.categoryId) }));
}

/** Total de despesas (pagas + pendentes) de uma categoria no mês. */
export function categorySpent(transactions: Transaction[], categoryId: ID, month: MonthKey): Cents {
  let total = 0;
  for (const tx of transactions) {
    if (tx.type === 'despesa' && tx.categoryId === categoryId && isInMonth(tx.date, month)) total += tx.amount;
  }
  return total;
}

/* ------------------------------------------------------------------ */
/* Ritmo do mês                                                        */
/* ------------------------------------------------------------------ */

export interface DailyAllowance {
  /** Dias restantes no mês, contando hoje. */
  daysLeft: number;
  /** Quanto ainda dá para gastar por dia sem estourar o total orçado (0 se já estourou). */
  perDay: Cents;
}

/** Só faz sentido no mês corrente; retorna null para outros meses. */
export function dailyAllowance(remaining: Cents, month: MonthKey, today: ISODate): DailyAllowance | null {
  if (monthKey(today) !== month) return null;
  const daysLeft = daysInMonthKey(month) - parseISO(today).day + 1;
  return { daysLeft, perDay: remaining > 0 ? Math.floor(remaining / daysLeft) : 0 };
}

/** Mês anterior ao informado. */
export function previousMonth(month: MonthKey): MonthKey {
  return addMonthsToKey(month, -1);
}

/* ------------------------------------------------------------------ */
/* Sugestões                                                           */
/* ------------------------------------------------------------------ */

export interface SuggestionRow {
  categoryId: ID;
  name: string;
  icon: string;
  color: string;
  average: Cents;
  suggested: Cents;
  monthsWithData: number;
  /** Orçamento vigente no mês (para comparação), se houver. */
  current: { amount: Cents; isDefault: boolean } | null;
  /** Marcado por padrão quando a categoria ainda não tem orçamento. */
  checked: boolean;
}

/** Junta as sugestões com o nome/ícone da categoria e o orçamento vigente. */
export function buildSuggestionRows(
  suggestions: BudgetSuggestion[],
  categories: Category[],
  items: BudgetStatus[],
): SuggestionRow[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const current = new Map(items.map((i) => [i.categoryId, i]));
  const rows: SuggestionRow[] = [];
  for (const s of suggestions) {
    const category = byId.get(s.categoryId);
    if (!category) continue;
    const item = current.get(s.categoryId);
    rows.push({
      categoryId: s.categoryId,
      name: category.name,
      icon: category.icon,
      color: category.color,
      average: s.average,
      suggested: s.suggested,
      monthsWithData: s.monthsWithData,
      current: item ? { amount: item.budgeted, isDefault: item.isDefault } : null,
      checked: !item,
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Regra 50/30/20                                                      */
/* ------------------------------------------------------------------ */

export const BUDGET_GROUPS: BudgetGroup[] = ['necessidades', 'desejos', 'objetivos'];

export const RULE_SHARES: Record<BudgetGroup, number> = { necessidades: 0.5, desejos: 0.3, objetivos: 0.2 };

/** Meses de histórico usados para a renda média. */
export const RULE_INCOME_MONTHS = 3;

export type IncomeSource = 'historico' | 'estimativa' | 'nenhuma';

/**
 * - 'dentro': necessidades/desejos até o ideal; objetivos a partir do ideal.
 * - 'acima': necessidades/desejos acima do ideal.
 * - 'abaixo': objetivos abaixo do ideal.
 * - 'vazio': nenhum orçamento no grupo.
 */
export type RuleVerdict = 'dentro' | 'acima' | 'abaixo' | 'vazio';

export interface RuleGroupLine {
  group: BudgetGroup;
  share: number;
  ideal: Cents;
  budgeted: Cents;
  /** budgeted - ideal */
  diff: Cents;
  /** budgeted / ideal (null quando o ideal é 0). */
  ratio: number | null;
  verdict: RuleVerdict;
}

export interface RuleAnalysis {
  income: Cents;
  source: IncomeSource;
  lines: RuleGroupLine[];
  /** Orçamentos em categorias sem grupo 50/30/20. */
  ungrouped: Cents;
  totalBudgeted: Cents;
  /** income - totalBudgeted (negativo = orçamentos acima da renda). */
  unallocated: Cents;
}

/**
 * Renda base da regra: média dos 3 meses anteriores ao mês analisado; se não houver receitas nesse período,
 * a renda mensal estimada das configurações; senão 0 ('nenhuma').
 */
export function ruleIncome(
  transactions: Transaction[],
  settings: Settings,
  month: MonthKey,
): { income: Cents; source: IncomeSource } {
  const average = averageMonthlyIncome(transactions, month, RULE_INCOME_MONTHS);
  if (average > 0) return { income: average, source: 'historico' };
  const estimate = settings.monthlyIncomeEstimate;
  if (estimate !== null && estimate > 0) return { income: estimate, source: 'estimativa' };
  return { income: 0, source: 'nenhuma' };
}

function verdictFor(group: BudgetGroup, budgeted: Cents, ideal: Cents): RuleVerdict {
  if (budgeted === 0) return 'vazio';
  if (group === 'objetivos') return budgeted >= ideal ? 'dentro' : 'abaixo';
  return budgeted <= ideal ? 'dentro' : 'acima';
}

/** Compara a soma dos orçamentos vigentes por grupo com o ideal 50/30/20 da renda base. */
export function ruleAnalysis(
  items: BudgetStatus[],
  categories: Category[],
  transactions: Transaction[],
  settings: Settings,
  month: MonthKey,
): RuleAnalysis {
  const { income, source } = ruleIncome(transactions, settings, month);
  const groupOf = new Map(categories.map((c) => [c.id, c.group]));
  const sums: Record<BudgetGroup, Cents> = { necessidades: 0, desejos: 0, objetivos: 0 };
  let ungrouped = 0;
  let totalBudgeted = 0;
  for (const item of items) {
    totalBudgeted += item.budgeted;
    const group = groupOf.get(item.categoryId) ?? null;
    if (group) sums[group] += item.budgeted;
    else ungrouped += item.budgeted;
  }
  const lines = BUDGET_GROUPS.map((group): RuleGroupLine => {
    const share = RULE_SHARES[group];
    const ideal = Math.round(income * share);
    const budgeted = sums[group];
    return {
      group,
      share,
      ideal,
      budgeted,
      diff: budgeted - ideal,
      ratio: ideal > 0 ? budgeted / ideal : null,
      verdict: verdictFor(group, budgeted, ideal),
    };
  });
  return { income, source, lines, ungrouped, totalBudgeted, unallocated: income - totalBudgeted };
}
