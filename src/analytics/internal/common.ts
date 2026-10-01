/**
 * Helpers internos compartilhados pelos módulos de análise (balances, summary, budgets, recurring, forecast).
 * Não são exportados por `@/analytics` — importe-os apenas dentro de src/analytics.
 */
import type { Category, Cents, ID, Transaction } from '@/domain/types';

/** Lançamento de receita ou despesa (exclui transferências). */
export type FlowTransaction = Transaction & { type: 'despesa' | 'receita' };

export function isFlow(tx: Transaction): tx is FlowTransaction {
  return tx.type === 'despesa' || tx.type === 'receita';
}

/** true se o status do lançamento deve entrar no cálculo. */
export function statusIncluded(tx: Transaction, includePending: boolean): boolean {
  return tx.status === 'pago' || (includePending && tx.status === 'pendente');
}

/** Rótulos usados quando o lançamento não tem categoria (ou ela não existe mais). */
export const UNCATEGORIZED = {
  name: 'Sem categoria',
  icon: '❔',
  color: '#94a3b8',
} as const;

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/** Comparação de textos em pt-BR (ignora acentos/caixa), para desempates determinísticos. */
export function compareText(a: string, b: string): number {
  return collator.compare(a, b);
}

/** Comparação numérica descendente que suporta Infinity (evita NaN de Infinity - Infinity). */
export function compareDesc(a: number, b: number): number {
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

/** Mapa id -> categoria. */
export function indexCategories(categories: Category[]): Map<ID, Category> {
  const map = new Map<ID, Category>();
  for (const c of categories) map.set(c.id, c);
  return map;
}

/** Mediana de valores inteiros em centavos (média dos dois centrais arredondada quando a quantidade é par). */
export function medianCents(values: Cents[]): Cents {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Soma um valor em um Map<chave, número>. */
export function addTo<K>(map: Map<K, number>, key: K, value: number): void {
  map.set(key, (map.get(key) ?? 0) + value);
}

/** Chave de uma ocorrência de recorrência materializada (recurringId + data). */
export function occurrenceKey(recurringId: ID, date: string): string {
  return `${recurringId}|${date}`;
}

/** Chaves recurringId|date dos lançamentos já gerados a partir de recorrências. */
export function materializedKeys(transactions: Transaction[]): Set<string> {
  const keys = new Set<string>();
  for (const tx of transactions)
    if (tx.recurringId !== null) keys.add(occurrenceKey(tx.recurringId, tx.date));
  return keys;
}

/** Comparação lexicográfica simples (estável e independente de localidade), ex.: datas ISO e chaves. */
export function compareRaw(a: string, b: string): number {
  return a === b ? 0 : a < b ? -1 : 1;
}
