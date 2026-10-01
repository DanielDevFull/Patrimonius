import { describe, expect, it } from 'vitest';
import { CATEGORY_IDS } from '@/domain/defaults';
import { makeAccount, makeData, makeTransaction } from '@/test/factories';
import {
  activeFilterCount,
  buildLookups,
  compareForList,
  dayLabel,
  EMPTY_FILTERS,
  filteredTotals,
  filterTransactions,
  groupByDay,
} from './filters';

const banco = makeAccount({ name: 'Banco Azul' });
const poupanca = makeAccount({ name: 'Poupança', type: 'poupanca' });
const { categories } = makeData();
const lookups = buildLookups([banco, poupanca], categories);

const cafe = makeTransaction({
  accountId: banco.id,
  description: 'Café da manhã',
  categoryId: CATEGORY_IDS.restaurantes,
  amount: 1500,
  date: '2026-10-10',
});
const salario = makeTransaction({
  accountId: banco.id,
  type: 'receita',
  description: 'Salário',
  categoryId: CATEGORY_IDS.salario,
  amount: 500000,
  date: '2026-10-05',
  status: 'pendente',
});
const transfer = makeTransaction({
  accountId: banco.id,
  toAccountId: poupanca.id,
  type: 'transferencia',
  categoryId: null,
  description: 'Reserva',
  amount: 20000,
  date: '2026-10-10',
});
const mercado = makeTransaction({
  accountId: poupanca.id,
  description: 'Feira',
  notes: 'orgânicos',
  tags: ['Família'],
  categoryId: CATEGORY_IDS.mercado,
  amount: 8000,
  date: '2026-10-05',
});
const outroMes = makeTransaction({ accountId: banco.id, description: 'Café', date: '2026-09-30' });
const all = [cafe, salario, transfer, mercado, outroMes];

describe('filterTransactions', () => {
  it('restringe ao mês', () => {
    expect(filterTransactions(all, '2026-10', EMPTY_FILTERS, lookups)).toHaveLength(4);
    expect(filterTransactions(all, '2026-09', EMPTY_FILTERS, lookups)).toEqual([outroMes]);
  });

  it('busca normalizada (sem acento/caixa), todas as palavras, em descrição, notas, tags, categoria e conta', () => {
    const q = (query: string) => filterTransactions(all, '2026-10', { ...EMPTY_FILTERS, query }, lookups);
    expect(q('CAFE')).toEqual([cafe]);
    expect(q('manha cafe')).toEqual([cafe]);
    expect(q('organicos')).toEqual([mercado]);
    expect(q('familia')).toEqual([mercado]);
    expect(q('restaurantes')).toEqual([cafe]);
    expect(q('poupanca')).toEqual([transfer, mercado]);
    expect(q('cafe feira')).toEqual([]);
  });

  it('filtro de conta pega origem e destino de transferências', () => {
    const r = filterTransactions(all, '2026-10', { ...EMPTY_FILTERS, accountId: poupanca.id }, lookups);
    expect(r).toEqual([transfer, mercado]);
  });

  it('combina tipo, situação e categoria', () => {
    expect(filterTransactions(all, '2026-10', { ...EMPTY_FILTERS, type: 'receita' }, lookups)).toEqual([
      salario,
    ]);
    expect(filterTransactions(all, '2026-10', { ...EMPTY_FILTERS, status: 'pendente' }, lookups)).toEqual([
      salario,
    ]);
    expect(
      filterTransactions(
        all,
        '2026-10',
        { ...EMPTY_FILTERS, categoryId: CATEGORY_IDS.mercado, type: 'despesa' },
        lookups,
      ),
    ).toEqual([mercado]);
    expect(
      filterTransactions(
        all,
        '2026-10',
        { ...EMPTY_FILTERS, categoryId: CATEGORY_IDS.mercado, type: 'receita' },
        lookups,
      ),
    ).toEqual([]);
  });

  it('conta filtros ativos', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, query: '  ' })).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, query: 'x', type: 'despesa', status: 'pago' })).toBe(3);
  });
});

describe('ordenação e agrupamento por dia', () => {
  it('data desc, depois o registrado por último primeiro', () => {
    const a = makeTransaction({
      accountId: banco.id,
      date: '2026-10-10',
      createdAt: '2026-10-10T08:00:00.000Z',
    });
    const b = makeTransaction({
      accountId: banco.id,
      date: '2026-10-10',
      createdAt: '2026-10-10T09:00:00.000Z',
    });
    const c = makeTransaction({
      accountId: banco.id,
      date: '2026-10-11',
      createdAt: '2026-10-01T09:00:00.000Z',
    });
    expect([a, b, c].sort(compareForList)).toEqual([c, b, a]);
  });

  it('subtotal do dia = receitas - despesas, sem transferências', () => {
    const sorted = filterTransactions(all, '2026-10', EMPTY_FILTERS, lookups).sort(compareForList);
    const groups = groupByDay(sorted);
    expect(groups.map((g) => g.date)).toEqual(['2026-10-10', '2026-10-05']);
    expect(groups[0].subtotal).toBe(-1500);
    expect(groups[0].transactions).toHaveLength(2);
    expect(groups[1].subtotal).toBe(500000 - 8000);
    expect(groupByDay([])).toEqual([]);
  });

  it('totais filtrados ignoram transferências', () => {
    expect(filteredTotals([cafe, salario, transfer, mercado])).toEqual({
      income: 500000,
      expense: 9500,
      count: 4,
    });
  });

  it('rótulo do dia é relativo perto de hoje', () => {
    expect(dayLabel('2026-10-15', '2026-10-15')).toBe('Hoje · quinta-feira');
    expect(dayLabel('2026-10-14', '2026-10-15')).toBe('Ontem · quarta-feira');
    expect(dayLabel('2026-10-16', '2026-10-15')).toBe('Amanhã · sexta-feira');
    expect(dayLabel('2026-10-05', '2026-10-15')).toBe('Segunda-feira, 05 out');
  });
});
