import { ChartPie } from 'lucide-react';
import { useMemo } from 'react';
import type { CategoryTotal } from '@/analytics';
import { ROUTES } from '@/app/navigation';
import { Card, CardHeader, EmptyState, Money } from '@/components/ui';
import { formatPercent } from '@/domain/money';
import { CategoryDonut } from '../charts/CategoryDonut';
import { donutSlices } from '../dashboard-utils';
import { CardLink } from './shared';

export interface CategoriesCardProps {
  /** Totais de despesa por categoria no mês (ordenados por total desc). */
  rows: CategoryTotal[];
  monthLabel: string;
  className?: string;
}

/** Gastos por categoria no mês: rosca + legenda com valores e %. */
export function CategoriesCard({ rows, monthLabel, className }: CategoriesCardProps) {
  const slices = useMemo(() => donutSlices(rows), [rows]);
  const total = slices.reduce((s, x) => s + x.value, 0);
  return (
    <Card className={className}>
      <section aria-labelledby="dashboard-categories-title">
        <CardHeader
          icon={<ChartPie size={18} aria-hidden />}
          title={<span id="dashboard-categories-title">Gastos por categoria</span>}
          subtitle={monthLabel}
          actions={<CardLink to={ROUTES.reports}>Relatórios</CardLink>}
        />
        {slices.length === 0 ? (
          <EmptyState
            icon={<ChartPie size={36} aria-hidden />}
            title="Sem despesas no mês"
            description="Quando você registrar despesas, a divisão por categoria aparece aqui."
          />
        ) : (
          <>
            <figure aria-label={`Rosca dos gastos por categoria em ${monthLabel}`}>
              <CategoryDonut slices={slices} total={total} centerLabel="Despesas" />
            </figure>
            <ul className="mt-3 space-y-1.5" aria-label="Legenda dos gastos por categoria">
              {slices.map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-sm">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
                  <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                    <span aria-hidden>{s.icon} </span>
                    {s.label}
                  </span>
                  <Money value={s.value} className="font-medium text-slate-900 dark:text-slate-100" />
                  <span className="tabular w-12 text-right text-xs text-slate-500 dark:text-slate-400">
                    {formatPercent(s.share)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </Card>
  );
}
