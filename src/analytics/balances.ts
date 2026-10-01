import type { Account, Cents, ID, Transaction } from '@/domain/types';
import type { BalanceOptions } from './types';

/**
 * Efeito de um lançamento no saldo de uma conta específica (em centavos, com sinal).
 * - receita na conta: +amount
 * - despesa na conta: -amount
 * - transferência: -amount na conta de origem (accountId), +amount na de destino (toAccountId)
 * - lançamento que não envolve a conta: 0
 * NÃO considera status/data (quem chama filtra).
 */
export function transactionEffect(tx: Transaction, accountId: ID): Cents {
  void tx;
  void accountId;
  throw new Error('não implementado');
}

/**
 * Saldo de uma conta = initialBalance + soma dos efeitos dos lançamentos filtrados por `opts`
 * (status 'pago' apenas, salvo includePending; date <= asOf, se informado).
 */
export function accountBalance(account: Account, transactions: Transaction[], opts?: BalanceOptions): Cents {
  void account;
  void transactions;
  void opts;
  throw new Error('não implementado');
}

/** Saldo de todas as contas (inclusive arquivadas), indexado por id. Deve ser O(contas + lançamentos). */
export function accountBalances(
  accounts: Account[],
  transactions: Transaction[],
  opts?: BalanceOptions,
): Record<ID, Cents> {
  void accounts;
  void transactions;
  void opts;
  throw new Error('não implementado');
}

/** Soma dos saldos de todas as contas NÃO arquivadas (cartões entram com seu saldo, geralmente negativo). */
export function totalBalance(accounts: Account[], transactions: Transaction[], opts?: BalanceOptions): Cents {
  void accounts;
  void transactions;
  void opts;
  throw new Error('não implementado');
}

/**
 * Saldo líquido disponível: soma dos saldos das contas não arquivadas dos tipos
 * corrente, poupanca, carteira e outro (exclui investimento e cartao_credito).
 */
export function liquidBalance(accounts: Account[], transactions: Transaction[], opts?: BalanceOptions): Cents {
  void accounts;
  void transactions;
  void opts;
  throw new Error('não implementado');
}
