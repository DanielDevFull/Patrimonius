import type { Account, AccountType, Cents, ID, Transaction } from '@/domain/types';
import type { BalanceOptions } from './types';

/**
 * Efeito de um lançamento no saldo de uma conta específica (em centavos, com sinal).
 * - receita na conta: +amount
 * - despesa na conta: -amount
 * - transferência: -amount na conta de origem (accountId), +amount na de destino (toAccountId)
 * - lançamento que não envolve a conta: 0
 * NÃO considera status/data (quem chama filtra).
 * Uma transferência com origem e destino iguais (não deveria existir) tem efeito 0.
 */
export function transactionEffect(tx: Transaction, accountId: ID): Cents {
  switch (tx.type) {
    case 'receita':
      return tx.accountId === accountId ? tx.amount : 0;
    case 'despesa':
      return tx.accountId === accountId ? -tx.amount : 0;
    case 'transferencia': {
      let effect = 0;
      if (tx.accountId === accountId) effect -= tx.amount;
      if (tx.toAccountId === accountId) effect += tx.amount;
      return effect;
    }
    default:
      return 0;
  }
}

/** true se o lançamento entra no saldo segundo as opções (status e data de corte). */
function counts(tx: Transaction, opts: BalanceOptions | undefined): boolean {
  if (tx.status !== 'pago' && !(opts?.includePending && tx.status === 'pendente')) return false;
  if (opts?.asOf !== undefined && tx.date > opts.asOf) return false;
  return true;
}

/**
 * Saldo de uma conta = initialBalance + soma dos efeitos dos lançamentos filtrados por `opts`
 * (status 'pago' apenas, salvo includePending; date <= asOf, se informado).
 */
export function accountBalance(account: Account, transactions: Transaction[], opts?: BalanceOptions): Cents {
  let balance = account.initialBalance;
  for (const tx of transactions) {
    if (tx.accountId !== account.id && tx.toAccountId !== account.id) continue;
    if (!counts(tx, opts)) continue;
    balance += transactionEffect(tx, account.id);
  }
  return balance;
}

/**
 * Saldo de todas as contas (inclusive arquivadas), indexado por id. O(contas + lançamentos):
 * uma única passada pelos lançamentos. Lançamentos de contas que não estão na lista são ignorados.
 */
export function accountBalances(
  accounts: Account[],
  transactions: Transaction[],
  opts?: BalanceOptions,
): Record<ID, Cents> {
  const balances = new Map<ID, Cents>();
  for (const account of accounts) balances.set(account.id, account.initialBalance);
  for (const tx of transactions) {
    if (!counts(tx, opts)) continue;
    const from = balances.get(tx.accountId);
    if (tx.type === 'transferencia') {
      if (from !== undefined) balances.set(tx.accountId, from - tx.amount);
      if (tx.toAccountId !== null) {
        const to = balances.get(tx.toAccountId);
        if (to !== undefined) balances.set(tx.toAccountId, to + tx.amount);
      }
    } else if (from !== undefined) {
      balances.set(tx.accountId, from + (tx.type === 'receita' ? tx.amount : -tx.amount));
    }
  }
  return Object.fromEntries(balances);
}

/** Soma dos saldos das contas não arquivadas que satisfazem `predicate`. */
function sumBalances(
  accounts: Account[],
  transactions: Transaction[],
  opts: BalanceOptions | undefined,
  predicate: (account: Account) => boolean,
): Cents {
  const selected = accounts.filter((a) => !a.archived && predicate(a));
  if (selected.length === 0) return 0;
  const balances = accountBalances(selected, transactions, opts);
  let total = 0;
  for (const account of selected) total += balances[account.id];
  return total;
}

/** Soma dos saldos de todas as contas NÃO arquivadas (cartões entram com seu saldo, geralmente negativo). */
export function totalBalance(accounts: Account[], transactions: Transaction[], opts?: BalanceOptions): Cents {
  return sumBalances(accounts, transactions, opts, () => true);
}

/** Tipos de conta cujo saldo é considerado dinheiro disponível. */
const LIQUID_ACCOUNT_TYPES: readonly AccountType[] = ['corrente', 'poupanca', 'carteira', 'outro'];

/**
 * Saldo líquido disponível: soma dos saldos das contas não arquivadas dos tipos
 * corrente, poupanca, carteira e outro (exclui investimento e cartao_credito).
 */
export function liquidBalance(
  accounts: Account[],
  transactions: Transaction[],
  opts?: BalanceOptions,
): Cents {
  return sumBalances(accounts, transactions, opts, (a) => LIQUID_ACCOUNT_TYPES.includes(a.type));
}
