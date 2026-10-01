import { describe, expect, it } from 'vitest';
import { compareStrategies, type PayoffPlan, type StrategyComparison } from '@/analytics';
import { makeDebt, makeDebtPayment } from '@/test/factories';
import {
  annualInputToMonthly,
  debtFormToFields,
  debtToFormValues,
  defaultPayoffBudget,
  isHighInterest,
  nextDueDate,
  payoffAdvice,
  payoffChartRows,
  payoffPlanStatus,
  paymentsOf,
  validateDebtForm,
  validatePayment,
  yearlyIndices,
  type DebtFormValues,
} from './debt-utils';

const TODAY = '2026-10-15';

function form(p: Partial<DebtFormValues> = {}): DebtFormValues {
  return { ...debtToFormValues(null, TODAY), name: 'Cartão', balance: 100000, rate: '2,5', ...p };
}

function plan(p: Partial<PayoffPlan>): PayoffPlan {
  return {
    strategy: 'avalanche',
    feasible: true,
    months: 10,
    totalInterest: 1000,
    totalPaid: 101000,
    payoffOrder: [],
    timeline: [{ month: 0, totalBalance: 100000 }],
    ...p,
  };
}

describe('isHighInterest', () => {
  it('marca taxas a partir de 4% a.m. e cartão/cheque especial independentemente da taxa', () => {
    expect(isHighInterest({ interestRate: 4, type: 'emprestimo' })).toBe(true);
    expect(isHighInterest({ interestRate: 3.99, type: 'emprestimo' })).toBe(false);
    expect(isHighInterest({ interestRate: 0, type: 'cartao' })).toBe(true);
    expect(isHighInterest({ interestRate: 1, type: 'cheque_especial' })).toBe(true);
    expect(isHighInterest({ interestRate: 1.2, type: 'financiamento' })).toBe(false);
  });
});

describe('nextDueDate', () => {
  it('usa o mês corrente quando o vencimento ainda não passou (hoje inclusive)', () => {
    expect(nextDueDate('2026-10-15', 15)).toBe('2026-10-15');
    expect(nextDueDate('2026-10-15', 20)).toBe('2026-10-20');
  });
  it('vai para o mês seguinte quando o dia já passou', () => {
    expect(nextDueDate('2026-10-15', 10)).toBe('2026-11-10');
    expect(nextDueDate('2026-12-20', 5)).toBe('2027-01-05');
  });
  it('limita ao último dia de meses curtos', () => {
    expect(nextDueDate('2027-02-10', 31)).toBe('2027-02-28');
    expect(nextDueDate('2027-02-28', 30)).toBe('2027-02-28');
    expect(nextDueDate('2026-10-31', 30)).toBe('2026-11-30');
    expect(nextDueDate('2027-01-31', 30)).toBe('2027-02-28');
  });
});

describe('paymentsOf', () => {
  it('filtra pela dívida e ordena do mais recente (desempate pela criação)', () => {
    const list = [
      makeDebtPayment({ id: 'a', debtId: 'd1', date: '2026-09-01' }),
      makeDebtPayment({ id: 'b', debtId: 'd2', date: '2026-10-01' }),
      makeDebtPayment({ id: 'c', debtId: 'd1', date: '2026-10-01', createdAt: '2026-10-01T10:00:00.000Z' }),
      makeDebtPayment({ id: 'd', debtId: 'd1', date: '2026-10-01', createdAt: '2026-10-01T12:00:00.000Z' }),
    ];
    expect(paymentsOf('d1', list).map((p) => p.id)).toEqual(['d', 'c', 'a']);
  });
});

describe('defaultPayoffBudget', () => {
  it('é a soma dos mínimos + 10%, arredondada para cima em reais', () => {
    expect(defaultPayoffBudget(50000)).toBe(55000);
    expect(defaultPayoffBudget(33333)).toBe(36700);
  });
  it('sem mínimos não há sugestão', () => {
    expect(defaultPayoffBudget(0)).toBeNull();
  });
});

describe('annualInputToMonthly', () => {
  it('converte a taxa anual na mensal equivalente (juros compostos)', () => {
    expect(annualInputToMonthly('12,6825')).toBe('1');
    expect(annualInputToMonthly('30%')).toBe('2,2104');
    expect(annualInputToMonthly('0')).toBe('0');
  });
  it('rejeita texto inválido', () => {
    expect(annualInputToMonthly('')).toBeNull();
    expect(annualInputToMonthly('abc')).toBeNull();
  });
});

describe('validateDebtForm', () => {
  it('aceita um formulário completo', () => {
    expect(validateDebtForm(form({ dueDay: '10', remainingInstallments: '12' }), TODAY)).toEqual({});
  });
  it('exige nome, saldo positivo e taxa', () => {
    const errors = validateDebtForm(form({ name: '  ', balance: null, rate: '' }), TODAY);
    expect(errors.name).toBeTruthy();
    expect(errors.balance).toBe('Informe o saldo devedor atual.');
    expect(errors.rate).toMatch(/use 0/);
    expect(validateDebtForm(form({ balance: 0 }), TODAY).balance).toMatch(/maior que zero/);
  });
  it('aceita taxa zero mas rejeita taxa inválida ou alta demais', () => {
    expect(validateDebtForm(form({ rate: '0' }), TODAY).rate).toBeUndefined();
    expect(validateDebtForm(form({ rate: '2,5,1' }), TODAY).rate).toMatch(/inválida/);
    expect(validateDebtForm(form({ rate: '150' }), TODAY).rate).toMatch(/ao ano/);
  });
  it('valida a data do saldo (não futura), o dia de vencimento e as parcelas', () => {
    expect(validateDebtForm(form({ balanceDate: '2026-10-16' }), TODAY).balanceDate).toMatch(/futuro/);
    expect(validateDebtForm(form({ balanceDate: '' }), TODAY).balanceDate).toBeTruthy();
    expect(validateDebtForm(form({ dueDay: '32' }), TODAY).dueDay).toBeTruthy();
    expect(validateDebtForm(form({ dueDay: '0' }), TODAY).dueDay).toBeTruthy();
    expect(
      validateDebtForm(form({ remainingInstallments: '1,5' }), TODAY).remainingInstallments,
    ).toBeTruthy();
  });
});

describe('debtFormToFields / debtToFormValues', () => {
  it('converte o formulário em campos da dívida (valor original vazio = saldo)', () => {
    const fields = debtFormToFields(
      form({
        name: '  Cartão   Roxo ',
        creditor: ' Banco ',
        rate: '12,5%',
        minimumPayment: null,
        dueDay: '05',
      }),
    );
    expect(fields).toEqual({
      name: 'Cartão Roxo',
      creditor: 'Banco',
      type: 'emprestimo',
      originalAmount: 100000,
      balance: 100000,
      balanceDate: TODAY,
      interestRate: 12.5,
      minimumPayment: 0,
      dueDay: 5,
      remainingInstallments: null,
      notes: '',
    });
  });
  it('preenche a edição com os valores da dívida e volta aos mesmos campos', () => {
    const debt = makeDebt({
      interestRate: 2.75,
      dueDay: null,
      remainingInstallments: 18,
      notes: 'contrato 123',
    });
    const values = debtToFormValues(debt, TODAY);
    expect(values.rate).toBe('2,75');
    expect(values.dueDay).toBe('');
    const fields = debtFormToFields(values);
    expect(fields).toMatchObject({
      name: debt.name,
      balance: debt.balance,
      balanceDate: debt.balanceDate,
      interestRate: 2.75,
      dueDay: null,
      remainingInstallments: 18,
      notes: 'contrato 123',
    });
  });
});

describe('validatePayment', () => {
  it('exige valor positivo e data não futura', () => {
    expect(validatePayment(1000, TODAY, TODAY)).toEqual({});
    expect(validatePayment(null, TODAY, TODAY).amount).toBeTruthy();
    expect(validatePayment(0, TODAY, TODAY).amount).toBeTruthy();
    expect(validatePayment(1000, '2026-10-16', TODAY).date).toMatch(/futuro/);
    expect(validatePayment(1000, '', TODAY).date).toBeTruthy();
  });
});

describe('payoffAdvice', () => {
  const cartao = { id: 'c', name: 'Cartão', balance: 300000, monthlyRatePct: 12, minimumPayment: 30000 };
  const emprestimo = {
    id: 'e',
    name: 'Empréstimo',
    balance: 100000,
    monthlyRatePct: 2,
    minimumPayment: 10000,
  };

  it('recomenda a avalanche quando ela economiza juros e cita a vitória rápida da bola de neve', () => {
    const cmp = compareStrategies([cartao, emprestimo], 80000);
    const advice = payoffAdvice(cmp, 80000, 40000, 2);
    expect(advice.kind).toBe('economia');
    if (advice.kind !== 'economia') return;
    expect(advice.strategy).toBe('avalanche');
    expect(advice.savings).toBe(cmp.interestSavings);
    expect(advice.savings).toBeGreaterThan(0);
    expect(advice.quickWin).toEqual({ name: 'Empréstimo', month: cmp.snowball.payoffOrder[0].month });
  });

  it('avisa quando o orçamento não cobre os mínimos', () => {
    const cmp = compareStrategies([cartao, emprestimo], 30000);
    expect(payoffAdvice(cmp, 30000, 40000, 2)).toEqual({ kind: 'inviavel_minimos', shortfall: 10000 });
  });

  it('avisa quando os juros consomem o pagamento', () => {
    const semMinimo = { ...cartao, minimumPayment: 0 };
    const cmp = compareStrategies([semMinimo], 20000); // juros de R$ 360/mês > R$ 200
    expect(payoffAdvice(cmp, 20000, 0, 1)).toEqual({ kind: 'inviavel_juros' });
  });

  it('empate com uma única dívida', () => {
    const cmp = compareStrategies([emprestimo], 20000);
    expect(payoffAdvice(cmp, 20000, 10000, 1)).toEqual({ kind: 'empate', singleDebt: true });
  });

  it('só uma estratégia viável', () => {
    const cmp: StrategyComparison = {
      avalanche: plan({ feasible: false }),
      snowball: plan({ strategy: 'snowball' }),
      recommended: 'snowball',
      interestSavings: 0,
    };
    expect(payoffAdvice(cmp, 50000, 10000, 2)).toEqual({ kind: 'unica', strategy: 'snowball' });
  });

  it('bola de neve mais barata (caso raro) também é explicada', () => {
    const cmp: StrategyComparison = {
      avalanche: plan({ months: 12, totalInterest: 5000 }),
      snowball: plan({ strategy: 'snowball', months: 11, totalInterest: 4000 }),
      recommended: 'snowball',
      interestSavings: -1000,
    };
    expect(payoffAdvice(cmp, 50000, 10000, 2)).toMatchObject({
      kind: 'economia',
      strategy: 'snowball',
      savings: 1000,
      monthsSaved: 1,
      quickWin: null,
    });
  });
});

describe('payoffPlanStatus', () => {
  const cheque = { id: 'c', name: 'Cheque especial', balance: 80000, monthlyRatePct: 8, minimumPayment: 10000 };
  const pessoal = {
    id: 'e',
    name: 'Empréstimo pessoal',
    balance: 460000,
    monthlyRatePct: 3.5,
    minimumPayment: 40000,
  };

  it('viável quando o orçamento cobre os mínimos e quita tudo', () => {
    const cmp = compareStrategies([cheque, pessoal], 55000);
    expect(payoffPlanStatus(cmp.avalanche)).toBe('viavel');
    expect(payoffPlanStatus(cmp.snowball)).toBe('viavel');
  });

  it('abaixo dos mínimos: a simulação quita, mas o plano não é viável (não diz "não quita em 50 anos")', () => {
    // R$ 450 < mínimos de R$ 500: feasible=false, mas as duas dívidas zeram nos meses 17 e 18.
    const cmp = compareStrategies([cheque, pessoal], 45000);
    for (const p of [cmp.avalanche, cmp.snowball]) {
      expect(p.feasible).toBe(false);
      expect(p.payoffOrder.map((o) => o.month)).toEqual([17, 18]);
      expect(payoffPlanStatus(p)).toBe('abaixo_minimos');
    }
  });

  it('não quita em até 50 anos, inclusive quando só parte das dívidas acaba', () => {
    const cartao = { id: 'k', name: 'Cartão', balance: 300000, monthlyRatePct: 12, minimumPayment: 30000 };
    const emprestimo = { id: 'p', name: 'Empréstimo', balance: 100000, monthlyRatePct: 2, minimumPayment: 10000 };
    const cmp = compareStrategies([cartao, emprestimo], 44000);
    expect(cmp.snowball.payoffOrder.map((o) => o.name)).toEqual(['Empréstimo']);
    expect(payoffPlanStatus(cmp.snowball)).toBe('nao_quita');
    expect(payoffPlanStatus(cmp.avalanche)).toBe('viavel');
    expect(
      payoffPlanStatus(
        plan({
          feasible: false,
          months: 600,
          timeline: [
            { month: 0, totalBalance: 100000 },
            { month: 1, totalBalance: 101000 },
          ],
        }),
      ),
    ).toBe('nao_quita');
  });
});

describe('payoffChartRows / yearlyIndices', () => {
  it('junta as linhas do tempo e termina cada série no fim do plano', () => {
    const cmp: StrategyComparison = {
      avalanche: plan({
        timeline: [
          { month: 0, totalBalance: 1000 },
          { month: 1, totalBalance: 0 },
        ],
      }),
      snowball: plan({
        strategy: 'snowball',
        timeline: [
          { month: 0, totalBalance: 1000 },
          { month: 1, totalBalance: 600 },
          { month: 2, totalBalance: 0 },
        ],
      }),
      recommended: 'avalanche',
      interestSavings: 10,
    };
    expect(payoffChartRows(cmp, TODAY)).toEqual([
      { month: 0, label: 'out/26', avalanche: 1000, snowball: 1000 },
      { month: 1, label: 'nov/26', avalanche: 0, snowball: 600 },
      { month: 2, label: 'dez/26', avalanche: null, snowball: 0 },
    ]);
  });

  it('amostra o início, cada ano e o último mês', () => {
    expect(yearlyIndices(0)).toEqual([]);
    expect(yearlyIndices(1)).toEqual([0]);
    expect(yearlyIndices(13)).toEqual([0, 12]);
    expect(yearlyIndices(14)).toEqual([0, 12, 13]);
  });
});
