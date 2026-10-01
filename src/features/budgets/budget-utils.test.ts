import { describe, expect, it } from 'vitest';
import { budgetOverview, suggestBudgets } from '@/analytics';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { Category, Transaction } from '@/domain/types';
import { makeBudget, makeData, makeTransaction, TEST_NOW } from '@/test/factories';
import {
  buildSuggestionRows,
  categoriesWithoutBudget,
  categorySpent,
  dailyAllowance,
  defaultBudgetOf,
  planBudgetSave,
  ruleAnalysis,
  ruleIncome,
  specificBudgetCount,
  unbudgetedSpending,
} from './budget-utils';

const ACC = 'acc-1';
const tx = (p: Partial<Transaction>) => makeTransaction({ accountId: ACC, ...p });

describe('planBudgetSave', () => {
  const budgets = [
    makeBudget({ id: 'def', categoryId: CATEGORY_IDS.mercado, amount: 80000, month: null }),
    makeBudget({ id: 'out', categoryId: CATEGORY_IDS.mercado, amount: 60000, month: '2026-10' }),
    makeBudget({ id: 'nov', categoryId: CATEGORY_IDS.mercado, amount: 90000, month: '2026-11' }),
    makeBudget({ id: 'lazer', categoryId: CATEGORY_IDS.lazer, amount: 30000, month: '2026-10' }),
  ];

  it('"só este mês" grava um orçamento específico e não remove nada', () => {
    expect(planBudgetSave(budgets, CATEGORY_IDS.mercado, 'mes', '2026-10')).toEqual({
      month: '2026-10',
      removeIds: [],
    });
  });

  it('"todos os meses" grava o padrão e remove só o específico da categoria no mês atual', () => {
    expect(planBudgetSave(budgets, CATEGORY_IDS.mercado, 'padrao', '2026-10')).toEqual({
      month: null,
      removeIds: ['out'],
    });
    // Outro mês sem específico: nada a remover; exceções de outros meses são preservadas.
    expect(planBudgetSave(budgets, CATEGORY_IDS.mercado, 'padrao', '2026-12')).toEqual({
      month: null,
      removeIds: [],
    });
  });
});

describe('defaultBudgetOf / specificBudgetCount', () => {
  it('encontra o padrão mais recente e conta específicos do mês', () => {
    const budgets = [
      makeBudget({ id: 'a', categoryId: CATEGORY_IDS.mercado, amount: 1, month: null, updatedAt: '2026-01-01T00:00:00.000Z' }),
      makeBudget({ id: 'b', categoryId: CATEGORY_IDS.mercado, amount: 2, month: null, updatedAt: '2026-02-01T00:00:00.000Z' }),
      makeBudget({ id: 'c', categoryId: CATEGORY_IDS.mercado, amount: 3, month: '2026-09' }),
      makeBudget({ id: 'd', categoryId: CATEGORY_IDS.lazer, amount: 4, month: '2026-09' }),
    ];
    expect(defaultBudgetOf(budgets, CATEGORY_IDS.mercado)?.id).toBe('b');
    expect(defaultBudgetOf(budgets, CATEGORY_IDS.lazer)).toBeNull();
    expect(specificBudgetCount(budgets, '2026-09')).toBe(2);
    expect(specificBudgetCount(budgets, '2026-10')).toBe(0);
  });
});

describe('categoriesWithoutBudget / unbudgetedSpending', () => {
  it('lista despesas ativas sem orçamento e os gastos fora do orçamento (incluindo sem categoria)', () => {
    const base = makeData();
    const categories: Category[] = base.categories.map((c) =>
      c.id === CATEGORY_IDS.pets ? { ...c, archived: true } : c,
    );
    const budgets = [makeBudget({ categoryId: CATEGORY_IDS.mercado, amount: 50000 })];
    const transactions = [
      tx({ categoryId: CATEGORY_IDS.mercado, amount: 10000, date: '2026-10-02' }),
      tx({ categoryId: CATEGORY_IDS.lazer, amount: 7000, date: '2026-10-03' }),
      tx({ categoryId: CATEGORY_IDS.pets, amount: 3000, date: '2026-10-03' }),
      tx({ categoryId: null, amount: 500, date: '2026-10-04' }),
      tx({ categoryId: CATEGORY_IDS.lazer, amount: 9999, date: '2026-09-30' }),
      tx({ type: 'receita', categoryId: CATEGORY_IDS.salario, amount: 500000, date: '2026-10-05' }),
    ];
    const { items, unbudgetedSpent } = budgetOverview(budgets, transactions, categories, '2026-10', '2026-10-15');

    const available = categoriesWithoutBudget(categories, items);
    expect(available.every((c) => c.kind === 'despesa' && !c.archived)).toBe(true);
    expect(available.map((c) => c.id)).not.toContain(CATEGORY_IDS.mercado);
    expect(available.map((c) => c.id)).not.toContain(CATEGORY_IDS.pets);
    // ordem alfabética pt-BR
    const names = available.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'pt-BR')));

    const rows = unbudgetedSpending(transactions, categories, '2026-10', items);
    expect(rows.map((r) => [r.categoryId, r.total, r.canBudget])).toEqual([
      [CATEGORY_IDS.lazer, 7000, true],
      [CATEGORY_IDS.pets, 3000, false], // arquivada: aparece, mas não dá para orçar
      [null, 500, false],
    ]);
    expect(rows.reduce((s, r) => s + r.total, 0)).toBe(unbudgetedSpent);
  });

  it('categorySpent soma pagas e pendentes só da categoria e do mês', () => {
    const transactions = [
      tx({ categoryId: CATEGORY_IDS.mercado, amount: 1000, date: '2026-10-01' }),
      tx({ categoryId: CATEGORY_IDS.mercado, amount: 2000, date: '2026-10-31', status: 'pendente' }),
      tx({ categoryId: CATEGORY_IDS.mercado, amount: 4000, date: '2026-11-01' }),
      tx({ type: 'receita', categoryId: CATEGORY_IDS.mercado, amount: 8000, date: '2026-10-10' }),
    ];
    expect(categorySpent(transactions, CATEGORY_IDS.mercado, '2026-10')).toBe(3000);
  });
});

describe('dailyAllowance', () => {
  it('divide o restante pelos dias que faltam (contando hoje) no mês corrente', () => {
    expect(dailyAllowance(31000, '2026-10', '2026-10-01')).toEqual({ daysLeft: 31, perDay: 1000 });
    expect(dailyAllowance(10001, '2026-10', '2026-10-31')).toEqual({ daysLeft: 1, perDay: 10001 });
    expect(dailyAllowance(1000, '2026-10', '2026-10-29')).toEqual({ daysLeft: 3, perDay: 333 });
  });

  it('é 0 quando já estourou e null fora do mês corrente', () => {
    expect(dailyAllowance(-500, '2026-10', '2026-10-10')).toEqual({ daysLeft: 22, perDay: 0 });
    expect(dailyAllowance(1000, '2026-09', '2026-10-10')).toBeNull();
  });
});

describe('buildSuggestionRows', () => {
  it('junta categoria e orçamento vigente; marca só as categorias sem orçamento', () => {
    const data = makeData();
    const transactions = [
      tx({ categoryId: CATEGORY_IDS.mercado, amount: 61234, date: '2026-09-10' }),
      tx({ categoryId: CATEGORY_IDS.lazer, amount: 20000, date: '2026-09-11' }),
    ];
    const budgets = [makeBudget({ categoryId: CATEGORY_IDS.lazer, amount: 15000, month: '2026-10' })];
    const { items } = budgetOverview(budgets, transactions, data.categories, '2026-10', '2026-10-15');
    const rows = buildSuggestionRows(suggestBudgets(transactions, data.categories, '2026-10'), data.categories, items);
    expect(rows).toEqual([
      expect.objectContaining({
        categoryId: CATEGORY_IDS.mercado,
        name: 'Mercado',
        average: 61234,
        suggested: 62000,
        current: null,
        checked: true,
      }),
      expect.objectContaining({
        categoryId: CATEGORY_IDS.lazer,
        suggested: 20000,
        current: { amount: 15000, isDefault: false },
        checked: false,
      }),
    ]);
  });
});

describe('regra 50/30/20', () => {
  it('usa a média de receitas dos 3 meses anteriores quando existe', () => {
    const data = makeData({ settings: { ...makeData().settings, monthlyIncomeEstimate: 999999 } });
    const transactions = [
      tx({ type: 'receita', categoryId: CATEGORY_IDS.salario, amount: 400000, date: '2026-08-05' }),
      tx({ type: 'receita', categoryId: CATEGORY_IDS.salario, amount: 600000, date: '2026-09-05' }),
      // mês analisado não entra na média
      tx({ type: 'receita', categoryId: CATEGORY_IDS.salario, amount: 10000000, date: '2026-10-05' }),
    ];
    expect(ruleIncome(transactions, data.settings, '2026-10')).toEqual({ income: 500000, source: 'historico' });
  });

  it('cai para a renda estimada e, sem ela, para "nenhuma"', () => {
    const settings = { ...makeData().settings, monthlyIncomeEstimate: 300000 };
    expect(ruleIncome([], settings, '2026-10')).toEqual({ income: 300000, source: 'estimativa' });
    expect(ruleIncome([], { ...settings, monthlyIncomeEstimate: null }, '2026-10')).toEqual({
      income: 0,
      source: 'nenhuma',
    });
    expect(ruleIncome([], { ...settings, monthlyIncomeEstimate: 0 }, '2026-10').source).toBe('nenhuma');
  });

  it('compara a soma dos orçamentos por grupo com o ideal e classifica cada grupo', () => {
    const base = makeData();
    const semGrupo: Category = {
      id: 'cat-sem-grupo',
      name: 'Diversos',
      kind: 'despesa',
      icon: '❓',
      color: '#000000',
      group: null,
      keywords: [],
      archived: false,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    };
    const categories = [...base.categories, semGrupo];
    const settings = { ...base.settings, monthlyIncomeEstimate: 1000000 }; // R$ 10.000
    const budgets = [
      makeBudget({ categoryId: CATEGORY_IDS.moradia, amount: 300000 }),
      makeBudget({ categoryId: CATEGORY_IDS.mercado, amount: 250000 }), // necessidades = 5.500 (> 5.000)
      makeBudget({ categoryId: CATEGORY_IDS.lazer, amount: 100000 }), // desejos = 1.000 (<= 3.000)
      makeBudget({ categoryId: CATEGORY_IDS.investimentos, amount: 150000 }), // objetivos = 1.500 (< 2.000)
      makeBudget({ categoryId: 'cat-sem-grupo', amount: 5000 }),
    ];
    const { items } = budgetOverview(budgets, [], categories, '2026-10', '2026-10-15');
    const result = ruleAnalysis(items, categories, [], settings, '2026-10');
    expect(result.income).toBe(1000000);
    expect(result.source).toBe('estimativa');
    expect(result.lines).toEqual([
      { group: 'necessidades', share: 0.5, ideal: 500000, budgeted: 550000, diff: 50000, ratio: 1.1, verdict: 'acima' },
      { group: 'desejos', share: 0.3, ideal: 300000, budgeted: 100000, diff: -200000, ratio: 1 / 3, verdict: 'dentro' },
      { group: 'objetivos', share: 0.2, ideal: 200000, budgeted: 150000, diff: -50000, ratio: 0.75, verdict: 'abaixo' },
    ]);
    expect(result.ungrouped).toBe(5000);
    expect(result.totalBudgeted).toBe(805000);
    expect(result.unallocated).toBe(195000);
  });

  it('grupos sem orçamento ficam "vazio" e objetivos no ideal ficam "dentro"; renda 0 => ratio null', () => {
    const data = makeData();
    const budgets = [makeBudget({ categoryId: CATEGORY_IDS.dividas, amount: 200000 })];
    const { items } = budgetOverview(budgets, [], data.categories, '2026-10', '2026-10-15');
    const settings = { ...data.settings, monthlyIncomeEstimate: 1000000 };
    const lines = ruleAnalysis(items, data.categories, [], settings, '2026-10').lines;
    expect(lines.map((l) => l.verdict)).toEqual(['vazio', 'vazio', 'dentro']);

    const none = ruleAnalysis(items, data.categories, [], data.settings, '2026-10');
    expect(none.source).toBe('nenhuma');
    expect(none.lines.every((l) => l.ideal === 0 && l.ratio === null)).toBe(true);
    expect(none.unallocated).toBe(-200000);
  });
});
