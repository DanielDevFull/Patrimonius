import { describe, expect, it } from 'vitest';
import { makeDebt, makeDebtPayment } from '@/test/factories';
import {
  compareStrategies,
  debtCurrentBalance,
  debtsOverview,
  simulatePayoff,
  toPayoffInputs,
} from './debts';
import type { PayoffDebtInput } from './types';

const input = (p: Partial<PayoffDebtInput> & Pick<PayoffDebtInput, 'id'>): PayoffDebtInput => ({
  name: p.id,
  balance: 100000,
  monthlyRatePct: 0,
  minimumPayment: 10000,
  ...p,
});

describe('debtCurrentBalance', () => {
  // Sem juros: o saldo é o informado menos os pagamentos (as regras de filtro ficam isoladas).
  const debt = makeDebt({ id: 'd1', balance: 500000, balanceDate: '2026-06-15', interestRate: 0 });

  it('desconta só pagamentos da própria dívida a partir de balanceDate', () => {
    const payments = [
      makeDebtPayment({ debtId: 'd1', amount: 100000, date: '2026-06-14' }), // antes do saldo informado
      makeDebtPayment({ debtId: 'd1', amount: 50000, date: '2026-06-15' }), // no dia: conta
      makeDebtPayment({ debtId: 'd1', amount: 30000, date: '2026-09-01' }),
      makeDebtPayment({ debtId: 'outra', amount: 99999, date: '2026-09-01' }),
    ];
    expect(debtCurrentBalance(debt, payments)).toBe(420000);
  });

  it('respeita asOf (inclusive)', () => {
    const payments = [
      makeDebtPayment({ debtId: 'd1', amount: 50000, date: '2026-07-10' }),
      makeDebtPayment({ debtId: 'd1', amount: 50000, date: '2026-08-10' }),
    ];
    expect(debtCurrentBalance(debt, payments, '2026-07-09')).toBe(500000);
    expect(debtCurrentBalance(debt, payments, '2026-07-10')).toBe(450000);
    expect(debtCurrentBalance(debt, payments, '2026-12-31')).toBe(400000);
  });

  it('nunca fica negativo e dívida quitada vale 0', () => {
    const payments = [makeDebtPayment({ debtId: 'd1', amount: 900000, date: '2026-07-01' })];
    expect(debtCurrentBalance(debt, payments)).toBe(0);
    expect(debtCurrentBalance({ ...debt, status: 'quitada' }, [])).toBe(0);
  });

  describe('com juros (amortização mês a mês)', () => {
    // R$ 10.000,00 a 2% a.m., parcela de R$ 500,00 todo dia 10 a partir do mês seguinte ao saldo informado.
    const loan = makeDebt({ id: 'L', balance: 1000000, balanceDate: '2026-01-05', interestRate: 2 });
    const installments = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        makeDebtPayment({
          debtId: 'L',
          amount: 50000,
          date: `${2026 + Math.floor((i + 1) / 12)}-${String(((i + 1) % 12) + 1).padStart(2, '0')}-10`,
        }),
      );

    it('soma os juros do mês antes de cada parcela (conferido com a fórmula de amortização)', () => {
      // 10.000 × 1,02^10 − 500 × (1,02^10 − 1) / 0,02 = 6.715,08 (antes: 5.000,00, sem juros).
      expect(debtCurrentBalance(loan, installments(10))).toBe(671508);
      // Depois de 20 parcelas ainda faltam 2.710,80 (antes: 0 e a dívida aparecia quitada).
      expect(debtCurrentBalance(loan, installments(20))).toBe(271080);
      // São necessárias 26 parcelas para zerar.
      expect(debtCurrentBalance(loan, installments(25))).toBeGreaterThan(0);
      expect(debtCurrentBalance(loan, installments(26))).toBe(0);
    });

    it('acumula os meses sem pagamento e não cobra juros duas vezes no mesmo mês', () => {
      const payments = [
        makeDebtPayment({ debtId: 'L', amount: 100000, date: '2026-01-20' }), // mesmo mês do saldo: sem juros
        makeDebtPayment({ debtId: 'L', amount: 100000, date: '2026-04-10' }), // 3 meses de juros sobre 900.000
        makeDebtPayment({ debtId: 'L', amount: 50000, date: '2026-04-25' }), // mesmo mês: sem juros novos
      ];
      // 900.000 → 918.000 → 936.360 → 955.087 (juros arredondados ao centavo) − 100.000 − 50.000.
      expect(debtCurrentBalance(loan, payments)).toBe(805087);
      // asOf corta os pagamentos (e os juros vêm só com eles).
      expect(debtCurrentBalance(loan, payments, '2026-03-31')).toBe(900000);
    });
  });
});

describe('debtsOverview', () => {
  it('consolida só as ativas, com juros e taxa ponderada', () => {
    const cartao = makeDebt({
      id: 'cartao',
      name: 'Cartão',
      originalAmount: 400000,
      balance: 300000,
      balanceDate: '2026-09-01',
      interestRate: 12.5,
      minimumPayment: 30000,
    });
    const carro = makeDebt({
      id: 'carro',
      name: 'Carro',
      originalAmount: 2000000,
      balance: 1000000,
      balanceDate: '2026-09-01',
      interestRate: 1.5,
      minimumPayment: 80000,
    });
    const antiga = makeDebt({
      id: 'antiga',
      name: 'Antiga',
      interestRate: 20,
      status: 'quitada',
      originalAmount: 50000,
    });
    const payments = [
      makeDebtPayment({ debtId: 'cartao', amount: 100000, date: '2026-09-10' }),
      makeDebtPayment({ debtId: 'carro', amount: 80000, date: '2026-08-10' }), // antes do saldo: só entra em paidTotal
      makeDebtPayment({ debtId: 'antiga', amount: 50000, date: '2026-01-10' }),
    ];
    const ov = debtsOverview([carro, antiga, cartao], payments);

    // Cartão: 300.000 - 100.000 = 200.000; juros 12,5% = 25.000. Carro: 1.000.000; juros 1,5% = 15.000.
    expect(ov.totalBalance).toBe(1200000);
    expect(ov.totalMinimum).toBe(110000);
    expect(ov.monthlyInterest).toBe(40000);
    // (200.000 × 12,5 + 1.000.000 × 1,5) / 1.200.000 = 3,333...
    expect(ov.weightedRate).toBeCloseTo(10 / 3, 10);

    expect(ov.items.map((i) => i.debt.id)).toEqual(['cartao', 'carro', 'antiga']);
    const [c, car, old] = ov.items;
    expect(c).toMatchObject({
      currentBalance: 200000,
      monthlyInterest: 25000,
      paidTotal: 100000,
      progress: 0.5,
    });
    expect(car).toMatchObject({
      currentBalance: 1000000,
      monthlyInterest: 15000,
      paidTotal: 80000,
      progress: 0.5,
    });
    expect(old).toMatchObject({ currentBalance: 0, monthlyInterest: 0, paidTotal: 50000, progress: 1 });
  });

  it('sem dívidas => zeros', () => {
    expect(debtsOverview([], [])).toEqual({
      totalBalance: 0,
      totalMinimum: 0,
      weightedRate: 0,
      monthlyInterest: 0,
      items: [],
    });
  });

  it('progresso limitado a 0..1 e 0 sem valor original', () => {
    const maior = makeDebt({ id: 'a', originalAmount: 100000, balance: 150000 });
    const semOriginal = makeDebt({ id: 'b', originalAmount: 0, balance: 10000 });
    const ov = debtsOverview([maior, semOriginal], []);
    expect(ov.items.find((i) => i.debt.id === 'a')?.progress).toBe(0);
    expect(ov.items.find((i) => i.debt.id === 'b')?.progress).toBe(0);
  });

  it('dívida ativa já zerada não soma mínimo', () => {
    const d = makeDebt({ id: 'z', balance: 10000, minimumPayment: 5000, balanceDate: '2026-01-01' });
    // 10.000 + 2% de juros de janeiro = 10.200 pagos em fevereiro.
    const ov = debtsOverview([d], [makeDebtPayment({ debtId: 'z', amount: 10200, date: '2026-02-01' })]);
    expect(ov.totalMinimum).toBe(0);
    expect(ov.totalBalance).toBe(0);
    expect(ov.weightedRate).toBe(0);
  });
});

describe('simulatePayoff', () => {
  it('R$ 1.000 a 2% a.m. pagando R$ 100/mês quita em 12 meses (conferido à mão)', () => {
    const plan = simulatePayoff(
      [input({ id: 'd', balance: 100000, monthlyRatePct: 2, minimumPayment: 10000 })],
      10000,
      'avalanche',
    );
    // Juros mês a mês: 2000, 1840, 1677, 1510, 1341, 1167, 991, 811, 627, 439, 248, 53.
    expect(plan.feasible).toBe(true);
    expect(plan.months).toBe(12);
    expect(plan.totalInterest).toBe(12704);
    expect(plan.totalPaid).toBe(112704);
    expect(plan.payoffOrder).toEqual([{ debtId: 'd', name: 'd', month: 12 }]);
    expect(plan.timeline.slice(0, 4)).toEqual([
      { month: 0, totalBalance: 100000 },
      { month: 1, totalBalance: 92000 },
      { month: 2, totalBalance: 83840 },
      { month: 3, totalBalance: 75517 },
    ]);
    expect(plan.timeline.at(-2)).toEqual({ month: 11, totalBalance: 2651 });
    expect(plan.timeline.at(-1)).toEqual({ month: 12, totalBalance: 0 });
    expect(plan.timeline).toHaveLength(13);
  });

  // A: R$ 1.000 a 3% (mín. R$ 100); B: R$ 500 a 1% (mín. R$ 100); orçamento R$ 400.
  const pair = [
    input({ id: 'A', balance: 100000, monthlyRatePct: 3, minimumPayment: 10000 }),
    input({ id: 'B', balance: 50000, monthlyRatePct: 1, minimumPayment: 10000 }),
  ];

  it('avalanche ataca a maior taxa e rola a sobra (conferido à mão)', () => {
    const plan = simulatePayoff(pair, 40000, 'avalanche');
    expect(plan.timeline.map((t) => t.totalBalance)).toEqual([150000, 113500, 76095, 37760, 0]);
    expect(plan.totalInterest).toBe(8468);
    expect(plan.totalPaid).toBe(158468);
    expect(plan.months).toBe(4);
    // Ambas quitadas no mês 4: a sobra de A rolou para B no mesmo mês.
    expect(plan.payoffOrder).toEqual([
      { debtId: 'A', name: 'A', month: 4 },
      { debtId: 'B', name: 'B', month: 4 },
    ]);
  });

  it('snowball ataca o menor saldo e libera o mínimo quitado (conferido à mão)', () => {
    const plan = simulatePayoff(pair, 40000, 'snowball');
    expect(plan.timeline.map((t) => t.totalBalance)).toEqual([150000, 113500, 76495, 38790, 0]);
    expect(plan.totalInterest).toBe(9954);
    expect(plan.payoffOrder).toEqual([
      { debtId: 'B', name: 'B', month: 2 },
      { debtId: 'A', name: 'A', month: 4 },
    ]);
    expect(plan.feasible).toBe(true);
  });

  it('orçamento abaixo dos mínimos paga proporcionalmente e é inviável', () => {
    const debts = [
      input({ id: 'A', balance: 30000, minimumPayment: 10000 }),
      input({ id: 'B', balance: 30000, minimumPayment: 20000 }),
    ];
    const plan = simulatePayoff(debts, 15000, 'avalanche');
    // Mês 1 e 2: 15.000 divididos 1:2 => A paga 5.000, B paga 10.000.
    // Mês 3: devidos 10.000 + 10.000 => 7.500 cada. Mês 4: devidos 10.000 + 2.500 cabem; sobra 2.500 vai para A.
    expect(plan.timeline.map((t) => t.totalBalance)).toEqual([60000, 45000, 30000, 15000, 0]);
    expect(plan.feasible).toBe(false);
    expect(plan.months).toBe(4);
    expect(plan.totalPaid).toBe(60000);
    expect(plan.payoffOrder).toEqual([
      { debtId: 'A', name: 'A', month: 4 },
      { debtId: 'B', name: 'B', month: 4 },
    ]);
  });

  it('divide os centavos do rateio sem perder nenhum', () => {
    const debts = [
      input({ id: 'A', balance: 100000, minimumPayment: 10000 }),
      input({ id: 'B', balance: 100000, minimumPayment: 10000 }),
      input({ id: 'C', balance: 100000, minimumPayment: 10000 }),
    ];
    const plan = simulatePayoff(debts, 10000, 'avalanche', 1);
    // 10.000 / 3 = 3.333 cada + 1 centavo para a primeira.
    expect(plan.totalPaid).toBe(10000);
    expect(plan.timeline[1].totalBalance).toBe(290000);
  });

  it('pagamento que não cobre os juros nunca quita => inviável em maxMonths', () => {
    const plan = simulatePayoff(
      [input({ id: 'cheque', balance: 100000, monthlyRatePct: 8, minimumPayment: 5000 })],
      5000,
      'avalanche',
    );
    expect(plan.feasible).toBe(false);
    expect(plan.months).toBe(600);
    expect(plan.payoffOrder).toEqual([]);
    // O saldo cresce: juros de 8.000 > pagamento de 5.000.
    expect(plan.timeline[1].totalBalance).toBe(103000);
    expect(plan.timeline.at(-1)!.totalBalance).toBeGreaterThan(100000);
    expect(Number.isSafeInteger(plan.totalInterest)).toBe(true);
  });

  it('pagamento igual aos juros mantém o saldo e respeita maxMonths informado', () => {
    const plan = simulatePayoff(
      [input({ id: 'd', balance: 100000, monthlyRatePct: 2, minimumPayment: 2000 })],
      2000,
      'snowball',
      24,
    );
    expect(plan.feasible).toBe(false);
    expect(plan.months).toBe(24);
    expect(plan.timeline.every((t) => t.totalBalance === 100000)).toBe(true);
    expect(plan.totalInterest).toBe(plan.totalPaid);
  });

  it('orçamento zero é inviável imediatamente', () => {
    const plan = simulatePayoff([input({ id: 'd', balance: 1000, minimumPayment: 100 })], 0, 'avalanche');
    expect(plan.feasible).toBe(false);
    expect(plan.months).toBe(600);
    expect(plan.totalPaid).toBe(0);
  });

  it('sem dívidas (ou só saldos zerados) é viável em 0 meses', () => {
    const plan = simulatePayoff([input({ id: 'zero', balance: 0 })], 10000, 'snowball');
    expect(plan).toEqual({
      strategy: 'snowball',
      feasible: true,
      months: 0,
      totalInterest: 0,
      totalPaid: 0,
      payoffOrder: [],
      timeline: [{ month: 0, totalBalance: 0 }],
    });
  });

  it('mínimo maior que o saldo paga só o saldo e não gasta o resto do orçamento', () => {
    const plan = simulatePayoff(
      [input({ id: 'd', balance: 3000, minimumPayment: 10000 })],
      50000,
      'avalanche',
    );
    expect(plan.months).toBe(1);
    expect(plan.totalPaid).toBe(3000);
    expect(plan.feasible).toBe(true);
  });

  it('empate de taxa (avalanche) e de saldo (snowball) segue a ordem de entrada', () => {
    const debts = [
      input({ id: 'X', balance: 20000, minimumPayment: 1000 }),
      input({ id: 'Y', balance: 20000, minimumPayment: 1000 }),
    ];
    for (const strategy of ['avalanche', 'snowball'] as const) {
      const plan = simulatePayoff(debts, 12000, strategy);
      expect(plan.payoffOrder.map((p) => p.debtId)).toEqual(['X', 'Y']);
      expect(plan.payoffOrder[0].month).toBeLessThan(plan.payoffOrder[1].month);
    }
  });
});

describe('compareStrategies', () => {
  it('recomenda avalanche quando economiza juros', () => {
    const cmp = compareStrategies(
      [
        input({ id: 'A', balance: 100000, monthlyRatePct: 3, minimumPayment: 10000 }),
        input({ id: 'B', balance: 50000, monthlyRatePct: 1, minimumPayment: 10000 }),
      ],
      40000,
    );
    expect(cmp.avalanche.totalInterest).toBe(8468);
    expect(cmp.snowball.totalInterest).toBe(9954);
    expect(cmp.interestSavings).toBe(1486);
    expect(cmp.recommended).toBe('avalanche');
  });

  it('empate de juros => snowball', () => {
    const cmp = compareStrategies([input({ id: 'unica', balance: 100000, monthlyRatePct: 2 })], 20000);
    expect(cmp.interestSavings).toBe(0);
    expect(cmp.recommended).toBe('snowball');
  });

  it('quando a menor dívida é também a mais cara, as estratégias coincidem', () => {
    const cmp = compareStrategies(
      [
        input({ id: 'grande', balance: 500000, monthlyRatePct: 1, minimumPayment: 10000 }),
        input({ id: 'pequena', balance: 50000, monthlyRatePct: 5, minimumPayment: 5000 }),
      ],
      50000,
    );
    expect(cmp.avalanche.payoffOrder).toEqual(cmp.snowball.payoffOrder);
    expect(cmp.interestSavings).toBe(0);
    expect(cmp.recommended).toBe('snowball');
  });
});

describe('toPayoffInputs', () => {
  it('usa o saldo atual das dívidas ativas e omite quitadas/zeradas', () => {
    const a = makeDebt({
      id: 'a',
      name: 'A',
      balance: 100000,
      balanceDate: '2026-01-01',
      interestRate: 3,
      minimumPayment: 5000,
    });
    const b = makeDebt({ id: 'b', name: 'B', status: 'quitada' });
    const c = makeDebt({ id: 'c', name: 'C', balance: 20000, balanceDate: '2026-01-01' });
    const payments = [
      makeDebtPayment({ debtId: 'a', amount: 25000, date: '2026-03-01' }),
      makeDebtPayment({ debtId: 'c', amount: 20808, date: '2026-03-01' }), // 20.000 + 2 meses a 2% => zera
    ];
    // A: 100.000 → 103.000 → 106.090 (juros de jan e fev) − 25.000 = 81.090.
    expect(toPayoffInputs([a, b, c], payments)).toEqual([
      { id: 'a', name: 'A', balance: 81090, monthlyRatePct: 3, minimumPayment: 5000 },
    ]);
  });
});
