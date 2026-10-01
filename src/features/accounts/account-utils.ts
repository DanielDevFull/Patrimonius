/**
 * Regras puras da tela de contas: saldos, cartão de crédito (fatura/limite/datas), ajuste de saldo e validação.
 */
import { accountBalances } from '@/analytics/balances';
import { addMonths, daysInMonth, endOfMonth, makeISO, monthKey, parseISO } from '@/domain/dates';
import { normalizeText } from '@/domain/text';
import type { Account, Cents, ID, ISODate, RecurringRule, Transaction } from '@/domain/types';

export interface AccountBalanceView {
  /** Saldo atual: lançamentos pagos com data <= hoje. */
  current: Cents;
  /** Previsto para o fim do mês: inclui pendentes com data até o fim do mês corrente. */
  projected: Cents;
  /**
   * Comprometido: todos os lançamentos pagos e pendentes, de qualquer data (inclui parcelas futuras).
   * Em cartão de crédito é o que bloqueia o limite (o Pat usa a mesma regra).
   */
  committed: Cents;
}

/** Saldos atual, previsto e comprometido de todas as contas (uma passada por lançamento para cada visão). */
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
  const committed = accountBalances(accounts, transactions, { includePending: true });
  const result: Record<ID, AccountBalanceView> = {};
  for (const a of accounts) {
    result[a.id] = {
      current: current[a.id] ?? 0,
      projected: projected[a.id] ?? 0,
      committed: committed[a.id] ?? 0,
    };
  }
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
  /**
   * Soma dos saldos atuais das contas ARQUIVADAS (incluídas no patrimônio) com saldo diferente de zero.
   * Fica fora dos totais acima, mas o patrimônio líquido continua contando esse valor.
   */
  archivedBalance: Cents;
  /** Quantas contas arquivadas (incluídas no patrimônio) têm saldo diferente de zero. */
  archivedWithBalance: number;
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
  let archivedBalance = 0;
  let archivedWithBalance = 0;
  for (const a of accounts) {
    const b = balances[a.id] ?? { current: 0, projected: 0, committed: 0 };
    if (a.archived) {
      archivedCount += 1;
      if (a.includeInNetWorth && b.current !== 0) {
        archivedBalance += b.current;
        archivedWithBalance += 1;
      }
      continue;
    }
    activeCount += 1;
    if (a.includeInNetWorth) {
      current += b.current;
      projected += b.projected;
    }
    if (a.type === 'cartao_credito' && b.current < 0) cardInvoices += -b.current;
  }
  return {
    current,
    projected,
    cardInvoices,
    activeCount,
    archivedCount,
    archivedBalance,
    archivedWithBalance,
  };
}

export interface AccountRemovalImpact {
  /** Saldo atual da conta (pagos até hoje); em cartão, negativo = fatura em aberto. */
  balance: Cents;
  /** Lançamentos da conta ainda pendentes ou com data futura (ex.: parcelas do cartão). */
  futureCount: number;
  /** true: a conta será arquivada (tem lançamentos ou recorrências); false: será excluída. */
  willArchive: boolean;
}

/**
 * O que acontece ao "Excluir ou arquivar" a conta (mesma regra de deleteOrArchiveAccount):
 * usado para avisar que um saldo/fatura em aberto sai dos totais de Contas e do Painel
 * (o patrimônio líquido continua contando contas arquivadas com saldo).
 */
export function accountRemovalImpact(
  account: Account,
  balance: Cents,
  transactions: Transaction[],
  recurring: RecurringRule[],
  today: ISODate,
): AccountRemovalImpact {
  let futureCount = 0;
  let used = false;
  for (const t of transactions) {
    if (t.accountId !== account.id && t.toAccountId !== account.id) continue;
    used = true;
    if (t.status === 'pendente' || t.date > today) futureCount += 1;
  }
  return {
    balance,
    futureCount,
    willArchive: used || recurring.some((r) => r.accountId === account.id),
  };
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
  /**
   * Limite usado: dívida total do cartão contando parcelas futuras e pendentes (saldo comprometido negativo em
   * módulo; 0 se não houver). No cartão, a compra parcelada bloqueia o valor total no limite.
   */
  used: Cents;
  /** used / limit (null sem limite). */
  usedRatio: number | null;
  /** limit - used (pode ser negativo se estourou). */
  available: Cents | null;
  nextClosing: ISODate | null;
  nextDue: ISODate | null;
}

/**
 * Informações do cartão. `balance` é o saldo atual (pagos até hoje: define a fatura atual) e `committed`,
 * o saldo comprometido (pagos e pendentes de qualquer data: define o limite usado/disponível).
 */
export function cardInfo(account: Account, balance: Cents, today: ISODate, committed: Cents): CardInfo {
  const invoice = balance < 0 ? -balance : 0;
  const used = committed < 0 ? -committed : 0;
  const limit = account.creditLimit && account.creditLimit > 0 ? account.creditLimit : null;
  return {
    invoice,
    credit: balance > 0 ? balance : 0,
    limit,
    used,
    usedRatio: limit ? used / limit : null,
    available: limit ? limit - used : null,
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

/**
 * Saldo real a partir do valor digitado. Em cartão, o usuário digita a fatura em aberto como ela aparece
 * na tela (positiva): ela vira saldo negativo, como no onboarding; com "Tenho crédito no cartão", vira saldo positivo.
 */
export function realBalanceFromInput(value: Cents | null, isCard: boolean, credit: boolean): Cents | null {
  if (value === null) return null;
  if (!isCard) return value;
  return credit ? Math.abs(value) : -Math.abs(value);
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
