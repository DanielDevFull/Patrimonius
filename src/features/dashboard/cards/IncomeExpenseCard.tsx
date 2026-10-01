import { ChartColumn } from 'lucide-react';
import type { MonthSummary } from '@/analytics';
import { ROUTES } from '@/app/navigation';
import { Card, CardHeader, Money } from '@/components/ui';
import { formatMonthShort } from '@/domain/dates';
import { IncomeExpenseChart } from '../charts/IncomeExpenseChart';
import { CardLink } from './shared';

export interface IncomeExpenseCardProps {
  series: MonthSummary[];
  className?: string;
}

/** Receitas x despesas dos últimos 6 meses (barras), com a mesma informação em tabela. */
export function IncomeExpenseCard({ series, className }: IncomeExpenseCardProps) {
  const hasData = series.some((m) => m.income > 0 || m.expense > 0);
  const rows = series.map((m) => ({ month: m.month, income: m.income, expense: m.expense }));
  return (
    <Card className={className}>
      <section aria-labelledby="dashboard-flow-title">
        <CardHeader
          icon={<ChartColumn size={18} aria-hidden />}
          title={<span id="dashboard-flow-title">Receitas x despesas</span>}
          subtitle={
            series.length > 0
              ? `Últimos ${series.length} meses (${formatMonthShort(series[0].month)} a ${formatMonthShort(series[series.length - 1].month)})`
              : undefined
          }
          actions={<CardLink to={ROUTES.reports}>Fluxo de caixa</CardLink>}
        />
        {!hasData ? (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Ainda não há receitas ou despesas nesses meses.
          </p>
        ) : (
          <>
            <figure aria-label="Gráfico de barras de receitas e despesas por mês">
              <IncomeExpenseChart rows={rows} />
            </figure>
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer rounded text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
                Ver em tabela
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 dark:text-slate-400">
                      <th scope="col" className="py-1 pr-2 font-medium">
                        Mês
                      </th>
                      <th scope="col" className="py-1 pr-2 text-right font-medium">
                        Receitas
                      </th>
                      <th scope="col" className="py-1 pr-2 text-right font-medium">
                        Despesas
                      </th>
                      <th scope="col" className="py-1 text-right font-medium">
                        Sobra
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {series.map((m) => (
                      <tr key={m.month} className="border-t border-slate-100 dark:border-slate-800">
                        <th scope="row" className="py-1 pr-2 text-left font-normal">
                          {formatMonthShort(m.month)}
                        </th>
                        <td className="py-1 pr-2 text-right">
                          <Money value={m.income} />
                        </td>
                        <td className="py-1 pr-2 text-right">
                          <Money value={m.expense} />
                        </td>
                        <td className="py-1 text-right">
                          <Money value={m.net} colored />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </section>
    </Card>
  );
}
