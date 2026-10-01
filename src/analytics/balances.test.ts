import { describe, expect, it } from 'vitest';
import { makeAccount, makeTransaction } from '@/test/factories';
import {
  accountBalance,
  accountBalances,
  cardCommitted,
  liquidBalance,
  totalBalance,
  transactionEffect,
} from './balances';

const checking = makeAccount({ id: 'chk', type: 'corrente', initialBalance: 100000 });
const savings = makeAccount({ id: 'sav', type: 'poupanca', initialBalance: 50000 });
const card = makeAccount({ id: 'card', type: 'cartao_credito', initialBalance: -20000, creditLimit: 500000 });
const invest = makeAccount({ id: 'inv', type: 'investimento', initialBalance: 300000 });
const wallet = makeAccount({ id: 'wal', type: 'carteira', initialBalance: 1500 });
const archived = makeAccount({ id: 'old', type: 'corrente', initialBalance: 7000, archived: true });
const accounts = [checking, savings, card, invest, wallet, archived];

const transactions = [
  makeTransaction({
    accountId: 'chk',
    type: 'receita',
    amount: 500000,
    date: '2026-10-05',
    categoryId: 'cat-salario',
  }),
  makeTransaction({ accountId: 'chk', type: 'despesa', amount: 120000, date: '2026-10-06' }),
  // Guardou dinheiro na poupança.
  makeTransaction({
    accountId: 'chk',
    type: 'transferencia',
    amount: 30000,
    toAccountId: 'sav',
    categoryId: null,
    date: '2026-10-07',
  }),
  // Compra no cartão e pagamento parcial da fatura.
  makeTransaction({ accountId: 'card', type: 'despesa', amount: 15000, date: '2026-10-08' }),
  makeTransaction({
    accountId: 'chk',
    type: 'transferencia',
    amount: 20000,
    toAccountId: 'card',
    categoryId: null,
    date: '2026-10-09',
  }),
  // Pendente (não afeta saldo atual) e pago com data futura.
  makeTransaction({
    accountId: 'chk',
    type: 'despesa',
    amount: 9900,
    status: 'pendente',
    date: '2026-10-20',
  }),
  makeTransaction({ accountId: 'chk', type: 'despesa', amount: 5000, date: '2026-10-25' }),
  // Lançamento de uma conta que não existe mais na lista.
  makeTransaction({ accountId: 'ghost', type: 'receita', amount: 123456, date: '2026-10-01' }),
];

describe('transactionEffect', () => {
  it('soma receitas e subtrai despesas apenas na própria conta', () => {
    const income = makeTransaction({ accountId: 'chk', type: 'receita', amount: 2500 });
    const expense = makeTransaction({ accountId: 'chk', type: 'despesa', amount: 1999 });
    expect(transactionEffect(income, 'chk')).toBe(2500);
    expect(transactionEffect(expense, 'chk')).toBe(-1999);
    expect(transactionEffect(income, 'sav')).toBe(0);
    expect(transactionEffect(expense, 'sav')).toBe(0);
  });

  it('transferência sai da origem e entra no destino', () => {
    const tx = makeTransaction({ accountId: 'chk', toAccountId: 'sav', type: 'transferencia', amount: 7000 });
    expect(transactionEffect(tx, 'chk')).toBe(-7000);
    expect(transactionEffect(tx, 'sav')).toBe(7000);
    expect(transactionEffect(tx, 'card')).toBe(0);
  });

  it('transferência para a própria conta não quebra e tem efeito nulo', () => {
    const tx = makeTransaction({ accountId: 'chk', toAccountId: 'chk', type: 'transferencia', amount: 7000 });
    expect(transactionEffect(tx, 'chk')).toBe(0);
  });

  it('ignora status e data (quem chama filtra)', () => {
    const pending = makeTransaction({ accountId: 'chk', type: 'despesa', amount: 300, status: 'pendente' });
    expect(transactionEffect(pending, 'chk')).toBe(-300);
  });
});

describe('accountBalance', () => {
  it('considera somente lançamentos pagos por padrão (inclusive os de data futura)', () => {
    // 100000 + 500000 - 120000 - 30000 - 20000 - 5000
    expect(accountBalance(checking, transactions)).toBe(425000);
  });

  it('respeita a data de corte asOf (inclusive)', () => {
    expect(accountBalance(checking, transactions, { asOf: '2026-10-10' })).toBe(430000);
    expect(accountBalance(checking, transactions, { asOf: '2026-10-05' })).toBe(600000);
    expect(accountBalance(checking, transactions, { asOf: '2026-10-04' })).toBe(100000);
  });

  it('inclui pendentes quando includePending = true (saldo projetado)', () => {
    expect(accountBalance(checking, transactions, { includePending: true })).toBe(415100);
    expect(accountBalance(checking, transactions, { includePending: true, asOf: '2026-10-19' })).toBe(430000);
    expect(accountBalance(checking, transactions, { includePending: true, asOf: '2026-10-20' })).toBe(420100);
  });

  it('cartão de crédito acumula fatura negativa e o pagamento reduz a dívida', () => {
    // -20000 - 15000 + 20000
    expect(accountBalance(card, transactions)).toBe(-15000);
  });

  it('conta sem lançamentos fica com o saldo inicial', () => {
    expect(accountBalance(invest, transactions)).toBe(300000);
    expect(accountBalance(makeAccount({ initialBalance: -500 }), [])).toBe(-500);
  });
});

describe('accountBalances', () => {
  it('é consistente com accountBalance para todas as contas, inclusive arquivadas', () => {
    for (const opts of [undefined, { asOf: '2026-10-07' }, { includePending: true }]) {
      const all = accountBalances(accounts, transactions, opts);
      expect(Object.keys(all).sort()).toEqual(['card', 'chk', 'inv', 'old', 'sav', 'wal']);
      for (const account of accounts) {
        expect(all[account.id]).toBe(accountBalance(account, transactions, opts));
      }
    }
  });

  it('ignora lançamentos de contas fora da lista e só debita a origem quando o destino não está na lista', () => {
    const result = accountBalances([checking], transactions);
    expect(result).toEqual({ chk: 425000 });
    expect(result).not.toHaveProperty('ghost');
  });

  it('transferência com origem igual ao destino não altera o saldo', () => {
    const tx = makeTransaction({ accountId: 'chk', toAccountId: 'chk', type: 'transferencia', amount: 999 });
    expect(accountBalances([checking], [tx])).toEqual({ chk: 100000 });
  });

  it('retorna objeto vazio sem contas', () => {
    expect(accountBalances([], transactions)).toEqual({});
  });
});

describe('totalBalance e liquidBalance', () => {
  it('total soma contas não arquivadas, incluindo investimentos e cartão negativo', () => {
    // 425000 + 80000 - 15000 + 300000 + 1500 (arquivada fica de fora)
    expect(totalBalance(accounts, transactions)).toBe(791500);
  });

  it('líquido considera só corrente, poupança, carteira e outro', () => {
    const other = makeAccount({ id: 'oth', type: 'outro', initialBalance: 2500 });
    // 425000 + 80000 + 1500 + 2500
    expect(liquidBalance([...accounts, other], transactions)).toBe(509000);
  });

  it('repassa as opções de data e pendentes', () => {
    expect(totalBalance(accounts, transactions, { asOf: '2026-10-04' })).toBe(
      100000 + 50000 - 20000 + 300000 + 1500,
    );
    expect(liquidBalance(accounts, transactions, { includePending: true })).toBe(
      425000 - 9900 + 80000 + 1500,
    );
  });

  it('é zero sem contas ativas', () => {
    expect(totalBalance([], transactions)).toBe(0);
    expect(totalBalance([archived], transactions)).toBe(0);
    expect(liquidBalance([card, invest], transactions)).toBe(0);
  });
});

describe('cardCommitted', () => {
  const card = makeAccount({ id: 'card', type: 'cartao_credito', creditLimit: 800000 });
  it('fatura em aberto + débitos futuros; pagamento agendado não abate o limite', () => {
    const txs = [
      makeTransaction({ accountId: 'card', amount: 390796, date: '2026-09-20' }),
      makeTransaction({ accountId: 'card', amount: 35990, date: '2026-11-12', status: 'pendente' }),
      makeTransaction({ accountId: 'card', amount: 19990, date: '2026-10-12', status: 'pendente' }),
      makeTransaction({ accountId: 'cc', type: 'transferencia', toAccountId: 'card', amount: 390796, date: '2026-10-10', status: 'pendente' }),
    ];
    expect(cardCommitted(card, txs, '2026-10-01')).toBe(390796 + 35990 + 19990);
    // Depois que o pagamento acontece (pago), o limite volta.
    const paid = txs.map((t) => (t.type === 'transferencia' ? { ...t, status: 'pago' as const, date: '2026-10-01' } : t));
    expect(cardCommitted(card, paid, '2026-10-01')).toBe(35990 + 19990);
  });

  it('cartão com crédito (saldo positivo) não fica com uso negativo', () => {
    const txs = [makeTransaction({ accountId: 'cc', type: 'transferencia', toAccountId: 'card', amount: 10000, date: '2026-09-01' })];
    expect(cardCommitted(card, txs, '2026-10-01')).toBe(0);
  });
});
