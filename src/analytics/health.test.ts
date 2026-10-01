import { describe, expect, it } from 'vitest';
import type { FinanceData, Transaction } from '@/domain/types';
import {
  makeAccount,
  makeBudget,
  makeContribution,
  makeData,
  makeDebt,
  makeGoal,
  makeTransaction,
} from '@/test/factories';
import { emergencyFund, financialHealth } from './health';
import type { HealthComponent, HealthReport } from './types';

const TODAY = '2026-10-15';
const COMPLETE_MONTHS = ['2026-07', '2026-08', '2026-09'];

/** Lançamentos típicos de um mês na conta 'cc'. */
function monthTx(
  month: string,
  p: { income?: number; moradia?: number; mercado?: number; lazer?: number; investido?: number } = {},
): Transaction[] {
  const rows: Transaction[] = [];
  const add = (type: 'receita' | 'despesa', amount: number | undefined, categoryId: string, day: string) => {
    if (amount)
      rows.push(makeTransaction({ accountId: 'cc', type, amount, categoryId, date: `${month}-${day}` }));
  };
  add('receita', p.income, 'cat-salario', '05');
  add('despesa', p.moradia, 'cat-moradia', '06');
  add('despesa', p.mercado, 'cat-mercado', '12');
  add('despesa', p.lazer, 'cat-lazer', '20');
  add('despesa', p.investido, 'cat-investimentos', '25');
  return rows;
}

const HEALTHY_MONTH = { income: 1000000, moradia: 300000, mercado: 100000, lazer: 100000, investido: 200000 };

function comp(report: HealthReport, key: HealthComponent['key']): HealthComponent {
  const c = report.components.find((x) => x.key === key);
  if (!c) throw new Error(`componente ${key} ausente`);
  return c;
}

/** Dados de uma pessoa organizada: 3 meses completos iguais, reserva de 6 meses, dívida pequena. */
function healthyData(overrides: Partial<FinanceData> = {}): FinanceData {
  return makeData({
    accounts: [
      makeAccount({ id: 'cc', initialBalance: 0 }),
      makeAccount({ id: 'pp', type: 'poupanca', initialBalance: 1500000 }),
    ],
    transactions: COMPLETE_MONTHS.flatMap((m) => monthTx(m, HEALTHY_MONTH)),
    debts: [
      makeDebt({ id: 'd', name: 'Consignado', balance: 300000, minimumPayment: 50000, interestRate: 1.8 }),
    ],
    budgets: [
      makeBudget({ categoryId: 'cat-mercado', amount: 150000 }),
      makeBudget({ categoryId: 'cat-lazer', amount: 80000 }),
    ],
    goals: [makeGoal({ id: 'g', name: 'Viagem', targetAmount: 1200000, targetDate: '2027-03-31' })],
    goalContributions: [
      makeContribution({ goalId: 'g', amount: 300000, date: '2026-08-10' }),
      makeContribution({ goalId: 'g', amount: 100000, date: '2026-09-10' }),
      makeContribution({ goalId: 'g', amount: 200000, date: '2026-10-05' }),
    ],
    ...overrides,
  });
}

describe('emergencyFund', () => {
  it('reserva completa: necessidades médias × meta (conferido à mão)', () => {
    const ef = emergencyFund(healthyData(), TODAY);
    // Reserva: conta corrente 3 × (1.000.000 - 700.000) = 900.000 + poupança 1.500.000.
    expect(ef).toEqual({
      reserve: 2400000,
      monthlyEssential: 400000, // moradia 300.000 + mercado 100.000
      monthsCovered: 6,
      targetMonths: 6,
      target: 2400000,
      gap: 0,
      level: 'completa',
    });
  });

  it('considera só contas de reserva não arquivadas, com saldo pago até hoje', () => {
    const data = makeData({
      accounts: [
        makeAccount({ id: 'cc', initialBalance: 100000 }),
        makeAccount({ id: 'inv', type: 'investimento', initialBalance: 500000 }),
        makeAccount({ id: 'carteira', type: 'carteira', initialBalance: 5000 }),
        makeAccount({ id: 'card', type: 'cartao_credito', initialBalance: -300000 }),
        makeAccount({ id: 'outro', type: 'outro', initialBalance: 700000 }),
        makeAccount({ id: 'arq', type: 'poupanca', initialBalance: 900000, archived: true }),
      ],
      transactions: [
        ...monthTx('2026-09', { moradia: 100000 }),
        makeTransaction({ accountId: 'cc', amount: 50000, date: '2026-10-20' }), // futura
        makeTransaction({ accountId: 'cc', amount: 50000, date: '2026-10-10', status: 'pendente' }),
      ],
    });
    const ef = emergencyFund(data, TODAY);
    expect(ef.reserve).toBe(100000 - 100000 + 500000 + 5000);
    expect(ef.monthlyEssential).toBe(100000);
    expect(ef.monthsCovered).toBeCloseTo(5.05, 10);
    expect(ef.level).toBe('parcial');
    expect(ef.gap).toBe(600000 - 505000);
  });

  it('saldo negativo (cheque especial) reduz a reserva, que não fica abaixo de zero', () => {
    const data = makeData({
      accounts: [
        makeAccount({ id: 'cc', initialBalance: -200000 }),
        makeAccount({ id: 'pp', type: 'poupanca', initialBalance: 150000 }),
      ],
      transactions: monthTx('2026-09', { mercado: 10000 }),
    });
    const ef = emergencyFund(data, TODAY);
    expect(ef.reserve).toBe(0);
    expect(ef.monthsCovered).toBe(0);
    expect(ef.level).toBe('critica');
  });

  it('média ignora meses vazios e o mês corrente', () => {
    const data = makeData({
      accounts: [makeAccount({ id: 'cc', initialBalance: 2999998 })],
      transactions: [
        ...monthTx('2026-07', { mercado: 200000 }),
        ...monthTx('2026-09', { mercado: 400000 }),
        ...monthTx('2026-10', { mercado: 999999 }),
        ...monthTx('2026-06', { mercado: 999999 }),
      ],
    });
    const ef = emergencyFund(data, TODAY);
    expect(ef.monthlyEssential).toBe(300000); // (200.000 + 400.000) / 2 meses com dados
    // Reserva: 2.999.998 - 200.000 - 400.000 - 999.999 (out) - 999.999 (jun) = 400.000 => 1,33 mês.
    expect(ef.reserve).toBe(400000);
    expect(ef.level).toBe('baixa');
  });

  it('sem necessidades usa 60% da despesa total; sem despesas usa 50% da renda estimada', () => {
    const soDesejos = makeData({
      accounts: [makeAccount({ id: 'cc', initialBalance: 200000 })],
      transactions: monthTx('2026-09', { income: 300000, lazer: 100000 }),
    });
    expect(emergencyFund(soDesejos, TODAY).monthlyEssential).toBe(60000);

    const base = makeData();
    const estimada = makeData({ settings: { ...base.settings, monthlyIncomeEstimate: 500001 } });
    const ef = emergencyFund(estimada, TODAY);
    expect(ef.monthlyEssential).toBe(250001); // round(250.000,5)
    expect(ef.target).toBe(1500006);
    expect(ef.level).toBe('critica');
  });

  it('sem dados => sem_dados, meses cobertos nulos e meta zero', () => {
    const ef = emergencyFund(makeData({ accounts: [makeAccount({ initialBalance: 100000 })] }), TODAY);
    expect(ef).toEqual({
      reserve: 100000,
      monthlyEssential: 0,
      monthsCovered: null,
      targetMonths: 6,
      target: 0,
      gap: 0,
      level: 'sem_dados',
    });
  });

  it('usa a meta de meses das configurações', () => {
    const base = healthyData();
    const ef = emergencyFund(
      { ...base, settings: { ...base.settings, emergencyFundTargetMonths: 12 } },
      TODAY,
    );
    expect(ef.target).toBe(4800000);
    expect(ef.gap).toBe(2400000);
    expect(ef.level).toBe('parcial');
  });
});

describe('financialHealth', () => {
  it('perfil organizado: notas por componente e score ponderado (conferido à mão)', () => {
    const report = financialHealth(healthyData(), TODAY);
    expect(report.components.map((c) => [c.key, c.weight])).toEqual([
      ['poupanca', 25],
      ['reserva', 25],
      ['dividas', 20],
      ['orcamento', 15],
      ['metas', 10],
      ['fluxo', 5],
    ]);

    // Poupança: (300.000 + 200.000) / 1.000.000 = 50% (meta 20%) => 100.
    expect(comp(report, 'poupanca')).toMatchObject({ score: 100, value: '50% da renda' });
    expect(comp(report, 'reserva')).toMatchObject({ score: 100, value: '6 meses' });
    // Dívidas: 50.000 / 1.000.000 = 5% da renda => 100.
    expect(comp(report, 'dividas')).toMatchObject({ score: 100, value: '5% da renda' });
    expect(comp(report, 'dividas').tip).toContain('Consignado (1,8% a.m.)');
    // Orçamentos em setembro: mercado ok (1.000 de 1.500), lazer estourado (1.000 de 800).
    expect(comp(report, 'orcamento')).toMatchObject({ score: 50, value: '1 de 2 dentro do limite' });
    expect(comp(report, 'orcamento').tip).toBe(
      'Em setembro de 2026, Lazer passou do limite. Ajuste esse orçamento ou corte gastos nessa categoria.',
    );
    expect(comp(report, 'metas')).toMatchObject({ score: 100, value: '1 de 1 no ritmo' });
    expect(comp(report, 'fluxo')).toMatchObject({ score: 100, value: '3 de 3 meses no azul' });

    // (100×25 + 100×25 + 100×20 + 50×15 + 100×10 + 100×5) / 100 = 92,5 => 93.
    expect(report.score).toBe(93);
    expect(report.grade).toBe('excelente');
    expect(report.dataQuality).toBe('boa');
    for (const c of report.components) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.tip.length).toBeGreaterThan(20);
    }
  });

  it('sem nenhum dado: neutros para orçamento/metas, zero onde falta histórico', () => {
    const report = financialHealth(makeData(), TODAY);
    expect(report.components.map((c) => [c.key, c.score])).toEqual([
      ['poupanca', 0],
      ['reserva', 0],
      ['dividas', 100],
      ['orcamento', 50],
      ['metas', 50],
      ['fluxo', 0],
    ]);
    expect(comp(report, 'poupanca').value).toBe('Sem renda registrada');
    expect(comp(report, 'poupanca').tip).toContain('Registre suas receitas');
    expect(comp(report, 'orcamento').tip).toContain('Crie orçamentos');
    expect(comp(report, 'metas').tip).toContain('Crie uma meta');
    // (0 + 0 + 2000 + 750 + 500 + 0) / 100 = 32,5 => 33
    expect(report.score).toBe(33);
    expect(report.grade).toBe('critica');
    expect(report.dataQuality).toBe('insuficiente');
  });

  it('taxa de poupança abaixo da meta: nota proporcional e quanto falta por mês', () => {
    const data = healthyData({
      transactions: COMPLETE_MONTHS.flatMap((m) =>
        monthTx(m, { income: 1000000, moradia: 500000, mercado: 200000, lazer: 200000 }),
      ),
    });
    const c = comp(financialHealth(data, TODAY), 'poupanca');
    expect(c.score).toBe(50); // 10% de 20%
    expect(c.value).toBe('10% da renda');
    expect(c.tip).toBe(
      'Para chegar à meta de 20% da renda, poupe mais R$ 1.000,00 por mês — separe esse valor assim que receber.',
    );
  });

  it('gastar mais do que ganha zera a poupança e o fluxo dos meses negativos', () => {
    const data = healthyData({
      transactions: [
        ...monthTx('2026-07', { income: 500000, moradia: 400000 }),
        ...monthTx('2026-08', { income: 500000, moradia: 400000, lazer: 300000 }),
        ...monthTx('2026-09', { income: 500000, moradia: 500000 }),
      ],
    });
    const report = financialHealth(data, TODAY);
    // Saldo acumulado: 100.000 - 200.000 + 0 = -100.000 sobre 1.500.000 => -7%.
    expect(comp(report, 'poupanca')).toMatchObject({ score: 0, value: '-7% da renda' });
    expect(comp(report, 'poupanca').tip).toContain('gastou mais do que ganhou');
    // Julho positivo; agosto negativo; setembro zerado (não conta como positivo).
    const fluxo = comp(report, 'fluxo');
    expect(fluxo.score).toBe(33);
    expect(fluxo.value).toBe('1 de 3 meses no azul');
    expect(fluxo.tip).toContain('agosto de 2026 e setembro de 2026');
  });

  it('dívidas: 30% da renda => 50; >= 50% => 0; renda estimada como alternativa', () => {
    const withMinimum = (minimumPayment: number, extra: Partial<FinanceData> = {}) =>
      comp(
        financialHealth(
          healthyData({ debts: [makeDebt({ name: 'Cartão', minimumPayment, interestRate: 12 })], ...extra }),
          TODAY,
        ),
        'dividas',
      );
    expect(withMinimum(100000).score).toBe(100); // exatamente 10%
    const trinta = withMinimum(300000);
    expect(trinta.score).toBe(50);
    expect(trinta.value).toBe('30% da renda');
    expect(trinta.tip).toBe(
      'As parcelas comprometem 30% da sua renda. Priorize quitar Cartão (12% a.m.) e evite novas parcelas até ficar abaixo de 30%.',
    );
    expect(withMinimum(500000).score).toBe(0);
    expect(withMinimum(700000).score).toBe(0);

    const base = makeData();
    const semReceitas = { transactions: [], settings: { ...base.settings, monthlyIncomeEstimate: 400000 } };
    expect(withMinimum(100000, semReceitas).score).toBe(63); // 25% => (0,5 - 0,25) / 0,4 = 62,5 => 63
    expect(withMinimum(100000, { transactions: [] }).score).toBe(0);
  });

  it('reserva parcial: nota proporcional, valor em meses e dica com quanto falta', () => {
    const data = healthyData({
      accounts: [
        makeAccount({ id: 'cc', initialBalance: 0 }),
        makeAccount({ id: 'pp', type: 'poupanca', initialBalance: 100000 }),
      ],
    });
    const c = comp(financialHealth(data, TODAY), 'reserva');
    // Reserva 1.000.000 / 400.000 = 2,5 meses de 6 => 41,7 => 42.
    expect(c.score).toBe(42);
    expect(c.value).toBe('2,5 meses');
    expect(c.tip).toBe(
      'Faltam R$ 14.000,00 para 6 meses de reserva. Guardando R$ 1.166,67 por mês, você completa em 1 ano.',
    );
  });

  it('orçamentos: sem lançamentos no último mês completo => neutro; sem orçamentos sugere a maior categoria', () => {
    const semSetembro = healthyData({
      transactions: ['2026-07', '2026-08'].flatMap((m) => monthTx(m, HEALTHY_MONTH)),
    });
    expect(comp(financialHealth(semSetembro, TODAY), 'orcamento')).toMatchObject({
      score: 50,
      value: 'Sem lançamentos no último mês',
    });

    const semOrcamentos = comp(financialHealth(healthyData({ budgets: [] }), TODAY), 'orcamento');
    expect(semOrcamentos.score).toBe(50);
    expect(semOrcamentos.value).toBe('Nenhum orçamento');
    expect(semOrcamentos.tip).toContain('comece por Moradia (média de R$ 3.000,00 por mês)');
  });

  it('metas: conta só as em andamento e aponta a mais importante fora do ritmo', () => {
    const data = healthyData({
      goals: [
        makeGoal({
          id: 'ok',
          name: 'Viagem',
          priority: 'baixa',
          targetAmount: 1200000,
          targetDate: '2027-03-31',
        }),
        makeGoal({
          id: 'late',
          name: 'Reserva',
          priority: 'alta',
          targetAmount: 600000,
          targetDate: '2026-12-31',
        }),
        makeGoal({ id: 'p', name: 'Carro', status: 'pausada' }),
      ],
      goalContributions: [
        makeContribution({ goalId: 'ok', amount: 600000, date: '2026-10-01' }),
        makeContribution({ goalId: 'late', amount: 30000, date: '2026-10-01' }),
      ],
    });
    const c = comp(financialHealth(data, TODAY), 'metas');
    expect(c.score).toBe(50);
    expect(c.value).toBe('1 de 2 no ritmo');
    // Reserva: faltam 570.000 em 2 meses => 285.000/mês; média 30.000 / 3 = 10.000.
    expect(c.tip).toBe(
      'Para cumprir o prazo de "Reserva", aporte R$ 2.850,00 por mês (sua média recente é R$ 100,00).',
    );

    const vencida = comp(
      financialHealth(
        healthyData({
          goals: [makeGoal({ name: 'Festa', targetDate: '2026-09-30' })],
          goalContributions: [],
        }),
        TODAY,
      ),
      'metas',
    );
    expect(vencida.score).toBe(0);
    expect(vencida.tip).toContain('O prazo de "Festa" já passou');

    const semPrazo = comp(
      financialHealth(
        healthyData({ goals: [makeGoal({ name: 'Casa', targetDate: null })], goalContributions: [] }),
        TODAY,
      ),
      'metas',
    );
    expect(semPrazo.score).toBe(0);
    expect(semPrazo.tip).toContain('Defina um prazo para "Casa"');
  });

  it('qualidade dos dados conta meses com lançamentos nos 3 completos + o atual', () => {
    const doisMeses = healthyData({
      transactions: [...monthTx('2026-09', HEALTHY_MONTH), ...monthTx('2026-10', { mercado: 1000 })],
    });
    expect(financialHealth(doisMeses, TODAY).dataQuality).toBe('parcial');

    const antigo = healthyData({ transactions: monthTx('2026-05', HEALTHY_MONTH) });
    expect(financialHealth(antigo, TODAY).dataQuality).toBe('insuficiente');
  });

  it('grade segue os cortes 80/65/50/35', () => {
    // Organizado mas sem reserva e com todos os orçamentos estourados.
    const data = healthyData({
      accounts: [makeAccount({ id: 'cc', initialBalance: -900000 })],
      budgets: [makeBudget({ categoryId: 'cat-lazer', amount: 1000 })],
    });
    const report = financialHealth(data, TODAY);
    expect(comp(report, 'reserva').score).toBe(0);
    expect(comp(report, 'orcamento').score).toBe(0);
    // (2500 + 0 + 2000 + 0 + 1000 + 500) / 100 = 60
    expect(report.score).toBe(60);
    expect(report.grade).toBe('regular');
  });
});
