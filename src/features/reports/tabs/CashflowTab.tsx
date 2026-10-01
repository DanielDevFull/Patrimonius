import { ChartColumn, Table2 } from 'lucide-react';
import { useMemo } from 'react';
import { monthlySeries, savingsTargetPct } from '@/analytics';
import { Card, CardHeader, cn, Money, StatCard } from '@/components/ui';
import { formatMonthShort } from '@/domain/dates';
import { formatPercent } from '@/domain/money';
import type { FinanceData, MonthKey } from '@/domain/types';
import { IncomeExpenseChart } from '../../dashboard/charts/IncomeExpenseChart';
import { cashflowRows, cashflowTotals } from '../report-utils';

export interface CashflowTabProps {
  data: FinanceData;
  months: MonthKey[];
}

/** `target`: meta de poupança como fração da renda (null = o usuário não definiu meta). */
function RateCell({ rate, target }: { rate: number | null; target: number | null }) {
  if (rate === null) return <span className="text-slate-400">—</span>;
  return (
    <span
      className={cn(
        rate < 0
          ? 'text-rose-600 dark:text-rose-400'
          : target !== null && rate >= target
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-slate-700 dark:text-slate-200',
      )}
    >
      {formatPercent(rate)}
    </span>
  );
}

/** Fluxo de caixa: barras de receitas/despesas, linha de saldo acumulado e tabela com a taxa de poupança. */
export function CashflowTab({ data, months }: CashflowTabProps) {
  const endMonth = months[months.length - 1];
  const series = useMemo(
    () => monthlySeries(data.transactions, endMonth, months.length),
    [data.transactions, endMonth, months.length],
  );
  const rows = useMemo(() => cashflowRows(series), [series]);
  const totals = useMemo(() => cashflowTotals(series), [series]);
  const targetPct = savingsTargetPct(data.settings);
  const target = targetPct === null ? null : targetPct / 100;
  const rate = totals.savingsRate;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Receitas no período" value={<Money value={totals.income} />} tone="positive" />
        <StatCard label="Despesas no período" value={<Money value={totals.expense} />} tone="negative" />
        <StatCard
          label="Resultado no período"
          value={<Money value={totals.net} signed colored />}
          hint={
            <>
              Média de <Money value={Math.round(totals.net / Math.max(1, months.length))} /> por mês
            </>
          }
          tone={totals.net >= 0 ? 'brand' : 'warning'}
        />
        <StatCard
          label="Taxa de poupança"
          value={rate === null ? '—' : formatPercent(rate)}
          hint={target === null ? 'Sem meta de poupança definida' : `Meta: ${formatPercent(target)} da renda`}
          tone={
            target === null
              ? rate !== null && rate < 0
                ? 'warning'
                : 'neutral'
              : rate !== null && rate >= target
                ? 'positive'
                : 'warning'
          }
        />
      </div>

      <Card>
        <section aria-labelledby="cashflow-chart-title">
          <CardHeader
            icon={<ChartColumn size={18} aria-hidden />}
            title={<span id="cashflow-chart-title">Receitas, despesas e saldo acumulado</span>}
            subtitle="Saldo acumulado = soma dos resultados mensais desde o início do período"
          />
          <figure aria-label="Gráfico de receitas e despesas por mês com a linha do saldo acumulado">
            <IncomeExpenseChart rows={rows} showAccumulated height={240} />
          </figure>
        </section>
      </Card>

      <Card>
        <section aria-labelledby="cashflow-table-title">
          <CardHeader
            icon={<Table2 size={18} aria-hidden />}
            title={<span id="cashflow-table-title">Mês a mês</span>}
            subtitle="Taxa de poupança = (resultado + investimentos) ÷ receitas"
          />
          <div className="relative -mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
            <table className="w-full min-w-max text-sm">
              <caption className="sr-only">Fluxo de caixa mensal</caption>
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th scope="col" className="py-2 pr-3 text-left font-medium">
                    Mês
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Receitas
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Despesas
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Resultado
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Poupança
                  </th>
                  <th scope="col" className="py-2 pl-2 text-right font-medium">
                    Saldo acumulado
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.month} className="border-b border-slate-100 dark:border-slate-800">
                    <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-800 dark:text-slate-100">
                      {formatMonthShort(r.month)}
                    </th>
                    <td className="px-2 py-2 text-right text-slate-600 dark:text-slate-300">
                      <Money value={r.income} />
                    </td>
                    <td className="px-2 py-2 text-right text-slate-600 dark:text-slate-300">
                      <Money value={r.expense} />
                    </td>
                    <td className="px-2 py-2 text-right font-medium">
                      <Money value={r.net} signed colored />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <RateCell rate={r.savingsRate} target={target} />
                    </td>
                    <td className="py-2 pl-2 text-right text-slate-700 dark:text-slate-200">
                      <Money value={r.accumulated} />
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
                    <Money value={totals.income} />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Money value={totals.expense} />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Money value={totals.net} signed colored />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <RateCell rate={totals.savingsRate} target={target} />
                  </td>
                  <td className="py-2 pl-2 text-right">
                    <Money value={totals.net} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </Card>
    </div>
  );
}
