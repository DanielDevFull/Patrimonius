/**
 * Filtros e agrupamento da lista de lançamentos (funções puras).
 */
import { formatDateRelative, formatDateShort, isInMonth, weekday, WEEKDAYS } from '@/domain/dates';
import { capitalize, normalizeText } from '@/domain/text';
import type {
  Account,
  Category,
  Cents,
  ID,
  ISODate,
  MonthKey,
  Transaction,
  TransactionStatus,
  TransactionType,
} from '@/domain/types';

export interface TransactionFilters {
  type: TransactionType | 'todos';
  /** Conta de origem OU destino. */
  accountId: ID | 'todas';
  categoryId: ID | 'todas';
  status: TransactionStatus | 'todos';
  query: string;
}

export const EMPTY_FILTERS: TransactionFilters = {
  type: 'todos',
  accountId: 'todas',
  categoryId: 'todas',
  status: 'todos',
  query: '',
};

export function activeFilterCount(f: TransactionFilters): number {
  return (
    Number(f.type !== 'todos') +
    Number(f.accountId !== 'todas') +
    Number(f.categoryId !== 'todas') +
    Number(f.status !== 'todos') +
    Number(f.query.trim() !== '')
  );
}

export interface Lookups {
  accounts: Map<ID, Account>;
  categories: Map<ID, Category>;
}

export function buildLookups(accounts: Account[], categories: Category[]): Lookups {
  return {
    accounts: new Map(accounts.map((a) => [a.id, a])),
    categories: new Map(categories.map((c) => [c.id, c])),
  };
}

/** Texto pesquisável (normalizado) de um lançamento: descrição, observações, tags, categoria e contas. */
export function searchableText(tx: Transaction, lookups: Lookups): string {
  const parts = [tx.description, tx.notes, ...tx.tags];
  if (tx.categoryId) parts.push(lookups.categories.get(tx.categoryId)?.name ?? '');
  parts.push(lookups.accounts.get(tx.accountId)?.name ?? '');
  if (tx.toAccountId) parts.push(lookups.accounts.get(tx.toAccountId)?.name ?? '');
  return normalizeText(parts.join(' '));
}

/**
 * Lançamentos do mês que passam pelos filtros. A busca ignora acentos/caixa e exige que TODAS as palavras
 * digitadas apareçam (em qualquer ordem) na descrição, observações, tags, categoria ou contas.
 */
export function filterTransactions(
  transactions: Transaction[],
  month: MonthKey,
  filters: TransactionFilters,
  lookups: Lookups,
): Transaction[] {
  const words = normalizeText(filters.query).split(' ').filter(Boolean);
  return transactions.filter((tx) => {
    if (!isInMonth(tx.date, month)) return false;
    if (filters.type !== 'todos' && tx.type !== filters.type) return false;
    if (filters.status !== 'todos' && tx.status !== filters.status) return false;
    if (
      filters.accountId !== 'todas' &&
      tx.accountId !== filters.accountId &&
      tx.toAccountId !== filters.accountId
    ) {
      return false;
    }
    if (filters.categoryId !== 'todas' && tx.categoryId !== filters.categoryId) return false;
    if (words.length) {
      const text = searchableText(tx, lookups);
      if (!words.every((w) => text.includes(w))) return false;
    }
    return true;
  });
}

/** Ordem da lista: data desc, depois criação desc (o último registrado aparece primeiro), depois id. */
export function compareForList(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export interface DayGroup {
  date: ISODate;
  /** Receitas - despesas do dia (transferências não entram). */
  subtotal: Cents;
  transactions: Transaction[];
}

/** Agrupa lançamentos JÁ ORDENADOS por data (desc) em grupos por dia, preservando a ordem. */
export function groupByDay(sorted: Transaction[]): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: DayGroup | null = null;
  for (const tx of sorted) {
    if (!current || current.date !== tx.date) {
      current = { date: tx.date, subtotal: 0, transactions: [] };
      groups.push(current);
    }
    current.transactions.push(tx);
    if (tx.type === 'receita') current.subtotal += tx.amount;
    else if (tx.type === 'despesa') current.subtotal -= tx.amount;
  }
  return groups;
}

/** Totais dos lançamentos filtrados (para o rodapé "N lançamentos"). */
export function filteredTotals(list: Transaction[]): { income: Cents; expense: Cents; count: number } {
  let income = 0;
  let expense = 0;
  for (const tx of list) {
    if (tx.type === 'receita') income += tx.amount;
    else if (tx.type === 'despesa') expense += tx.amount;
  }
  return { income, expense, count: list.length };
}

/**
 * Cabeçalho de um dia na lista: 'Hoje · quinta-feira', 'Ontem · quarta-feira', 'Amanhã · sexta-feira'
 * ou 'Segunda-feira, 05 out' para as demais datas.
 */
export function dayLabel(date: ISODate, today: ISODate): string {
  const relative = formatDateRelative(date, today);
  const day = WEEKDAYS[weekday(date)];
  if (relative === 'hoje' || relative === 'ontem' || relative === 'amanhã')
    return `${capitalize(relative)} · ${day}`;
  return `${capitalize(day)}, ${formatDateShort(date)}`;
}
