/**
 * Regras puras da tela de contas: saldos, cartão de crédito (fatura/limite/datas), ajuste de saldo e validação.
 */
import { accountBalances } from '@/analytics/balances';
import { addMonths, daysInMonth, endOfMonth, makeISO, monthKey, parseISO } from '@/domain/dates';
import { normalizeText } from '@/domain/text';
import type { Account, Cents, ID, ISODate, Transaction } from '@/domain/types';

export interface AccountBalanceView {
  /** Saldo atual: lançamentos pagos com data <= hoje. */
  current: Cents;
  /** Previsto para o fim do mês: inclui pendentes com data até o fim do mês corrente. */
  projected: Cents;
}

/** Saldos atual e previsto de todas as contas (uma passada por lançamento para cada visão). */
export function balancesView(
  accounts: Account[],
  transactions: Transaction[],
  today: ISODate,
): Record<ID, AccountBalanceView> {
  const current = accountBalances(accounts, transactions, { asOf: today });
  const projected = accountBalances(accounts, transactions, {
    asOf: endOfMonth(monthKey(today)),
    includePending: true,
  });
  const result: Record<ID, AccountBalanceView> = {};
  for (const a of accounts) result[a.id] = { current: current[a.id] ?? 0, projected: projected[a.id] ?? 0 };
  return result;
}

export interface AccountsTotals {
  /** Soma dos saldos atuais das contas ativas incluídas no patrimônio. */
  current: Cents;
  /** Mesma soma, prevista para o fim do mês (com pendentes). */
  projected: Cents;
  /** Soma das faturas (saldos negativos) dos cartões ativos. */
  cardInvoices: Cents;
  activeCount: number;
  archivedCount: number;
}

export function accountsTotals(
  accounts: Account[],
  balances: Record<ID, AccountBalanceView>,
): AccountsTotals {
  let current = 0;
  let projected = 0;
  let cardInvoices = 0;
  let activeCount = 0;
  let archivedCount = 0;
  for (const a of accounts) {
    if (a.archived) {
      archivedCount += 1;
      continue;
    }
    activeCount += 1;
    const b = balances[a.id] ?? { current: 0, projected: 0 };
    if (a.includeInNetWorth) {
      current += b.current;
      projected += b.projected;
    }
    if (a.type === 'cartao_credito' && b.current < 0) cardInvoices += -b.current;
  }
  return { current, projected, cardInvoices, activeCount, archivedCount };
}

/** Próxima data (>= hoje) com o dia do mês informado, limitado ao último dia do mês. */
export function nextDayOfMonth(day: number, today: ISODate): ISODate {
  const { year, month } = parseISO(today);
  const thisMonth = makeISO(year, month, Math.min(day, daysInMonth(year, month)));
  if (thisMonth >= today) return thisMonth;
  const next = parseISO(addMonths(makeISO(year, month, 1), 1));
  return makeISO(next.year, next.month, Math.min(day, daysInMonth(next.year, next.month)));
}

export interface CardInfo {
  /** Fatura atual (saldo negativo em módulo); 0 se não houver. */
  invoice: Cents;
  /** Crédito a favor (saldo positivo do cartão). */
  credit: Cents;
  limit: Cents | null;
  /** invoice / limit (null sem limite). */
  usedRatio: number | null;
  /** limit - invoice (pode ser negativo se estourou). */
  available: Cents | null;
  nextClosing: ISODate | null;
  nextDue: ISODate | null;
}

export function cardInfo(account: Account, balance: Cents, today: ISODate): CardInfo {
  const invoice = balance < 0 ? -balance : 0;
  const limit = account.creditLimit && account.creditLimit > 0 ? account.creditLimit : null;
  return {
    invoice,
    credit: balance > 0 ? balance : 0,
    limit,
    usedRatio: limit ? invoice / limit : null,
    available: limit ? limit - invoice : null,
    nextClosing: account.closingDay ? nextDayOfMonth(account.closingDay, today) : null,
    nextDue: account.dueDay ? nextDayOfMonth(account.dueDay, today) : null,
  };
}

export interface Adjustment {
  type: 'receita' | 'despesa';
  amount: Cents;
}

/** Lançamento necessário para o saldo do app (`current`) virar o saldo real (`real`). null se já confere. */
export function balanceAdjustment(current: Cents, real: Cents): Adjustment | null {
  const diff = real - current;
  if (diff === 0) return null;
  return diff > 0 ? { type: 'receita', amount: diff } : { type: 'despesa', amount: -diff };
}

export interface AccountFormCheck {
  name: string;
  isCard: boolean;
  closingDay: string;
  dueDay: string;
}

export type AccountFormField = 'name' | 'closingDay' | 'dueDay';

/** Converte o texto de um dia (1-31). '' => null (não informado); inválido => NaN. */
export function parseDay(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (!/^\d{1,2}$/.test(t)) return Number.NaN;
  const n = Number(t);
  return n >= 1 && n <= 31 ? n : Number.NaN;
}

export function validateAccountForm(
  v: AccountFormCheck,
  accounts: Account[],
  editingId: ID | null,
): Partial<Record<AccountFormField, string>> {
  const errors: Partial<Record<AccountFormField, string>> = {};
  const name = v.name.trim();
  if (!name) errors.name = 'Informe o nome da conta.';
  else if (
    accounts.some((a) => a.id !== editingId && !a.archived && normalizeText(a.name) === normalizeText(name))
  ) {
    errors.name = 'Já existe uma conta ativa com esse nome.';
  }
  if (v.isCard) {
    if (Number.isNaN(parseDay(v.closingDay))) errors.closingDay = 'Informe um dia entre 1 e 31.';
    if (Number.isNaN(parseDay(v.dueDay))) errors.dueDay = 'Informe um dia entre 1 e 31.';
  }
  return errors;
}

/** Ordem de exibição: contas comuns antes de cartões, depois por data de criação e nome. */
export function sortAccountsForDisplay(accounts: Account[]): Account[] {
  return [...accounts].sort(
    (a, b) =>
      Number(a.type === 'cartao_credito') - Number(b.type === 'cartao_credito') ||
      (a.createdAt === b.createdAt
        ? a.name.localeCompare(b.name, 'pt-BR')
        : a.createdAt < b.createdAt
          ? -1
          : 1),
  );
}
