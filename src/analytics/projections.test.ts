import { describe, expect, it } from 'vitest';
import type { FinanceData, Transaction } from '@/domain/types';
import { makeAccount, makeData, makeTransaction } from '@/test/factories';
import {
  affordability,
  annualToMonthlyRate,
  compoundGrowth,
  monthlyToAnnualRate,
  monthsToReach,
} from './projections';

describe('conversão de taxas', () => {
  it('1% a.m. equivale a ~12,68% a.a. e vice-versa', () => {
    expect(monthlyToAnnualRate(1)).toBeCloseTo(12.682503013, 8);
    expect(annualToMonthlyRate(monthlyToAnnualRate(1))).toBeCloseTo(1, 10);
    // Poupança/CDI: 10% a.a. ≈ 0,7974% a.m.
    expect(annualToMonthlyRate(10)).toBeCloseTo(0.797414, 6);
  });

  it('ida e volta preserva a taxa; zero continua zero', () => {
    for (const annual of [0, 6.5, 13.75, 100])
      expect(monthlyToAnnualRate(annualToMonthlyRate(annual))).toBeCloseTo(annual, 9);
    expect(annualToMonthlyRate(0)).toBe(0);
    expect(monthlyToAnnualRate(0)).toBe(0);
  });

  it('taxas negativas válidas funcionam; <= -100% é limitado a -100', () => {
    expect(monthlyToAnnualRate(-1)).toBeCloseTo((Math.pow(0.99, 12) - 1) * 100, 10);
    expect(annualToMonthlyRate(-100)).toBe(-100);
    expect(monthlyToAnnualRate(-150)).toBe(-100);
  });
});

describe('compoundGrowth', () => {
  it('juros arredondados mês a mês com aporte no fim do mês (conferido à mão)', () => {
    expect(compoundGrowth(100000, 10000, 1, 3)).toEqual([
      { month: 0, contributed: 100000, interest: 0, total: 100000 },
      { month: 1, contributed: 110000, interest: 1000, total: 111000 },
      { month: 2, contributed: 120000, interest: 2110, total: 122110 },
      // 122.110 × 1,01 = 123.331,1 => 123.331 + 10.000
      { month: 3, contributed: 130000, interest: 3331, total: 133331 },
    ]);
  });

  it('sem juros é só a soma dos aportes', () => {
    const points = compoundGrowth(0, 50000, 0, 12);
    expect(points).toHaveLength(13);
    expect(points[12]).toEqual({ month: 12, contributed: 600000, interest: 0, total: 600000 });
  });

  it('months <= 0 devolve só o ponto inicial; meses fracionários são truncados', () => {
    expect(compoundGrowth(5000, 100, 1, 0)).toEqual([
      { month: 0, contributed: 5000, interest: 0, total: 5000 },
    ]);
    expect(compoundGrowth(5000, 100, 1, -3)).toHaveLength(1);
    expect(compoundGrowth(5000, 100, 1, 2.9)).toHaveLength(3);
  });
});

describe('monthsToReach', () => {
  it('é consistente com compoundGrowth', () => {
    expect(monthsToReach(133331, 100000, 10000, 1)).toBe(3);
    expect(monthsToReach(133332, 100000, 10000, 1)).toBe(4);
  });

  it('já atingido => 0', () => {
    expect(monthsToReach(100000, 100000, 0, 0)).toBe(0);
    expect(monthsToReach(50000, 100000, 0, 0)).toBe(0);
  });

  it('sem juros: divisão simples, arredondada para cima', () => {
    expect(monthsToReach(100000, 0, 10000, 0)).toBe(10);
    expect(monthsToReach(100001, 0, 10000, 0)).toBe(11);
  });

  it('impossível => null (sem aporte e sem juros, ou além de maxMonths)', () => {
    expect(monthsToReach(100000, 50000, 0, 0)).toBeNull();
    expect(monthsToReach(100000, 0, 0, 2)).toBeNull();
    expect(monthsToReach(100000, 0, 10000, 0, 5)).toBeNull();
    // Saque mensal maior que os juros: o saldo só diminui.
    expect(monthsToReach(200000, 100000, -2000, 1)).toBeNull();
  });

  it('só juros sobre saldo positivo também chega lá', () => {
    // 100.000 a 1% sem aporte: 101.000, 102.010 => 2 meses para 102.000.
    expect(monthsToReach(102000, 100000, 0, 1)).toBe(2);
    // Saque menor que os juros: 100.500, 101.005.
    expect(monthsToReach(101000, 100000, -500, 1)).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/* affordability                                                       */
/* ------------------------------------------------------------------ */

const TODAY = '2026-10-31'; // último dia do mês: sem gasto variável projetado

function monthTx(month: string, income: number, expenses: [string, number][]): Transaction[] {
  return [
    makeTransaction({
      accountId: 'cc',
      type: 'receita',
      amount: income,
      date: `${month}-05`,
      categoryId: 'cat-salario',
    }),
    ...expenses.map(([categoryId, amount], i) =>
      makeTransaction({
        accountId: 'cc',
        amount,
        categoryId,
        date: `${month}-${String(10 + i).padStart(2, '0')}`,
      }),
    ),
  ];
}

const HISTORY_EXPENSES: [string, number][] = [
  ['cat-moradia', 300000],
  ['cat-mercado', 100000],
  ['cat-lazer', 100000],
  ['cat-investimentos', 200000],
];

/**
 * Jul–set: renda 10.000, despesas 7.000, das quais 2.000 são aportes em Investimentos e reserva
 * (sobra média 5.000 — aporte não é gasto; necessidades 4.000 => meta de reserva 24.000).
 * Outubro: renda 10.000, despesas pagas 6.000 e uma pendente de 1.000 no dia 31.
 * Saldo da corrente: 9.000 + 4.000 = 13.000; previsto no fim do mês: 12.000.
 * Reserva: corrente 13.000 + investimentos 20.000 = 33.000 (completa).
 */
function scenario(overrides: Partial<FinanceData> = {}): FinanceData {
  return makeData({
    accounts: [
      makeAccount({ id: 'cc', initialBalance: 0 }),
      makeAccount({ id: 'inv', type: 'investimento', initialBalance: 2000000 }),
    ],
    transactions: [
      ...['2026-07', '2026-08', '2026-09'].flatMap((m) => monthTx(m, 1000000, HISTORY_EXPENSES)),
      ...monthTx('2026-10', 1000000, [
        ['cat-moradia', 300000],
        ['cat-mercado', 100000],
        ['cat-lazer', 100000],
        ['cat-investimentos', 100000],
      ]),
      makeTransaction({ accountId: 'cc', amount: 100000, date: '2026-10-31', status: 'pendente' }),
    ],
    ...overrides,
  });
}

describe('affordability', () => {
  it('compra pequena à vista com reserva completa => sim', () => {
    const r = affordability(scenario(), TODAY, 200000);
    expect(r).toMatchObject({
      amount: 200000,
      installments: 1,
      firstPayment: 200000,
      verdict: 'sim',
      projectedEndBalance: 1200000,
      balanceAfter: 1000000,
      averageMonthlySurplus: 500000,
    });
    expect(r.reasons).toEqual([
      'Seu saldo previsto para o fim do mês é R$ 12.000,00; depois da compra, ficaria em R$ 10.000,00.',
      'Sua sobra média nos últimos meses é de R$ 5.000,00 por mês.',
      'Sua reserva de emergência está completa.',
    ]);
  });

  it('consumir mais da metade da folga do mês => com cautela', () => {
    const r = affordability(scenario(), TODAY, 700000);
    expect(r.verdict).toBe('com_cautela');
    expect(r.balanceAfter).toBe(500000);
    expect(r.reasons).toContain('Isso consome 58% da folga prevista para o mês.');
  });

  it('exatamente 50% da folga ainda é sim', () => {
    expect(affordability(scenario(), TODAY, 600000).verdict).toBe('sim');
  });

  it('saldo negativo no fim do mês => não', () => {
    const r = affordability(scenario(), TODAY, 1500000);
    expect(r.verdict).toBe('nao');
    expect(r.balanceAfter).toBe(-300000);
    expect(r.reasons[0]).toBe(
      'Seu saldo previsto para o fim do mês é R$ 12.000,00; com a compra de R$ 15.000,00, ficaria negativo em R$ 3.000,00.',
    );
  });

  it('parcela maior que a sobra média => não, mesmo com saldo positivo', () => {
    const r = affordability(scenario(), TODAY, 1800000, 3);
    expect(r.firstPayment).toBe(600000);
    expect(r.balanceAfter).toBe(600000);
    expect(r.verdict).toBe('nao');
    expect(r.reasons).toContain(
      'A parcela de R$ 6.000,00 é maior que sua sobra média de R$ 5.000,00 por mês.',
    );
  });

  it('parcela que cabe na sobra => sim', () => {
    const r = affordability(scenario(), TODAY, 600000, 3);
    expect(r.verdict).toBe('sim');
    expect(r.reasons[0]).toContain('depois da 1ª parcela');
    expect(r.reasons).toContain('A parcela de R$ 2.000,00 cabe na sua sobra média de R$ 5.000,00 por mês.');
  });

  it('o primeiro mês parcial não infla a sobra média (gastos extrapolados pelos dias registrados)', () => {
    // Começou em 20/09: salário de 5.000 em 05/09 e R$ 100,00 por dia de mercado de 20 a 30/09.
    const data = makeData({
      accounts: [makeAccount({ id: 'cc', initialBalance: 400000, createdAt: '2026-09-20T12:00:00.000Z' })],
      transactions: [
        makeTransaction({ accountId: 'cc', type: 'receita', amount: 500000, date: '2026-09-05', categoryId: 'cat-salario' }),
        ...Array.from({ length: 11 }, (_, i) =>
          makeTransaction({ accountId: 'cc', amount: 10000, date: `2026-09-${20 + i}` }),
        ),
      ],
    });
    const r = affordability(data, '2026-10-01', 600000, 3);
    // Antes: sobra média de R$ 3.900,00 e veredito 'sim'; no ritmo real sobram ~R$ 2.000,00.
    expect(r.averageMonthlySurplus).toBe(200000);
    expect(r.verdict).not.toBe('sim');
  });

  it('aportes em Investimentos e reserva não contam como gasto na sobra média', () => {
    // Jul–set: renda 5.000, moradia 3.000 e 2.000 investidos todo mês.
    const data = makeData({
      accounts: [makeAccount({ id: 'cc', initialBalance: 1000000 })],
      transactions: ['2026-07', '2026-08', '2026-09'].flatMap((m) =>
        monthTx(m, 500000, [
          ['cat-moradia', 300000],
          ['cat-investimentos', 200000],
        ]),
      ),
    });
    const r = affordability(data, '2026-10-01', 60000, 3);
    // Antes: sobra 0, veredito 'nao' e "suas despesas igualaram suas receitas".
    expect(r.averageMonthlySurplus).toBe(200000);
    expect(r.verdict).not.toBe('nao');
    expect(r.reasons).toContain('A parcela de R$ 200,00 cabe na sua sobra média de R$ 2.000,00 por mês.');
  });

  it('primeira parcela leva os centavos extras (como o parcelamento do app)', () => {
    const r = affordability(scenario(), TODAY, 100000, 3);
    expect(r.firstPayment).toBe(33334);
    expect(r.installments).toBe(3);
  });

  it('reserva abaixo da meta => com cautela, com quanto falta', () => {
    const data = scenario({ accounts: [makeAccount({ id: 'cc', initialBalance: 0 })] });
    const r = affordability(data, TODAY, 100000);
    expect(r.verdict).toBe('com_cautela');
    // Meta 24.000 - reserva 13.000.
    expect(r.reasons).toContain('Sua reserva de emergência está abaixo da meta: faltam R$ 11.000,00.');
  });

  it('sobra média negativa: parcelado é não e a explicação mostra o déficit', () => {
    const deficit = scenario({
      transactions: ['2026-07', '2026-08', '2026-09'].flatMap((m) =>
        monthTx(m, 500000, [['cat-moradia', 600000]]),
      ),
      accounts: [
        makeAccount({ id: 'cc', initialBalance: 1000000 }),
        makeAccount({ id: 'inv', type: 'investimento', initialBalance: 5000000 }),
      ],
    });
    const r = affordability(deficit, TODAY, 30000, 2);
    expect(r.averageMonthlySurplus).toBe(-100000);
    expect(r.verdict).toBe('nao');
    expect(r.reasons).toContain(
      'Nos últimos meses suas despesas superaram suas receitas em R$ 1.000,00 por mês, em média.',
    );
  });

  it('sem histórico: não julga pela sobra e avisa', () => {
    const data = makeData({ accounts: [makeAccount({ id: 'cc', initialBalance: 500000 })] });
    const r = affordability(data, '2026-10-15', 100000, 4);
    expect(r.averageMonthlySurplus).toBe(0);
    expect(r.projectedEndBalance).toBe(500000);
    expect(r.verdict).toBe('sim');
    expect(r.reasons).toContain(
      'Ainda não há meses completos registrados para avaliar sua sobra mensal média.',
    );
  });

  it('sempre explica com 2 a 4 frases e normaliza entradas inválidas', () => {
    const data = scenario({ accounts: [makeAccount({ id: 'cc', initialBalance: 0 })] });
    for (const [amount, n] of [
      [200000, 1],
      [700000, 1],
      [1500000, 1],
      [1200000, 3],
      [600000, 0],
      [-500, 2.7],
    ] as const) {
      const r = affordability(data, TODAY, amount, n);
      expect(r.reasons.length).toBeGreaterThanOrEqual(2);
      expect(r.reasons.length).toBeLessThanOrEqual(4);
      expect(r.installments).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(r.firstPayment)).toBe(true);
    }
    const neg = affordability(data, TODAY, -500, 2.7);
    expect(neg).toMatchObject({ amount: 0, installments: 2, firstPayment: 0 });
  });
});
