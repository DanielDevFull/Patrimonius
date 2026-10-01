import { describe, expect, it } from 'vitest';
import { buildDefaultCategories } from '@/domain/defaults';
import { TEST_NOW, makeBudget, makeTransaction } from '@/test/factories';
import { budgetOverview, budgetStatuses, resolveBudget, suggestBudgets } from './budgets';

const acc = 'chk';
const categories = buildDefaultCategories(TEST_NOW).map((c) =>
  c.id === 'cat-pets' ? { ...c, archived: true } : c,
);

describe('resolveBudget', () => {
  const marketDefault = makeBudget({ categoryId: 'cat-mercado', amount: 100000, month: null });
  const marketOct = makeBudget({ categoryId: 'cat-mercado', amount: 60000, month: '2026-10' });
  const leisureDefault = makeBudget({ categoryId: 'cat-lazer', amount: 20000, month: null });
  const healthSep = makeBudget({ categoryId: 'cat-saude', amount: 5000, month: '2026-09' });
  const budgets = [marketDefault, marketOct, leisureDefault, healthSep];

  it('prioriza o orçamento específico do mês sobre o padrão', () => {
    expect(resolveBudget(budgets, 'cat-mercado', '2026-10')).toBe(marketOct);
    expect(resolveBudget([marketOct, marketDefault], 'cat-mercado', '2026-10')).toBe(marketOct);
  });

  it('usa o padrão quando não há específico e null quando não há nenhum', () => {
    expect(resolveBudget(budgets, 'cat-mercado', '2026-11')).toBe(marketDefault);
    expect(resolveBudget(budgets, 'cat-lazer', '2026-10')).toBe(leisureDefault);
    expect(resolveBudget(budgets, 'cat-saude', '2026-10')).toBeNull();
    expect(resolveBudget(budgets, 'cat-saude', '2026-09')).toBe(healthSep);
    expect(resolveBudget([], 'cat-mercado', '2026-10')).toBeNull();
  });

  it('em duplicidade, vence o atualizado mais recentemente', () => {
    const older = makeBudget({
      categoryId: 'cat-lazer',
      amount: 1,
      month: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const newer = makeBudget({
      categoryId: 'cat-lazer',
      amount: 2,
      month: null,
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
    expect(resolveBudget([newer, older], 'cat-lazer', '2026-10')).toBe(newer);
    expect(resolveBudget([older, newer], 'cat-lazer', '2026-10')).toBe(newer);
  });
});

describe('budgetStatuses', () => {
  const today = '2026-10-10';
  const budgets = [
    makeBudget({ categoryId: 'cat-mercado', amount: 100000, month: null }),
    makeBudget({ id: 'bud-market-oct', categoryId: 'cat-mercado', amount: 60000, month: '2026-10' }),
    makeBudget({ categoryId: 'cat-lazer', amount: 20000, month: null }),
    makeBudget({ categoryId: 'cat-alimentacao-fora', amount: 50000, month: null }),
    // ignorados: categoria de receita, categoria arquivada, orçamento de outro mês
    makeBudget({ categoryId: 'cat-salario', amount: 1000, month: null }),
    makeBudget({ categoryId: 'cat-pets', amount: 10000, month: null }),
    makeBudget({ categoryId: 'cat-saude', amount: 5000, month: '2026-09' }),
  ];
  const transactions = [
    makeTransaction({ accountId: acc, amount: 30000, date: '2026-10-03', categoryId: 'cat-mercado' }),
    makeTransaction({
      accountId: acc,
      amount: 10000,
      date: '2026-10-08',
      categoryId: 'cat-mercado',
      status: 'pendente',
    }),
    makeTransaction({ accountId: acc, amount: 25000, date: '2026-10-02', categoryId: 'cat-lazer' }),
    makeTransaction({ accountId: acc, amount: 5000, date: '2026-10-09', categoryId: 'cat-alimentacao-fora' }),
    makeTransaction({ accountId: acc, amount: 3000, date: '2026-10-09', categoryId: 'cat-pets' }),
    makeTransaction({ accountId: acc, amount: 99999, date: '2026-09-30', categoryId: 'cat-mercado' }),
    makeTransaction({
      accountId: acc,
      type: 'receita',
      amount: 7777,
      date: '2026-10-05',
      categoryId: 'cat-mercado',
    }),
  ];

  it('inclui só categorias de despesa não arquivadas com orçamento vigente, ordenadas por percentual', () => {
    const statuses = budgetStatuses(budgets, transactions, categories, '2026-10', today);
    expect(statuses.map((s) => s.categoryId)).toEqual(['cat-lazer', 'cat-mercado', 'cat-alimentacao-fora']);
  });

  it('calcula gasto (pagos + pendentes), restante, percentual e situação', () => {
    const statuses = budgetStatuses(budgets, transactions, categories, '2026-10', today);
    const market = statuses.find((s) => s.categoryId === 'cat-mercado');
    expect(market).toMatchObject({
      budgetId: 'bud-market-oct',
      isDefault: false,
      budgeted: 60000,
      spent: 40000,
      remaining: 20000,
      // ritmo: 40000 / 10 dias * 31 dias
      projected: 124000,
      status: 'alerta',
      categoryName: 'Mercado',
    });
    expect(market?.percent).toBeCloseTo(2 / 3, 10);

    const leisure = statuses.find((s) => s.categoryId === 'cat-lazer');
    expect(leisure).toMatchObject({ isDefault: true, spent: 25000, remaining: -5000, status: 'estourado' });
    expect(leisure?.percent).toBeCloseTo(1.25, 10);

    const restaurants = statuses.find((s) => s.categoryId === 'cat-alimentacao-fora');
    expect(restaurants).toMatchObject({ spent: 5000, projected: 15500, status: 'ok' });
  });

  it('meses passados e futuros projetam o próprio gasto; alerta a partir de 80%', () => {
    const budget = [makeBudget({ categoryId: 'cat-mercado', amount: 10000, month: null })];
    const at = (amount: number, date: string) =>
      makeTransaction({ accountId: acc, amount, date, categoryId: 'cat-mercado' });
    const past = budgetStatuses(budget, [at(8000, '2026-09-01')], categories, '2026-09', today)[0];
    expect(past).toMatchObject({ spent: 8000, projected: 8000, status: 'alerta' });
    const pastOk = budgetStatuses(budget, [at(7999, '2026-09-01')], categories, '2026-09', today)[0];
    expect(pastOk).toMatchObject({ projected: 7999, status: 'ok' });
    const future = budgetStatuses(budget, [at(3000, '2026-11-20')], categories, '2026-11', today)[0];
    expect(future).toMatchObject({ spent: 3000, projected: 3000, status: 'ok' });
  });

  it('projeção pelo ritmo diário usa o dia de today como dias decorridos', () => {
    const budget = [makeBudget({ categoryId: 'cat-mercado', amount: 40000, month: null })];
    const tx = makeTransaction({
      accountId: acc,
      amount: 1000,
      date: '2026-10-01',
      categoryId: 'cat-mercado',
    });
    expect(budgetStatuses(budget, [tx], categories, '2026-10', '2026-10-01')[0].projected).toBe(31000);
    expect(budgetStatuses(budget, [tx], categories, '2026-10', '2026-10-31')[0].projected).toBe(1000);
    // fevereiro de ano bissexto: 29 dias
    const feb = makeTransaction({
      accountId: acc,
      amount: 1000,
      date: '2028-02-02',
      categoryId: 'cat-mercado',
    });
    expect(budgetStatuses(budget, [feb], categories, '2028-02', '2028-02-02')[0].projected).toBe(14500);
  });

  it('não extrapola recorrências, parcelas nem lançamentos agendados para depois de hoje', () => {
    const budget = [makeBudget({ categoryId: 'cat-assinaturas', amount: 10000, month: null })];
    const txs = [
      makeTransaction({ accountId: acc, amount: 1000, date: '2026-10-05', categoryId: 'cat-assinaturas' }),
      makeTransaction({
        accountId: acc,
        amount: 3000,
        date: '2026-10-01',
        categoryId: 'cat-assinaturas',
        recurringId: 'rec-x',
      }),
      makeTransaction({
        accountId: acc,
        amount: 2000,
        date: '2026-10-25',
        categoryId: 'cat-assinaturas',
        status: 'pendente',
      }),
    ];
    const [status] = budgetStatuses(budget, txs, categories, '2026-10', today);
    // round(1000 / 10 * 31) + 3000 + 2000
    expect(status).toMatchObject({ spent: 6000, projected: 8100, status: 'ok' });
  });

  it('trata orçamento zero: sem gasto = ok (0%), com gasto = estourado (Infinity)', () => {
    const budget = [
      makeBudget({ categoryId: 'cat-cuidados', amount: 0, month: null }),
      makeBudget({ categoryId: 'cat-doacoes', amount: 0, month: null }),
    ];
    const txs = [
      makeTransaction({ accountId: acc, amount: 500, date: '2026-10-02', categoryId: 'cat-doacoes' }),
    ];
    const statuses = budgetStatuses(budget, txs, categories, '2026-10', today);
    expect(statuses.map((s) => s.categoryId)).toEqual(['cat-doacoes', 'cat-cuidados']);
    expect(statuses[0]).toMatchObject({ percent: Infinity, status: 'estourado', remaining: -500 });
    expect(statuses[1]).toMatchObject({ percent: 0, status: 'ok', projected: 0 });
  });
});

describe('budgetOverview', () => {
  const today = '2026-10-10';

  it('consolida totais e soma o gasto fora dos orçamentos', () => {
    const budgets = [
      makeBudget({ categoryId: 'cat-mercado', amount: 60000, month: null }),
      makeBudget({ categoryId: 'cat-lazer', amount: 20000, month: null }),
      makeBudget({ categoryId: 'cat-pets', amount: 10000, month: null }),
    ];
    const txs = [
      makeTransaction({ accountId: acc, amount: 40000, date: '2026-10-03', categoryId: 'cat-mercado' }),
      makeTransaction({ accountId: acc, amount: 25000, date: '2026-10-02', categoryId: 'cat-lazer' }),
      makeTransaction({ accountId: acc, amount: 150000, date: '2026-10-01', categoryId: 'cat-moradia' }),
      makeTransaction({ accountId: acc, amount: 1000, date: '2026-10-04', categoryId: null }),
      // categoria arquivada (orçamento ignorado) conta como fora do orçamento
      makeTransaction({
        accountId: acc,
        amount: 3000,
        date: '2026-10-04',
        categoryId: 'cat-pets',
        status: 'pendente',
      }),
      makeTransaction({ accountId: acc, amount: 88888, date: '2026-11-01', categoryId: 'cat-moradia' }),
      makeTransaction({
        accountId: acc,
        type: 'receita',
        amount: 500000,
        date: '2026-10-05',
        categoryId: 'cat-salario',
      }),
    ];
    const overview = budgetOverview(budgets, txs, categories, '2026-10', today);
    expect(overview).toMatchObject({
      month: '2026-10',
      totalBudgeted: 80000,
      totalSpent: 65000,
      totalRemaining: 15000,
      unbudgetedSpent: 154000,
    });
    expect(overview.percent).toBeCloseTo(65000 / 80000, 10);
    expect(overview.items.map((i) => i.categoryId)).toEqual(['cat-lazer', 'cat-mercado']);
  });

  it('sem orçamentos: percent 0 e tudo é gasto fora do orçamento', () => {
    const txs = [makeTransaction({ accountId: acc, amount: 1234, date: '2026-10-03' })];
    const overview = budgetOverview([], txs, categories, '2026-10', today);
    expect(overview).toMatchObject({
      totalBudgeted: 0,
      totalSpent: 0,
      percent: 0,
      items: [],
      unbudgetedSpent: 1234,
    });
  });
});

describe('suggestBudgets', () => {
  const tx = (amount: number, date: string, categoryId: string, type: 'despesa' | 'receita' = 'despesa') =>
    makeTransaction({ accountId: acc, amount, date, categoryId, type });
  const history = [
    tx(40000, '2026-07-05', 'cat-mercado'),
    tx(5000, '2026-07-06', 'cat-lazer'),
    tx(35000, '2026-08-05', 'cat-mercado'),
    tx(500000, '2026-08-05', 'cat-salario', 'receita'),
    tx(45003, '2026-09-05', 'cat-mercado'),
    tx(3000, '2026-09-05', 'cat-pets'), // arquivada
    tx(999999, '2026-10-01', 'cat-mercado'), // mês de referência: fora
    tx(99999, '2026-06-30', 'cat-lazer'), // antes da janela
  ];

  it('usa por padrão os 3 meses anteriores e arredonda para cima em múltiplos de R$ 10', () => {
    const suggestions = suggestBudgets(history, categories, '2026-10');
    expect(suggestions).toEqual([
      // (40000 + 35000 + 45003) / 3 = 40001
      { categoryId: 'cat-mercado', average: 40001, suggested: 41000, monthsWithData: 3 },
      // 5000 / 3 = 1666,67 -> 1667
      { categoryId: 'cat-lazer', average: 1667, suggested: 2000, monthsWithData: 1 },
    ]);
  });

  it('respeita a quantidade de meses e mantém múltiplos exatos', () => {
    expect(suggestBudgets(history, categories, '2026-10', 1)).toEqual([
      { categoryId: 'cat-mercado', average: 45003, suggested: 46000, monthsWithData: 1 },
    ]);
    const exact = [tx(12000, '2026-09-01', 'cat-mercado')];
    expect(suggestBudgets(exact, categories, '2026-10')[0]).toMatchObject({
      average: 12000,
      suggested: 12000,
    });
  });

  it('retorna vazio sem histórico', () => {
    expect(suggestBudgets(history, categories, '2026-06')).toEqual([]);
    expect(suggestBudgets([], categories, '2026-10')).toEqual([]);
  });
});
