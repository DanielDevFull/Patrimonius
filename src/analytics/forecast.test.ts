import { describe, expect, it } from 'vitest';
import type { Transaction } from '@/domain/types';
import { makeAccount, makeData, makeRecurring, makeTransaction } from '@/test/factories';
import { cashflowForecast } from './forecast';

const tx = (p: Partial<Transaction> & Pick<Transaction, 'accountId'>) => makeTransaction(p);

describe('cashflowForecast', () => {
  it('sem dados: saldo zero, um ponto por dia até o fim do mês', () => {
    const f = cashflowForecast(makeData(), '2026-10-10');
    expect(f).toMatchObject({
      today: '2026-10-10',
      until: '2026-10-31',
      currentBalance: 0,
      expectedIncome: 0,
      expectedExpense: 0,
      projectedVariableSpending: 0,
      projectedEndBalance: 0,
      willGoNegative: false,
    });
    expect(f.points).toHaveLength(22);
    expect(f.points[0]).toEqual({ date: '2026-10-10', balance: 0 });
    expect(f.points[21]).toEqual({ date: '2026-10-31', balance: 0 });
    expect(f.lowestPoint).toEqual({ date: '2026-10-10', balance: 0 });
  });

  describe('cenário completo', () => {
    const accounts = [
      makeAccount({ id: 'chk', type: 'corrente', initialBalance: 100000 }),
      makeAccount({ id: 'card', type: 'cartao_credito', initialBalance: -30000 }),
      makeAccount({ id: 'inv', type: 'investimento', initialBalance: 500000 }),
      makeAccount({ id: 'old', type: 'corrente', initialBalance: 99999, archived: true }),
    ];
    const transactions = [
      tx({
        accountId: 'chk',
        type: 'receita',
        amount: 200000,
        date: '2026-10-05',
        categoryId: 'cat-salario',
      }),
      tx({ accountId: 'card', amount: 10000, date: '2026-10-06' }),
      tx({ accountId: 'old', amount: 5000, date: '2026-10-07' }), // conta arquivada: fora do caixa
      tx({
        accountId: 'inv',
        type: 'transferencia',
        toAccountId: 'chk',
        categoryId: null,
        amount: 10000,
        date: '2026-10-03',
      }),
      tx({ accountId: 'chk', amount: 20000, date: '2026-10-20' }), // pago com data futura
      tx({ accountId: 'chk', amount: 15000, date: '2026-10-02', status: 'pendente' }), // vencido
      tx({ accountId: 'chk', type: 'receita', amount: 50000, date: '2026-10-25', status: 'pendente' }),
      tx({ accountId: 'chk', amount: 7000, date: '2026-11-05', status: 'pendente' }), // depois de until
      // pagamento da fatura (caixa -> caixa) não muda o total; aporte (caixa -> investimento) é saída
      tx({
        accountId: 'chk',
        type: 'transferencia',
        toAccountId: 'card',
        categoryId: null,
        amount: 40000,
        date: '2026-10-15',
        status: 'pendente',
      }),
      tx({
        accountId: 'chk',
        type: 'transferencia',
        toAccountId: 'inv',
        categoryId: null,
        amount: 25000,
        date: '2026-10-16',
        status: 'pendente',
      }),
      // ocorrência já materializada da regra r-mat
      tx({ accountId: 'chk', amount: 8000, date: '2026-10-12', status: 'pendente', recurringId: 'r-mat' }),
    ];
    const recurring = [
      makeRecurring({
        id: 'r-gym',
        accountId: 'chk',
        amount: 12000,
        startDate: '2026-01-28',
        nextDate: '2026-10-28',
      }),
      makeRecurring({ id: 'r-off', accountId: 'chk', amount: 99999, nextDate: '2026-10-11', active: false }),
      makeRecurring({
        id: 'r-mat',
        accountId: 'chk',
        amount: 8000,
        startDate: '2026-01-12',
        nextDate: '2026-10-12',
      }),
      // regra em conta de investimento não afeta o caixa
      makeRecurring({ id: 'r-inv', accountId: 'inv', type: 'receita', amount: 3000, nextDate: '2026-10-15' }),
    ];
    const data = makeData({ accounts, transactions, recurring });
    const f = cashflowForecast(data, '2026-10-10');

    it('saldo atual considera só contas de caixa e lançamentos pagos até hoje', () => {
      // 100000 - 30000 + 200000 - 10000 + 10000
      expect(f.currentBalance).toBe(270000);
    });

    it('soma esperados: pendentes, pagos futuros e recorrências não materializadas', () => {
      expect(f.expectedIncome).toBe(50000);
      // 20000 + 15000 + 25000 + 12000 + 8000
      expect(f.expectedExpense).toBe(80000);
      expect(f.projectedVariableSpending).toBe(0);
      expect(f.projectedEndBalance).toBe(240000);
    });

    it('evolui o saldo dia a dia e encontra o ponto mais baixo', () => {
      const at = (date: string) => f.points.find((p) => p.date === date)?.balance;
      expect(at('2026-10-10')).toBe(255000); // vencido conta como hoje
      expect(at('2026-10-11')).toBe(255000); // regra inativa ignorada
      expect(at('2026-10-12')).toBe(247000);
      expect(at('2026-10-15')).toBe(247000);
      expect(at('2026-10-16')).toBe(222000);
      expect(at('2026-10-20')).toBe(202000);
      expect(at('2026-10-25')).toBe(252000);
      expect(at('2026-10-28')).toBe(240000);
      expect(f.points[f.points.length - 1]).toEqual({ date: '2026-10-31', balance: 240000 });
      expect(f.lowestPoint).toEqual({ date: '2026-10-20', balance: 202000 });
      expect(f.willGoNegative).toBe(false);
    });
  });

  describe('gasto variável', () => {
    const chk = makeAccount({ id: 'chk', initialBalance: 1000000 });
    const inv = makeAccount({ id: 'inv', type: 'investimento', initialBalance: 0 });

    it('usa a média diária dos 3 meses completos, sem recorrências, parcelas e contas de investimento', () => {
      const data = makeData({
        accounts: [chk, inv],
        transactions: [
          tx({ accountId: 'chk', amount: 30000, date: '2026-07-10' }),
          tx({ accountId: 'chk', amount: 31000, date: '2026-08-10' }),
          tx({ accountId: 'chk', amount: 31000, date: '2026-09-10' }),
          tx({ accountId: 'chk', amount: 50000, date: '2026-09-01', recurringId: 'rx' }),
          tx({
            accountId: 'chk',
            amount: 20000,
            date: '2026-08-01',
            installment: { groupId: 'g', number: 1, total: 2 },
          }),
          tx({ accountId: 'inv', amount: 99999, date: '2026-09-15' }),
          tx({ accountId: 'chk', amount: 77777, date: '2026-06-15' }), // fora dos 3 meses
        ],
      });
      const f = cashflowForecast(data, '2026-10-10');
      // 92000 em 92 dias (jul+ago+set) = 1000/dia × 21 dias restantes
      expect(f.projectedVariableSpending).toBe(21000);
      expect(f.currentBalance).toBe(1000000 - 92000 - 50000 - 20000 - 77777);
      expect(f.points[0].balance).toBe(f.currentBalance);
      expect(f.points[1].balance).toBe(f.currentBalance - 1000);
      expect(f.points[21].balance).toBe(f.projectedEndBalance);
      expect(f.projectedEndBalance).toBe(f.currentBalance - 21000);
      expect(f.lowestPoint.date).toBe('2026-10-31');
    });

    it('meses sem lançamentos não diluem a média', () => {
      const data = makeData({
        accounts: [chk],
        transactions: [tx({ accountId: 'chk', amount: 30000, date: '2026-09-10' })],
      });
      // só setembro (30 dias) tem dados: 1000/dia
      expect(cashflowForecast(data, '2026-10-10').projectedVariableSpending).toBe(21000);
      // no último dia do mês não há dias restantes
      expect(cashflowForecast(data, '2026-10-31').projectedVariableSpending).toBe(0);
    });

    it('distribui o gasto variável em centavos inteiros e fecha exatamente no saldo final', () => {
      const data = makeData({
        accounts: [chk],
        transactions: [tx({ accountId: 'chk', amount: 10000, date: '2026-09-10' })],
      });
      const f = cashflowForecast(data, '2026-10-10');
      // 10000 / 30 × 21 = 7000
      expect(f.projectedVariableSpending).toBe(7000);
      expect(f.points.every((p) => Number.isInteger(p.balance))).toBe(true);
      expect(f.points[f.points.length - 1].balance).toBe(f.projectedEndBalance);
    });
  });

  it('previsão negativa: aponta o dia em que o saldo fica negativo', () => {
    const data = makeData({
      accounts: [makeAccount({ id: 'chk', initialBalance: 10000 })],
      transactions: [
        tx({ accountId: 'chk', amount: 50000, date: '2026-10-15', status: 'pendente' }),
        tx({ accountId: 'chk', type: 'receita', amount: 100000, date: '2026-10-30', status: 'pendente' }),
      ],
    });
    const f = cashflowForecast(data, '2026-10-10');
    expect(f.willGoNegative).toBe(true);
    expect(f.lowestPoint).toEqual({ date: '2026-10-15', balance: -40000 });
    expect(f.projectedEndBalance).toBe(60000);
  });

  it('cartão de crédito estourado deixa o caixa negativo já hoje', () => {
    const data = makeData({
      accounts: [
        makeAccount({ id: 'chk', initialBalance: 5000 }),
        makeAccount({ id: 'card', type: 'cartao_credito', initialBalance: 0 }),
      ],
      transactions: [tx({ accountId: 'card', amount: 8000, date: '2026-10-01' })],
    });
    const f = cashflowForecast(data, '2026-10-10');
    expect(f.currentBalance).toBe(-3000);
    expect(f.willGoNegative).toBe(true);
    expect(f.lowestPoint.date).toBe('2026-10-10');
  });

  it('aceita until personalizado atravessando a virada do ano e corrige until < today', () => {
    const data = makeData({
      accounts: [makeAccount({ id: 'chk', initialBalance: 0 })],
      recurring: [
        makeRecurring({
          accountId: 'chk',
          type: 'receita',
          amount: 400000,
          startDate: '2026-01-05',
          nextDate: '2027-01-05',
        }),
      ],
    });
    const december = cashflowForecast(data, '2026-12-20');
    expect(december.until).toBe('2026-12-31');
    expect(december.expectedIncome).toBe(0);

    const extended = cashflowForecast(data, '2026-12-20', '2027-01-10');
    expect(extended.points).toHaveLength(22);
    expect(extended.expectedIncome).toBe(400000);
    expect(extended.points.find((p) => p.date === '2027-01-05')?.balance).toBe(400000);

    const backwards = cashflowForecast(data, '2026-12-20', '2026-12-01');
    expect(backwards.until).toBe('2026-12-20');
    expect(backwards.points).toEqual([{ date: '2026-12-20', balance: 0 }]);
  });
});
