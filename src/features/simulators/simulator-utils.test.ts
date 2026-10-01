import { describe, expect, it } from 'vitest';
import { annualToMonthlyRate, compoundGrowth } from '@/analytics';
import {
  compoundSimulation,
  goalTime,
  monthlyToCompleteIn,
  parseTab,
  payOrInvest,
  reservePlan,
  yearTicks,
  yearlyPoints,
} from './simulator-utils';

describe('parseTab', () => {
  it('aceita as abas conhecidas e cai em juros compostos', () => {
    expect(parseTab('quitar')).toBe('quitar');
    expect(parseTab(null)).toBe('juros');
    expect(parseTab('xyz')).toBe('juros');
  });
});

describe('compoundSimulation', () => {
  it('sem juros, o valor final é inicial + aportes', () => {
    const r = compoundSimulation(100000, 10000, 0, 1);
    expect(r).toMatchObject({ final: 220000, contributed: 220000, interest: 0, monthlyRate: 0 });
    expect(r.points).toHaveLength(13);
  });

  it('converte a taxa anual na mensal equivalente (12,6825% a.a. = 1% a.m.)', () => {
    const r = compoundSimulation(100000, 0, 12.6825, 1);
    expect(r.monthlyRate).toBeCloseTo(1, 6);
    // 1.000 × 1,01^12 = 1.126,83; com os juros arredondados ao centavo todo mês: ... 1.115,68 → 1.126,84
    expect(r.final).toBe(112684);
    expect(r.interest).toBe(12684);
  });

  it('usa a mesma regra de compoundGrowth (aporte no fim do mês)', () => {
    const r = compoundSimulation(100000, 50000, 10, 10);
    const expected = compoundGrowth(100000, 50000, annualToMonthlyRate(10), 120);
    expect(r.points).toEqual(expected);
    expect(r.final).toBe(expected[120].total);
    expect(r.contributed).toBe(100000 + 50000 * 120);
    expect(r.interest).toBe(r.final - r.contributed);
  });
});

describe('yearlyPoints / yearTicks', () => {
  it('pega o início, cada ano e o último mês', () => {
    const points = compoundGrowth(0, 100, 0, 30);
    expect(yearlyPoints(points).map((p) => p.month)).toEqual([0, 12, 24, 30]);
  });
  it('espaça as marcas conforme o prazo', () => {
    expect(yearTicks(6)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(yearTicks(120)).toHaveLength(11);
    expect(yearTicks(240)).toEqual([0, 60, 120, 180, 240]);
    expect(yearTicks(600)).toEqual([0, 120, 240, 360, 480, 600]);
  });
});

describe('goalTime', () => {
  it('calcula os meses, o total aportado e o saldo final', () => {
    expect(goalTime(120000, 0, 10000, 0)).toEqual({ months: 12, contributed: 120000, finalBalance: 120000 });
  });
  it('objetivo já atingido e objetivo impossível', () => {
    expect(goalTime(100000, 100000, 0, 10)).toEqual({ months: 0, contributed: 100000, finalBalance: 100000 });
    expect(goalTime(100000, 0, 0, 10)).toEqual({ months: null, contributed: null, finalBalance: null });
  });
  it('os juros encurtam o caminho', () => {
    const semJuros = goalTime(10000000, 0, 100000, 0).months!;
    const comJuros = goalTime(10000000, 0, 100000, 12).months!;
    expect(semJuros).toBe(100);
    expect(comJuros).toBeLessThan(semJuros);
  });
});

describe('payOrInvest', () => {
  it('dívida a 3% a.m. contra investimento de 10% a.a. com 15% de IR: quitar', () => {
    const r = payOrInvest(3, 10, 15, 100000);
    expect(r.winner).toBe('quitar');
    expect(r.investNetAnnual).toBeCloseTo(8.5);
    expect(r.debtAnnual).toBeCloseTo(42.576, 2);
    expect(r.savedIn12).toBe(compoundGrowth(100000, 0, 3, 12)[12].total - 100000);
    expect(r.savedIn12).toBeGreaterThan(r.earnedIn12);
    expect(r.earnedIn12).toBe(compoundGrowth(100000, 0, annualToMonthlyRate(8.5), 12)[12].total - 100000);
  });
  it('dívida barata (0,5% a.m.) contra 12% a.a. isento: investir', () => {
    expect(payOrInvest(0.5, 12, 0, 100000).winner).toBe('investir');
  });
  it('taxas equivalentes empatam; imposto é limitado a 0..100%', () => {
    expect(payOrInvest(annualToMonthlyRate(10), 10, 0, 100000).winner).toBe('empate');
    expect(payOrInvest(1, 10, 150, 100000).investNetAnnual).toBe(0);
    expect(payOrInvest(1, 10, 15, -5).savedIn12).toBe(0);
  });
});

describe('reservePlan / monthlyToCompleteIn', () => {
  it('calcula meta, falta, meses cobertos e quando completa', () => {
    expect(reservePlan(300000, 100000, 6, 50000, 0)).toEqual({
      target: 600000,
      gap: 300000,
      monthsCovered: 3,
      monthsToComplete: 6,
    });
  });
  it('reserva completa, sem aporte e sem custo essencial', () => {
    expect(reservePlan(700000, 100000, 6, 0, 0)).toMatchObject({ gap: 0, monthsToComplete: 0 });
    expect(reservePlan(0, 100000, 6, 0, 0).monthsToComplete).toBeNull();
    expect(reservePlan(1000, 0, 6, 0, 0)).toMatchObject({
      target: 0,
      gap: 0,
      monthsCovered: null,
      monthsToComplete: 0,
    });
  });
  it('rendimento reduz o tempo', () => {
    const sem = reservePlan(0, 100000, 6, 20000, 0).monthsToComplete!;
    const com = reservePlan(0, 100000, 6, 20000, 12).monthsToComplete!;
    expect(sem).toBe(30);
    expect(com).toBeLessThan(sem);
  });
  it('aporte sugerido arredondado para cima em R$ 10', () => {
    expect(monthlyToCompleteIn(300000, 12)).toBe(25000);
    expect(monthlyToCompleteIn(300001, 12)).toBe(26000);
    expect(monthlyToCompleteIn(0, 12)).toBe(0);
  });
});
