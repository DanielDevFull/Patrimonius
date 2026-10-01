import { describe, expect, it } from 'vitest';
import { groupBreakdown, monthlySeries } from '@/analytics';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { Transaction } from '@/domain/types';
import { makeAccount, makeData, makeTransaction } from '@/test/factories';
import {
  cashflowRows,
  cashflowTotals,
  categoryMatrix,
  changeDirection,
  csvFileName,
  parsePeriod,
  periodMonths,
  periodRange,
  periodTransactions,
  relativeChange,
  ruleRows,
  unallocatedIncome,
} from './report-utils';

const acc = makeAccount();
const t = (p: Partial<Omit<Transaction, 'accountId'>>) => makeTransaction({ accountId: acc.id, ...p });

describe('período', () => {
  it('parsePeriod aceita 3/6/12 e cai em 6 para qualquer outra coisa', () => {
    expect(parsePeriod('3')).toBe(3);
    expect(parsePeriod('6')).toBe(6);
    expect(parsePeriod('12')).toBe(12);
    expect(parsePeriod(null)).toBe(6);
    expect(parsePeriod('24')).toBe(6);
    expect(parsePeriod('abc')).toBe(6);
  });

  it('periodMonths atravessa a virada do ano e periodRange vai do 1º ao último dia', () => {
    const months = periodMonths('2026-02', 3);
    expect(months).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(periodRange(months)).toEqual({ start: '2025-12-01', end: '2026-02-28' });
    expect(periodMonths('2026-10', 0)).toEqual(['2026-10']);
  });

  it('periodTransactions inclui as bordas e todos os tipos/status, e exclui o que está fora', () => {
    const inside = [
      t({ date: '2025-12-01' }),
      t({ date: '2026-02-28', status: 'pendente' }),
      t({ date: '2026-01-15', type: 'transferencia', categoryId: null, toAccountId: 'acc-x' }),
    ];
    const outside = [t({ date: '2025-11-30' }), t({ date: '2026-03-01' })];
    const months = periodMonths('2026-02', 3);
    expect(periodTransactions([...outside, ...inside], months).map((x) => x.id).sort()).toEqual(
      inside.map((x) => x.id).sort(),
    );
    expect(periodTransactions(inside, [])).toEqual([]);
  });

  it('csvFileName descreve o período', () => {
    expect(csvFileName(['2026-05', '2026-06', '2026-07'])).toBe('patrimonius-lancamentos-2026-05-a-2026-07.csv');
    expect(csvFileName(['2026-10'])).toBe('patrimonius-lancamentos-2026-10.csv');
  });
});

describe('categoryMatrix', () => {
  const { categories } = makeData();
  const months = ['2026-08', '2026-09', '2026-10'];
  const transactions = [
    t({ date: '2026-08-03', amount: 30000, categoryId: CATEGORY_IDS.mercado }),
    t({ date: '2026-10-03', amount: 40000, categoryId: CATEGORY_IDS.mercado, status: 'pendente' }),
    t({ date: '2026-09-10', amount: 1000, categoryId: CATEGORY_IDS.lazer }),
    t({ date: '2026-09-11', amount: 500, categoryId: null }),
    t({ date: '2026-09-12', amount: 500, categoryId: 'cat-removida' }),
    // Não entram nas despesas:
    t({ date: '2026-09-05', amount: 900000, type: 'receita', categoryId: CATEGORY_IDS.salario }),
    t({ date: '2026-09-06', amount: 70000, type: 'transferencia', categoryId: null, toAccountId: 'acc-x' }),
    t({ date: '2026-07-31', amount: 99999, categoryId: CATEGORY_IDS.mercado }),
  ];

  it('soma por categoria e mês (pagos + pendentes), com totais, médias e "Sem categoria"', () => {
    const m = categoryMatrix(transactions, categories, months, 'despesa');
    expect(m.months).toEqual(months);
    expect(m.rows.map((r) => [r.name, r.values, r.total, r.average])).toEqual([
      ['Mercado', [30000, 0, 40000], 70000, 23333],
      ['Lazer', [0, 1000, 0], 1000, 333],
      ['Sem categoria', [0, 1000, 0], 1000, 333],
    ]);
    expect(m.rows[2].categoryId).toBeNull();
    expect(m.monthTotals).toEqual([30000, 2000, 40000]);
    expect(m.total).toBe(72000);
    expect(m.average).toBe(24000);
    // Soma das linhas = soma das colunas.
    expect(m.rows.reduce((s, r) => s + r.total, 0)).toBe(m.monthTotals.reduce((s, v) => s + v, 0));
  });

  it('receitas e período sem lançamentos', () => {
    const income = categoryMatrix(transactions, categories, months, 'receita');
    expect(income.rows.map((r) => [r.name, r.values])).toEqual([['Salário', [0, 900000, 0]]]);
    const empty = categoryMatrix(transactions, categories, ['2025-01'], 'despesa');
    expect(empty).toEqual({ months: ['2025-01'], rows: [], monthTotals: [0], total: 0, average: 0 });
  });
});

describe('fluxo de caixa', () => {
  const transactions = [
    t({ date: '2026-08-05', type: 'receita', amount: 500000, categoryId: CATEGORY_IDS.salario }),
    t({ date: '2026-08-10', amount: 300000 }),
    t({ date: '2026-08-11', amount: 50000, categoryId: CATEGORY_IDS.investimentos }),
    t({ date: '2026-09-10', amount: 200000 }), // mês sem receita: resultado negativo
    t({ date: '2026-10-05', type: 'receita', amount: 400000, categoryId: CATEGORY_IDS.salario }),
  ];
  const series = monthlySeries(transactions, '2026-10', 3);

  it('acumula os resultados mensais desde o início do período', () => {
    const rows = cashflowRows(series);
    expect(rows.map((r) => [r.month, r.net, r.accumulated])).toEqual([
      ['2026-08', 150000, 150000],
      ['2026-09', -200000, -50000],
      ['2026-10', 400000, 350000],
    ]);
    expect(rows[1].savingsRate).toBeNull();
    expect(cashflowRows([])).toEqual([]);
  });

  it('totais com taxa de poupança agregada (resultado + investido) ÷ receitas', () => {
    const totals = cashflowTotals(series);
    expect(totals).toEqual({
      income: 900000,
      expense: 550000,
      net: 350000,
      invested: 50000,
      savingsRate: 400000 / 900000,
    });
    expect(cashflowTotals(monthlySeries([], '2026-10', 3)).savingsRate).toBeNull();
  });
});

describe('regra 50/30/20', () => {
  const { categories } = makeData();
  const income = t({ date: '2026-10-05', type: 'receita', amount: 1000000, categoryId: CATEGORY_IDS.salario });

  it('necessidades/desejos são teto e objetivos é piso (limites exatos contam como ok)', () => {
    const b = groupBreakdown(
      [
        income,
        t({ date: '2026-10-06', amount: 500000, categoryId: CATEGORY_IDS.moradia }), // 50% exatos
        t({ date: '2026-10-07', amount: 310000, categoryId: CATEGORY_IDS.lazer }), // 31%
        t({ date: '2026-10-08', amount: 190000, categoryId: CATEGORY_IDS.investimentos }), // 19%
      ],
      categories,
      '2026-10',
    );
    const rows = ruleRows(b);
    expect(rows.map((r) => [r.group, r.status, r.diff])).toEqual([
      ['necessidades', 'ok', 0],
      ['desejos', 'acima', 10000],
      ['objetivos', 'abaixo', -10000],
    ]);
    expect(rows.map((r) => r.idealShare)).toEqual([0.5, 0.3, 0.2]);
    expect(unallocatedIncome(b)).toBe(0);

    const met = ruleRows(
      groupBreakdown([income, t({ date: '2026-10-08', amount: 200000, categoryId: CATEGORY_IDS.dividas })], categories, '2026-10'),
    );
    expect(met[2]).toMatchObject({ group: 'objetivos', status: 'ok', share: 0.2 });
  });

  it('sem renda: participações nulas; renda não alocada considera despesas sem grupo', () => {
    const noIncome = ruleRows(
      groupBreakdown([t({ date: '2026-10-06', amount: 1000, categoryId: CATEGORY_IDS.mercado })], categories, '2026-10'),
    );
    expect(noIncome.map((r) => [r.share, r.ideal, r.status])).toEqual([
      [null, 0, 'acima'],
      [null, 0, 'ok'],
      [null, 0, 'ok'],
    ]);
    const b = groupBreakdown(
      [income, t({ date: '2026-10-06', amount: 100000, categoryId: null }), t({ date: '2026-10-07', amount: 200000 })],
      categories,
      '2026-10',
    );
    expect(b.semGrupo).toBe(100000);
    expect(unallocatedIncome(b)).toBe(700000);
  });
});

describe('comparativo', () => {
  it('direção e variação relativa', () => {
    expect(changeDirection(10)).toBe('up');
    expect(changeDirection(-1)).toBe('down');
    expect(changeDirection(0)).toBe('same');
    expect(relativeChange(150, 100)).toBe(0.5);
    expect(relativeChange(50, 100)).toBe(-0.5);
    expect(relativeChange(100, 0)).toBeNull();
    // Base negativa (ex.: resultado): melhora de -100 para 50 é +150%.
    expect(relativeChange(50, -100)).toBe(1.5);
  });
});
