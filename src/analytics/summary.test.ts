import { describe, expect, it } from 'vitest';
import { buildDefaultCategories } from '@/domain/defaults';
import type { Category } from '@/domain/types';
import { TEST_NOW, makeTransaction } from '@/test/factories';
import {
  averageMonthlyExpense,
  averageMonthlyIncome,
  categoryBreakdown,
  categoryTrend,
  compareMonthsByCategory,
  groupBreakdown,
  monthSummary,
  monthlySeries,
  topExpenses,
} from './summary';

const categories = buildDefaultCategories(TEST_NOW);
const acc = 'chk';

const october = [
  makeTransaction({
    accountId: acc,
    type: 'receita',
    amount: 500000,
    date: '2026-10-05',
    categoryId: 'cat-salario',
  }),
  makeTransaction({
    accountId: acc,
    type: 'receita',
    amount: 100000,
    date: '2026-10-28',
    categoryId: 'cat-freelance',
    status: 'pendente',
  }),
  makeTransaction({
    accountId: acc,
    type: 'despesa',
    amount: 200000,
    date: '2026-10-01',
    categoryId: 'cat-moradia',
  }),
  makeTransaction({
    accountId: acc,
    type: 'despesa',
    amount: 50000,
    date: '2026-10-10',
    categoryId: 'cat-investimentos',
  }),
  makeTransaction({
    accountId: acc,
    type: 'despesa',
    amount: 30000,
    date: '2026-10-31',
    categoryId: 'cat-mercado',
    status: 'pendente',
  }),
  makeTransaction({
    accountId: acc,
    type: 'transferencia',
    amount: 70000,
    date: '2026-10-12',
    categoryId: null,
    toAccountId: 'sav',
  }),
];
const neighbors = [
  makeTransaction({
    accountId: acc,
    type: 'despesa',
    amount: 99999,
    date: '2026-09-30',
    categoryId: 'cat-mercado',
  }),
  makeTransaction({
    accountId: acc,
    type: 'receita',
    amount: 77777,
    date: '2026-11-01',
    categoryId: 'cat-salario',
  }),
];

describe('monthSummary', () => {
  it('soma receitas, despesas, investimento e taxa de poupança (pendentes inclusos por padrão)', () => {
    const s = monthSummary([...october, ...neighbors], '2026-10');
    expect(s).toMatchObject({
      month: '2026-10',
      income: 600000,
      expense: 280000,
      net: 320000,
      invested: 50000,
      paidIncome: 500000,
      pendingIncome: 100000,
      paidExpense: 250000,
      pendingExpense: 30000,
      transactionCount: 5,
    });
    expect(s.savingsRate).toBeCloseTo(370000 / 600000, 10);
  });

  it('com includePending=false ignora pendentes por completo', () => {
    const s = monthSummary(october, '2026-10', { includePending: false });
    expect(s).toMatchObject({
      income: 500000,
      expense: 250000,
      net: 250000,
      pendingIncome: 0,
      pendingExpense: 0,
    });
    expect(s.transactionCount).toBe(3);
    expect(s.savingsRate).toBeCloseTo(0.6, 10);
  });

  it('savingsRate é null sem receitas e o mês vazio é todo zero', () => {
    const onlyExpense = [makeTransaction({ accountId: acc, amount: 1000, date: '2026-10-02' })];
    expect(monthSummary(onlyExpense, '2026-10').savingsRate).toBeNull();
    expect(monthSummary(onlyExpense, '2026-10').net).toBe(-1000);
    const empty = monthSummary([], '2026-10');
    expect(empty).toMatchObject({ income: 0, expense: 0, net: 0, invested: 0, transactionCount: 0 });
    expect(empty.savingsRate).toBeNull();
  });

  it('transferências nunca entram', () => {
    const onlyTransfer = october.filter((t) => t.type === 'transferencia');
    expect(monthSummary(onlyTransfer, '2026-10')).toMatchObject({
      income: 0,
      expense: 0,
      transactionCount: 0,
    });
  });
});

describe('monthlySeries', () => {
  it('gera meses cronológicos atravessando a virada de ano, iguais ao monthSummary', () => {
    const txs = [
      makeTransaction({ accountId: acc, amount: 1000, date: '2026-11-15' }),
      makeTransaction({ accountId: acc, amount: 2000, date: '2026-12-31' }),
      makeTransaction({
        accountId: acc,
        type: 'receita',
        amount: 9000,
        date: '2027-01-01',
        categoryId: 'cat-salario',
      }),
      makeTransaction({ accountId: acc, amount: 4000, date: '2027-02-01' }),
    ];
    const series = monthlySeries(txs, '2027-01', 3);
    expect(series.map((s) => s.month)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(series.map((s) => s.expense)).toEqual([1000, 2000, 0]);
    expect(series[2].income).toBe(9000);
    for (const s of series) expect(s).toEqual(monthSummary(txs, s.month));
  });

  it('respeita includePending e retorna vazio para count <= 0', () => {
    const series = monthlySeries(october, '2026-10', 2, { includePending: false });
    expect(series[0]).toMatchObject({ month: '2026-09', income: 0, expense: 0 });
    expect(series[1]).toMatchObject({ income: 500000, expense: 250000 });
    expect(monthlySeries(october, '2026-10', 0)).toEqual([]);
  });
});

describe('categoryBreakdown', () => {
  const txs = [
    makeTransaction({ accountId: acc, amount: 30000, date: '2026-10-02', categoryId: 'cat-mercado' }),
    makeTransaction({
      accountId: acc,
      amount: 10000,
      date: '2026-10-03',
      categoryId: 'cat-mercado',
      status: 'pendente',
    }),
    makeTransaction({ accountId: acc, amount: 50000, date: '2026-10-04', categoryId: 'cat-moradia' }),
    makeTransaction({ accountId: acc, amount: 5000, date: '2026-10-05', categoryId: null }),
    makeTransaction({ accountId: acc, amount: 5000, date: '2026-10-06', categoryId: 'cat-apagada' }),
    makeTransaction({
      accountId: acc,
      type: 'receita',
      amount: 900000,
      date: '2026-10-05',
      categoryId: 'cat-salario',
    }),
    makeTransaction({ accountId: acc, amount: 77700, date: '2026-09-30', categoryId: 'cat-mercado' }),
  ];

  it('agrupa por categoria, ordena por total e junta inexistentes em "Sem categoria"', () => {
    const rows = categoryBreakdown(txs, categories, '2026-10', 'despesa');
    expect(rows.map((r) => [r.categoryId, r.total, r.count])).toEqual([
      ['cat-moradia', 50000, 1],
      ['cat-mercado', 40000, 2],
      [null, 10000, 2],
    ]);
    expect(rows[2]).toMatchObject({ name: 'Sem categoria' });
    expect(rows[1]).toMatchObject({ name: 'Mercado', icon: '🛒', color: '#22c55e' });
    expect(rows[0].share).toBeCloseTo(0.5, 10);
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 10);
  });

  it('filtra pelo tipo e pelo status', () => {
    expect(categoryBreakdown(txs, categories, '2026-10', 'receita').map((r) => r.categoryId)).toEqual([
      'cat-salario',
    ]);
    const paidOnly = categoryBreakdown(txs, categories, '2026-10', 'despesa', { includePending: false });
    expect(paidOnly.find((r) => r.categoryId === 'cat-mercado')?.total).toBe(30000);
    expect(categoryBreakdown([], categories, '2026-10', 'despesa')).toEqual([]);
  });
});

describe('categoryTrend', () => {
  it('preenche meses sem gasto com zero e atravessa o ano', () => {
    const txs = [
      makeTransaction({ accountId: acc, amount: 1500, date: '2026-12-10', categoryId: 'cat-lazer' }),
      makeTransaction({
        accountId: acc,
        amount: 500,
        date: '2026-12-11',
        categoryId: 'cat-lazer',
        status: 'pendente',
      }),
      makeTransaction({ accountId: acc, amount: 900, date: '2027-02-01', categoryId: 'cat-lazer' }),
      makeTransaction({ accountId: acc, amount: 4000, date: '2027-02-01', categoryId: 'cat-mercado' }),
    ];
    expect(categoryTrend(txs, 'cat-lazer', '2027-02', 4)).toEqual([
      { month: '2026-11', total: 0 },
      { month: '2026-12', total: 2000 },
      { month: '2027-01', total: 0 },
      { month: '2027-02', total: 900 },
    ]);
  });
});

describe('averageMonthlyExpense / averageMonthlyIncome', () => {
  const history = [
    makeTransaction({ accountId: acc, amount: 30000, date: '2026-09-10', categoryId: 'cat-mercado' }),
    makeTransaction({ accountId: acc, amount: 10000, date: '2026-09-20', categoryId: 'cat-lazer' }),
    makeTransaction({
      accountId: acc,
      type: 'receita',
      amount: 100000,
      date: '2026-08-05',
      categoryId: 'cat-salario',
    }),
    // fora da janela (antes) e mês de referência (excluído)
    makeTransaction({ accountId: acc, amount: 999999, date: '2026-06-30', categoryId: 'cat-mercado' }),
    makeTransaction({ accountId: acc, amount: 888888, date: '2026-10-01', categoryId: 'cat-mercado' }),
    // transferência em julho não torna o mês "com dados"
    makeTransaction({
      accountId: acc,
      type: 'transferencia',
      amount: 5000,
      date: '2026-07-01',
      categoryId: null,
      toAccountId: 'sav',
    }),
  ];

  it('ignora meses sem lançamentos e o próprio mês de referência', () => {
    // setembro (40000) e agosto (só receita => 0) => 20000
    expect(averageMonthlyExpense(history, '2026-10', 3)).toBe(20000);
    expect(averageMonthlyIncome(history, '2026-10', 3)).toBe(50000);
  });

  it('filtra por categorias mantendo os meses com dados no denominador', () => {
    expect(averageMonthlyExpense(history, '2026-10', 3, ['cat-mercado'])).toBe(15000);
    expect(averageMonthlyExpense(history, '2026-10', 3, ['cat-saude'])).toBe(0);
  });

  it('retorna 0 sem histórico e arredonda ao centavo', () => {
    expect(averageMonthlyExpense(history, '2026-05', 3)).toBe(0);
    expect(averageMonthlyExpense([], '2026-10', 3)).toBe(0);
    const thirds = ['2026-07-01', '2026-08-01', '2026-09-01'].map((date, i) =>
      makeTransaction({ accountId: acc, amount: i === 0 ? 10000 : 1, date }),
    );
    // (10000 + 1 + 1) / 3 = 3334
    expect(averageMonthlyExpense(thirds, '2026-10', 3)).toBe(3334);
  });

  it('atravessa a virada de ano', () => {
    const txs = [makeTransaction({ accountId: acc, amount: 6000, date: '2026-12-15' })];
    expect(averageMonthlyExpense(txs, '2027-01', 1)).toBe(6000);
    expect(averageMonthlyExpense(txs, '2027-02', 1)).toBe(0);
  });
});

describe('groupBreakdown', () => {
  it('distribui despesas nos grupos 50/30/20 e calcula ideal arredondado', () => {
    const custom: Category = { ...categories[0], id: 'cat-custom', name: 'Sem grupo', group: null };
    const txs = [
      makeTransaction({
        accountId: acc,
        type: 'receita',
        amount: 100001,
        date: '2026-10-05',
        categoryId: 'cat-salario',
      }),
      makeTransaction({ accountId: acc, amount: 40000, date: '2026-10-06', categoryId: 'cat-moradia' }),
      makeTransaction({
        accountId: acc,
        amount: 20000,
        date: '2026-10-06',
        categoryId: 'cat-lazer',
        status: 'pendente',
      }),
      makeTransaction({ accountId: acc, amount: 10000, date: '2026-10-07', categoryId: 'cat-investimentos' }),
      makeTransaction({ accountId: acc, amount: 5000, date: '2026-10-07', categoryId: 'cat-dividas' }),
      makeTransaction({ accountId: acc, amount: 3000, date: '2026-10-08', categoryId: 'cat-inexistente' }),
      makeTransaction({ accountId: acc, amount: 2000, date: '2026-10-08', categoryId: 'cat-custom' }),
      makeTransaction({ accountId: acc, amount: 1000, date: '2026-11-01', categoryId: 'cat-moradia' }),
    ];
    const g = groupBreakdown(txs, [...categories, custom], '2026-10');
    expect(g).toMatchObject({
      income: 100001,
      necessidades: 40000,
      desejos: 20000,
      objetivos: 15000,
      semGrupo: 5000,
    });
    expect(g.ideal).toEqual({ necessidades: 50001, desejos: 30000, objetivos: 20000 });
    expect(g.shares.necessidades).toBeCloseTo(40000 / 100001, 10);
  });

  it('shares são null sem renda', () => {
    const g = groupBreakdown(
      [makeTransaction({ accountId: acc, amount: 1000, date: '2026-10-01', categoryId: 'cat-moradia' })],
      categories,
      '2026-10',
    );
    expect(g.shares).toEqual({ necessidades: null, desejos: null, objetivos: null });
    expect(g.ideal).toEqual({ necessidades: 0, desejos: 0, objetivos: 0 });
  });
});

describe('topExpenses', () => {
  it('ordena por valor desc, depois data desc, limitado e só do mês', () => {
    const a = makeTransaction({ accountId: acc, amount: 5000, date: '2026-10-02', description: 'A' });
    const b = makeTransaction({ accountId: acc, amount: 5000, date: '2026-10-20', description: 'B' });
    const c = makeTransaction({ accountId: acc, amount: 90000, date: '2026-10-05', description: 'C' });
    const d = makeTransaction({ accountId: acc, amount: 100, date: '2026-10-06', description: 'D' });
    const income = makeTransaction({ accountId: acc, type: 'receita', amount: 999999, date: '2026-10-01' });
    const other = makeTransaction({ accountId: acc, amount: 999999, date: '2026-11-01' });
    const txs = [a, b, c, d, income, other];
    expect(topExpenses(txs, '2026-10', 3).map((t) => t.description)).toEqual(['C', 'B', 'A']);
    expect(topExpenses(txs, '2026-10', 10)).toHaveLength(4);
    expect(topExpenses(txs, '2026-10', 0)).toEqual([]);
  });
});

describe('compareMonthsByCategory', () => {
  it('calcula diferença atual - anterior e ordena por |diff|', () => {
    const txs = [
      makeTransaction({ accountId: acc, amount: 50000, date: '2026-10-03', categoryId: 'cat-mercado' }),
      makeTransaction({ accountId: acc, amount: 10000, date: '2026-10-03', categoryId: 'cat-lazer' }),
      makeTransaction({ accountId: acc, amount: 30000, date: '2026-09-03', categoryId: 'cat-mercado' }),
      makeTransaction({ accountId: acc, amount: 40000, date: '2026-09-03', categoryId: 'cat-lazer' }),
      makeTransaction({ accountId: acc, amount: 5000, date: '2026-09-03', categoryId: 'cat-saude' }),
      makeTransaction({
        accountId: acc,
        type: 'receita',
        amount: 5000,
        date: '2026-09-03',
        categoryId: 'cat-salario',
      }),
    ];
    const rows = compareMonthsByCategory(txs, categories, '2026-10', '2026-09');
    expect(rows.map((r) => [r.categoryId, r.current, r.previous, r.diff])).toEqual([
      ['cat-lazer', 10000, 40000, -30000],
      ['cat-mercado', 50000, 30000, 20000],
      ['cat-saude', 0, 5000, -5000],
    ]);
    expect(rows[0].name).toBe('Lazer');
  });
});
