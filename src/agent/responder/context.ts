/**
 * Contexto e utilitários compartilhados pelos handlers de intenção do Pat.
 * Cada handler é uma função pura (TurnContext) => HandlerOutput.
 */
import { categoryBreakdown, categoryBreakdownInRange, type CategoryTotal } from '@/analytics';
import { isBetween, monthKey } from '@/domain/dates';
import type {
  Account,
  Category,
  CategoryKind,
  FinanceData,
  ID,
  ISODate,
  MonthKey,
  Transaction,
} from '@/domain/types';
import { monthPeriod, periodMonth } from '../format';
import type {
  AgentAction,
  AgentCard,
  ConversationState,
  IntentName,
  ParsedEntities,
  ParsedIntent,
  Period,
} from '../types';

export interface TurnContext {
  data: FinanceData;
  today: ISODate;
  /** Mês de `today`. */
  month: MonthKey;
  /** Primeiro nome do usuário ('' se não informado). */
  name: string;
  /** Intenção efetivamente tratada (após completar continuações com o estado). */
  intent: IntentName;
  parsed: ParsedIntent;
  /** Entidades efetivas: as da mensagem, completadas pelo estado quando é uma continuação. */
  entities: ParsedEntities;
  state: ConversationState;
}

/** Memória que a resposta deixa para a próxima mensagem (lastIntent é preenchido pelo respondedor). */
export type Memory = Omit<ConversationState, 'lastIntent'>;

export interface HandlerOutput {
  text: string;
  cards?: AgentCard[];
  actions?: AgentAction[];
  suggestions?: string[];
  /** 'keep' mantém o estado anterior intacto (ex.: agradecimento). Padrão: {}. */
  memory?: Memory | 'keep';
}

export type Handler = (ctx: TurnContext) => HandlerOutput;

/* ------------------------------------------------------------------ */
/* Busca de entidades                                                  */
/* ------------------------------------------------------------------ */

export function findCategory(data: FinanceData, id: ID | null | undefined): Category | undefined {
  if (!id) return undefined;
  return data.categories.find((c) => c.id === id);
}

export function findAccount(data: FinanceData, id: ID | null | undefined): Account | undefined {
  if (!id) return undefined;
  return data.accounts.find((a) => a.id === id);
}

export function activeAccounts(data: FinanceData): Account[] {
  return data.accounts.filter((a) => !a.archived);
}

/** Categoria válida (existe, não arquivada e do tipo esperado). */
export function validCategory(data: FinanceData, id: ID | undefined, kind: CategoryKind): Category | undefined {
  const category = findCategory(data, id);
  return category && !category.archived && category.kind === kind ? category : undefined;
}

/* ------------------------------------------------------------------ */
/* Períodos                                                            */
/* ------------------------------------------------------------------ */

/** Período informado ou o mês corrente. */
export function periodOrThisMonth(ctx: TurnContext): Period {
  return ctx.entities.period ?? monthPeriod(ctx.month, ctx.today);
}

/** Mês de referência para consultas mensais: o mês do período (se for um mês) ou o mês do início do período. */
export function referenceMonth(ctx: TurnContext): MonthKey {
  const period = ctx.entities.period;
  if (!period) return ctx.month;
  return periodMonth(period) ?? monthKey(period.start);
}

/** Lançamentos de um tipo dentro do período (inclusive), com filtros opcionais. */
export function transactionsIn(
  data: FinanceData,
  period: Period,
  type: Transaction['type'],
  filter: { categoryId?: ID; accountId?: ID } = {},
): Transaction[] {
  return data.transactions.filter(
    (tx) =>
      tx.type === type &&
      isBetween(tx.date, period.start, period.end) &&
      (filter.categoryId === undefined || tx.categoryId === filter.categoryId) &&
      (filter.accountId === undefined || tx.accountId === filter.accountId),
  );
}

/**
 * Totais por categoria no período (pagos + pendentes, 'Sem categoria' quando não existe). Para um mês do
 * calendário usa `categoryBreakdown`; para outros períodos (ou filtrando uma conta), `categoryBreakdownInRange` —
 * as mesmas regras e o mesmo desempate, ambos de @/analytics.
 */
export function breakdownFor(
  data: FinanceData,
  period: Period,
  kind: CategoryKind,
  accountId?: ID,
): CategoryTotal[] {
  const month = periodMonth(period);
  if (month && accountId === undefined) return categoryBreakdown(data.transactions, data.categories, month, kind);
  return categoryBreakdownInRange(data.transactions, data.categories, period.start, period.end, kind, { accountId });
}

/** Soma de valores. */
export function sum(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
