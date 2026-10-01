import { ChartColumn, Table2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { categoryTrend } from '@/analytics';
import { Card, CardHeader, EmptyState, Field, Money, SegmentedControl, Select } from '@/components/ui';
import { formatMonthLong, formatMonthShort } from '@/domain/dates';
import type { CategoryKind, FinanceData, ID, MonthKey } from '@/domain/types';
import { MonthlyBarChart } from '../../dashboard/charts/MonthlyBarChart';
import { categoryMatrix } from '../report-utils';

const KIND_OPTIONS: { value: CategoryKind; label: string }[] = [
  { value: 'despesa', label: 'Despesas' },
  { value: 'receita', label: 'Receitas' },
];

export interface CategoriesTabProps {
  data: FinanceData;
  months: MonthKey[];
}

/** Tendência mensal da categoria escolhida + tabela categorias x meses com totais e média. */
export function CategoriesTab({ data, months }: CategoriesTabProps) {
  const selectId = useId();
  const [kind, setKind] = useState<CategoryKind>('despesa');
  const [selected, setSelected] = useState<ID | null>(null);
  const endMonth = months[months.length - 1];

  const matrix = useMemo(
    () => categoryMatrix(data.transactions, data.categories, months, kind),
    [data.transactions, data.categories, months, kind],
  );

  /** Categorias do tipo (não arquivadas, mais as arquivadas que tiveram movimento no período). */
  const options = useMemo(() => {
    const used = new Set(matrix.rows.map((r) => r.categoryId));
    return data.categories
      .filter((c) => c.kind === kind && (!c.archived || used.has(c.id)))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [data.categories, kind, matrix.rows]);

  const effectiveId =
    selected && options.some((o) => o.id === selected)
      ? selected
      : (matrix.rows.find((r) => r.categoryId !== null)?.categoryId ?? options[0]?.id ?? null);
  const category = options.find((o) => o.id === effectiveId);

  const trend = useMemo(
    () => (effectiveId ? categoryTrend(data.transactions, effectiveId, endMonth, months.length) : []),
    [data.transactions, effectiveId, endMonth, months.length],
  );
  const trendTotal = trend.reduce((s, m) => s + m.total, 0);
  const peak = trend.reduce<(typeof trend)[number] | null>((best, m) => (best === null || m.total > best.total ? m : best), null);
  const kindLabel = kind === 'despesa' ? 'despesas' : 'receitas';

  return (
    <div className="space-y-4">
      <SegmentedControl options={KIND_OPTIONS} value={kind} onChange={setKind} aria-label="Tipo de categoria" />

      <Card>
        <section aria-labelledby="categories-trend-title">
          <CardHeader
            icon={<ChartColumn size={18} aria-hidden />}
            title={<span id="categories-trend-title">Tendência mensal</span>}
            subtitle={`${formatMonthShort(months[0])} a ${formatMonthShort(endMonth)}`}
          />
          {options.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma categoria de {kindLabel} cadastrada.</p>
          ) : (
            <>
              <Field label="Categoria" htmlFor={selectId} className="max-w-xs">
                <Select id={selectId} value={effectiveId ?? ''} onChange={(e) => setSelected(e.target.value)}>
                  {options.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                      {c.archived ? ' (arquivada)' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Total no período</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white">
                    <Money value={trendTotal} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Média mensal</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white">
                    <Money value={Math.round(trendTotal / Math.max(1, trend.length))} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Maior mês</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white">
                    {peak && peak.total > 0 ? (
                      <>
                        {formatMonthShort(peak.month)} · <Money value={peak.total} />
                      </>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
              </dl>
              {trendTotal === 0 ? (
                <p className="mt-4 rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  Sem lançamentos em {category?.name ?? 'nesta categoria'} no período.
                </p>
              ) : (
                <figure className="mt-4" aria-label={`Total mensal de ${category?.name ?? 'categoria'}`}>
                  <MonthlyBarChart
                    data={trend.map((m) => ({ key: m.month, total: m.total }))}
                    name={category?.name ?? 'Categoria'}
                    color={category?.color}
                  />
                </figure>
              )}
            </>
          )}
        </section>
      </Card>

      <Card>
        <section aria-labelledby="categories-table-title">
          <CardHeader
            icon={<Table2 size={18} aria-hidden />}
            title={<span id="categories-table-title">Categorias x meses</span>}
            subtitle={`Total e média mensal das ${kindLabel} (pagas e pendentes)`}
          />
          {matrix.rows.length === 0 ? (
            <EmptyState title={`Sem ${kindLabel} no período`} description="Escolha um período maior ou registre lançamentos." />
          ) : (
            <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
              <table className="w-full min-w-max text-sm">
                <caption className="sr-only">
                  {`${kind === 'despesa' ? 'Despesas' : 'Receitas'} por categoria de ${formatMonthLong(months[0])} a ${formatMonthLong(endMonth)}`}
                </caption>
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th scope="col" className="sticky left-0 bg-white py-2 pr-3 text-left font-medium dark:bg-slate-900">
                      Categoria
                    </th>
                    {months.map((m) => (
                      <th key={m} scope="col" className="px-2 py-2 text-right font-medium">
                        {formatMonthShort(m)}
                      </th>
                    ))}
                    <th scope="col" className="px-2 py-2 text-right font-semibold text-slate-700 dark:text-slate-200">
                      Total
                    </th>
                    <th scope="col" className="py-2 pl-2 text-right font-medium">
                      Média
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.rows.map((row) => (
                    <tr key={row.categoryId ?? 'sem-categoria'} className="border-b border-slate-100 dark:border-slate-800">
                      <th
                        scope="row"
                        className="sticky left-0 max-w-44 truncate bg-white py-2 pr-3 text-left font-medium text-slate-800 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <span aria-hidden className="mr-1.5 inline-block size-2 rounded-sm" style={{ backgroundColor: row.color }} />
                        {row.icon} {row.name}
                      </th>
                      {row.values.map((v, i) => (
                        <td key={months[i]} className="px-2 py-2 text-right text-slate-600 dark:text-slate-300">
                          {v === 0 ? <span className="text-slate-300 dark:text-slate-600">—</span> : <Money value={v} />}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right font-semibold text-slate-900 dark:text-white">
                        <Money value={row.total} />
                      </td>
                      <td className="py-2 pl-2 text-right text-slate-600 dark:text-slate-300">
                        <Money value={row.average} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="text-slate-900 dark:text-white">
                    <th scope="row" className="sticky left-0 bg-white py-2 pr-3 text-left font-semibold dark:bg-slate-900">
                      Total
                    </th>
                    {matrix.monthTotals.map((v, i) => (
                      <td key={months[i]} className="px-2 py-2 text-right font-semibold">
                        <Money value={v} />
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right font-bold">
                      <Money value={matrix.total} />
                    </td>
                    <td className="py-2 pl-2 text-right font-semibold">
                      <Money value={matrix.average} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      </Card>
    </div>
  );
}
