import { ArrowLeftRight } from 'lucide-react';
import { useMemo } from 'react';
import { compareMonthsByCategory, monthSummary } from '@/analytics';
import { Card, CardHeader, cn, EmptyState, Money, MonthPicker } from '@/components/ui';
import { addMonthsToKey, formatMonthLong, formatMonthShort } from '@/domain/dates';
import { formatPercent } from '@/domain/money';
import { capitalize } from '@/domain/text';
import type { Cents, FinanceData, MonthKey } from '@/domain/types';
import { changeDirection, relativeChange } from '../report-utils';

const ARROW = { up: '↑', down: '↓', same: '=' } as const;
const SR_TEXT = { up: 'Aumento de', down: 'Redução de', same: 'Sem variação' } as const;

/** Variação com seta colorida (cor indica se é bom ou ruim; a seta e o texto oculto indicam a direção). */
function Change({ current, previous, goodWhenUp }: { current: Cents; previous: Cents; goodWhenUp: boolean }) {
  const diff = current - previous;
  const dir = changeDirection(diff);
  const pct = relativeChange(current, previous);
  const good = dir === 'same' ? null : (dir === 'up') === goodWhenUp;
  return (
    <span
      className={cn(
        'inline-flex items-center justify-end gap-1 whitespace-nowrap font-medium',
        good === null
          ? 'text-slate-500 dark:text-slate-400'
          : good
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-rose-600 dark:text-rose-400',
      )}
    >
      <span aria-hidden className="text-base leading-none">
        {ARROW[dir]}
      </span>
      <span className="sr-only">{SR_TEXT[dir]}</span>
      {dir !== 'same' && <Money value={Math.abs(diff)} />}
      {/* Sem opacity: o texto pequeno precisa do contraste cheio da cor (AA). */}
      {pct !== null && dir !== 'same' && <span className="text-xs">({formatPercent(Math.abs(pct))})</span>}
      {pct === null && dir === 'up' && <span className="text-xs">(novo)</span>}
    </span>
  );
}

export interface CompareTabProps {
  data: FinanceData;
  month: MonthKey;
  maxMonth: MonthKey;
  onMonthChange: (month: MonthKey) => void;
}

/** Comparativo das despesas por categoria: mês escolhido x mês anterior. */
export function CompareTab({ data, month, maxMonth, onMonthChange }: CompareTabProps) {
  const previous = addMonthsToKey(month, -1);
  const rows = useMemo(
    () => compareMonthsByCategory(data.transactions, data.categories, month, previous),
    [data.transactions, data.categories, month, previous],
  );
  const cur = useMemo(() => monthSummary(data.transactions, month), [data.transactions, month]);
  const prev = useMemo(() => monthSummary(data.transactions, previous), [data.transactions, previous]);

  const summary: { label: string; current: Cents; previous: Cents; goodWhenUp: boolean }[] = [
    { label: 'Receitas', current: cur.income, previous: prev.income, goodWhenUp: true },
    { label: 'Despesas', current: cur.expense, previous: prev.expense, goodWhenUp: false },
    { label: 'Resultado', current: cur.net, previous: prev.net, goodWhenUp: true },
  ];

  return (
    <div className="space-y-4">
      <MonthPicker value={month} onChange={onMonthChange} max={maxMonth} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {summary.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{s.label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
              <Money value={s.current} />
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
              <span>
                {formatMonthShort(previous)}: <Money value={s.previous} />
              </span>
              <Change current={s.current} previous={s.previous} goodWhenUp={s.goodWhenUp} />
            </p>
          </div>
        ))}
      </div>

      <Card>
        <section aria-labelledby="compare-title">
          <CardHeader
            icon={<ArrowLeftRight size={18} aria-hidden />}
            title={<span id="compare-title">Despesas por categoria</span>}
            subtitle={`${capitalize(formatMonthLong(month))} x ${formatMonthLong(previous)} — maiores variações primeiro`}
          />
          {rows.length === 0 ? (
            <EmptyState
              title="Sem despesas para comparar"
              description={`Não há despesas em ${formatMonthLong(month)} nem em ${formatMonthLong(previous)}.`}
            />
          ) : (
            <div className="relative -mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
              <table className="w-full min-w-max text-sm">
                <caption className="sr-only">
                  {`Comparativo de despesas por categoria entre ${formatMonthLong(previous)} e ${formatMonthLong(month)}`}
                </caption>
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th scope="col" className="py-2 pr-3 text-left font-medium">
                      Categoria
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">
                      {formatMonthShort(previous)}
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">
                      {formatMonthShort(month)}
                    </th>
                    <th scope="col" className="py-2 pl-2 text-right font-medium">
                      Variação
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.categoryId ?? 'sem-categoria'} className="border-b border-slate-100 dark:border-slate-800">
                      <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-800 dark:text-slate-100">
                        {r.icon} {r.name}
                      </th>
                      <td className="px-2 py-2 text-right text-slate-600 dark:text-slate-300">
                        <Money value={r.previous} />
                      </td>
                      <td className="px-2 py-2 text-right text-slate-900 dark:text-white">
                        <Money value={r.current} />
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <Change current={r.current} previous={r.previous} goodWhenUp={false} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold text-slate-900 dark:text-white">
                    <th scope="row" className="py-2 pr-3 text-left">
                      Total
                    </th>
                    <td className="px-2 py-2 text-right">
                      <Money value={prev.expense} />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Money value={cur.expense} />
                    </td>
                    <td className="py-2 pl-2 text-right">
                      <Change current={cur.expense} previous={prev.expense} goodWhenUp={false} />
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
