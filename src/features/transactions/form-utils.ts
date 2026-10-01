/**
 * Regras puras do formulário de lançamento (validação, valores padrão, tags, parcelas).
 * Mantidas fora do componente para serem testadas isoladamente.
 */
import { isISODate } from '@/domain/dates';
import { splitCents } from '@/domain/money';
import { normalizeText } from '@/domain/text';
import type {
  Account,
  BudgetGroup,
  Category,
  CategoryKind,
  Cents,
  ID,
  Transaction,
  TransactionType,
} from '@/domain/types';

export const MAX_INSTALLMENTS = 48;

const INSTALLMENT_SUFFIX = /\s*\(\s*\d+\s*\/\s*\d+\s*\)\s*$/;

/** Remove o sufixo de parcela " (2/10)" da descrição. */
export function stripInstallmentSuffix(description: string): string {
  return description.replace(INSTALLMENT_SUFFIX, '').trim();
}

/** 'Viagem, viagem , Férias,,' => ['Viagem', 'Férias'] (sem vazias, sem repetidas ignorando caixa/acento). */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of text.split(',')) {
    const tag = raw.trim().replace(/\s+/g, ' ');
    if (!tag) continue;
    const key = normalizeText(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

export function formatTags(tags: string[]): string {
  return tags.join(', ');
}

/** Converte o texto do campo de parcelas em inteiro 1..48 (null se inválido). */
export function parseInstallments(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= MAX_INSTALLMENTS ? n : null;
}

export interface InstallmentPreview {
  count: number;
  /** Valor da 1ª parcela (recebe os centavos que sobram). */
  first: Cents;
  /** Valor das demais parcelas. */
  regular: Cents;
}

/** Prévia "10x de R$ X" usando a mesma divisão do repositório (sem perder centavos). */
export function installmentPreview(total: Cents | null, count: number | null): InstallmentPreview | null {
  if (total === null || total <= 0 || count === null || count < 2) return null;
  const parts = splitCents(total, count);
  return { count, first: parts[0], regular: parts[parts.length - 1] };
}

/** Contas não arquivadas, na ordem em que foram criadas (empate: nome). */
export function activeAccounts(accounts: Account[]): Account[] {
  return accounts
    .filter((a) => !a.archived)
    .sort((a, b) =>
      a.createdAt === b.createdAt
        ? a.name.localeCompare(b.name, 'pt-BR')
        : a.createdAt < b.createdAt
          ? -1
          : 1,
    );
}

/**
 * Conta sugerida para um novo lançamento: a do lançamento mais recente do mesmo tipo (se ainda ativa);
 * senão a primeira conta que não seja cartão/investimento; senão a primeira conta ativa.
 */
export function defaultAccountId(
  accounts: Account[],
  transactions: Transaction[],
  type: TransactionType,
): ID | null {
  const active = activeAccounts(accounts);
  if (active.length === 0) return null;
  const ids = new Set(active.map((a) => a.id));
  let latest: Transaction | null = null;
  for (const tx of transactions) {
    if (tx.type !== type || !ids.has(tx.accountId)) continue;
    if (!latest || tx.createdAt > latest.createdAt) latest = tx;
  }
  if (latest) return latest.accountId;
  const preferred = active.find((a) => a.type !== 'cartao_credito' && a.type !== 'investimento');
  return (preferred ?? active[0]).id;
}

/** Primeira conta ativa diferente de `exceptId` (destino padrão de transferências). */
export function otherAccountId(accounts: Account[], exceptId: ID | null): ID | null {
  return activeAccounts(accounts).find((a) => a.id !== exceptId)?.id ?? null;
}

/**
 * Descrições usadas anteriormente (sem sufixo de parcela), da mais recente para a mais antiga,
 * sem repetições (ignorando caixa/acentos). Usadas no <datalist> do campo de descrição.
 */
export function previousDescriptions(
  transactions: Transaction[],
  type: TransactionType,
  limit = 150,
): string[] {
  const sorted = transactions
    .filter((t) => t.type === type)
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tx of sorted) {
    const description = stripInstallmentSuffix(tx.description);
    const key = normalizeText(description);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(description);
    if (result.length >= limit) break;
  }
  return result;
}

const GROUP_ORDER: (BudgetGroup | null)[] = ['necessidades', 'desejos', 'objetivos', null];
const GROUP_TITLES: Record<string, string> = {
  necessidades: 'Necessidades',
  desejos: 'Desejos',
  objetivos: 'Objetivos financeiros',
  outras: 'Outras',
};

export interface CategoryOptionGroup {
  label: string | null;
  categories: Category[];
}

/**
 * Categorias para o seletor: não arquivadas do tipo (mais a `keepId`, mesmo arquivada, para edição).
 * Despesas vêm agrupadas pela regra 50/30/20; receitas em um único grupo sem rótulo.
 */
export function categoryOptions(
  categories: Category[],
  kind: CategoryKind,
  keepId: ID | null,
): CategoryOptionGroup[] {
  const list = categories
    .filter((c) => c.kind === kind && (!c.archived || c.id === keepId))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  if (kind === 'receita') return list.length ? [{ label: null, categories: list }] : [];
  const groups: CategoryOptionGroup[] = [];
  for (const group of GROUP_ORDER) {
    const items = list.filter((c) => c.group === group);
    if (items.length) groups.push({ label: GROUP_TITLES[group ?? 'outras'], categories: items });
  }
  return groups;
}

export type TransactionFormField =
  'amount' | 'accountId' | 'toAccountId' | 'categoryId' | 'date' | 'installments';

export interface TransactionFormCheck {
  type: TransactionType;
  amount: Cents | null;
  accountId: ID | null;
  toAccountId: ID | null;
  categoryId: ID | null;
  date: string;
  /** null = campo inválido; ignorado quando o campo não se aplica. */
  installments: number | null;
  installmentsApplies: boolean;
}

/** Mensagens de erro por campo (vazio = válido). */
export function validateTransactionForm(
  v: TransactionFormCheck,
): Partial<Record<TransactionFormField, string>> {
  const errors: Partial<Record<TransactionFormField, string>> = {};
  if (v.amount === null || !Number.isInteger(v.amount) || v.amount <= 0) {
    errors.amount = 'Informe um valor maior que zero.';
  }
  if (!v.accountId) {
    errors.accountId = v.type === 'transferencia' ? 'Escolha a conta de origem.' : 'Escolha uma conta.';
  }
  if (v.type === 'transferencia') {
    if (!v.toAccountId) errors.toAccountId = 'Escolha a conta de destino.';
    else if (v.toAccountId === v.accountId)
      errors.toAccountId = 'Origem e destino precisam ser contas diferentes.';
  } else if (!v.categoryId) {
    errors.categoryId = 'Escolha uma categoria.';
  }
  if (!isISODate(v.date)) errors.date = 'Informe uma data válida.';
  if (v.installmentsApplies && v.installments === null) {
    errors.installments = `Informe de 1 a ${MAX_INSTALLMENTS} parcelas.`;
  }
  return errors;
}

/**
 * Descrição final: a digitada; se vazia, o nome da categoria (despesa/receita)
 * ou "Transferência para <destino>" (transferência).
 */
export function resolveDescription(
  description: string,
  type: TransactionType,
  category: Category | undefined,
  toAccount: Account | undefined,
): string {
  const typed = description.trim().replace(/\s+/g, ' ');
  if (typed) return typed;
  if (type === 'transferencia') return toAccount ? `Transferência para ${toAccount.name}` : 'Transferência';
  return category?.name ?? (type === 'receita' ? 'Receita' : 'Despesa');
}
