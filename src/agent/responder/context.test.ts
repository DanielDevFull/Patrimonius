import { describe, expect, it } from 'vitest';
import { categoryBreakdown } from '@/analytics';
import type { Category } from '@/domain/types';
import { makeData, makeTransaction } from '@/test/factories';
import { breakdownFor } from './context';

describe('breakdownFor', () => {
  const base = makeData();
  const categories: Category[] = [
    ...base.categories,
    { ...base.categories[0], id: 'c-acento', name: 'Café' },
    { ...base.categories[0], id: 'c-sem', name: 'cafe' },
  ];
  const data = makeData({
    categories,
    transactions: [
      makeTransaction({ accountId: 'cc', amount: 1000, date: '2026-10-02', categoryId: 'c-acento' }),
      makeTransaction({ accountId: 'cc', amount: 1000, date: '2026-10-03', categoryId: 'c-sem' }),
      makeTransaction({ accountId: 'outra', amount: 9000, date: '2026-10-04', categoryId: 'c-sem' }),
    ],
  });
  const october = { start: '2026-10-01', end: '2026-10-31', label: 'este mês' };
  const names = (rows: { name: string }[]) => rows.map((r) => r.name);

  it('filtrando uma conta, agrega e desempata como categoryBreakdown (@/analytics)', () => {
    const onlyCc = { ...data, transactions: data.transactions.filter((t) => t.accountId === 'cc') };
    expect(breakdownFor(data, october, 'despesa', 'cc')).toEqual(
      categoryBreakdown(onlyCc.transactions, categories, '2026-10', 'despesa'),
    );
    expect(names(breakdownFor(data, october, 'despesa', 'cc'))).toEqual(['Café', 'cafe']);
  });

  it('período fora do calendário usa só os dias pedidos', () => {
    const rows = breakdownFor(data, { start: '2026-10-03', end: '2026-10-04', label: 'dias 3 e 4' }, 'despesa');
    expect(rows.map((r) => [r.categoryId, r.total, r.count])).toEqual([['c-sem', 10000, 2]]);
  });
});
