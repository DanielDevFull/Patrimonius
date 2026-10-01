import { PiggyBank } from 'lucide-react';
import type { BudgetOverview, BudgetStatus } from '@/analytics';
import { ROUTES } from '@/app/navigation';
import { Badge, Card, CardHeader, EmptyState, Money, ProgressBar } from '@/components/ui';
import { formatPercent } from '@/domain/money';
import { plural } from '@/domain/text';
import { CardLink, LinkButton } from './shared';

/** Quantos orçamentos o painel mostra (os mais críticos: maior % usado). */
export const DASHBOARD_BUDGETS = 4;

function StatusBadge({ item }: { item: BudgetStatus }) {
  if (item.status === 'estourado') return <Badge tone="negative">Estourado</Badge>;
  if (item.status === 'alerta') return <Badge tone="warning">Atenção</Badge>;
  return null;
}

export interface BudgetsCardProps {
  overview: BudgetOverview;
  monthLabel: string;
  className?: string;
}

/** Os orçamentos mais críticos do mês com barra de progresso. */
export function BudgetsCard({ overview, monthLabel, className }: BudgetsCardProps) {
  const items = overview.items.slice(0, DASHBOARD_BUDGETS);
  return (
    <Card className={className}>
      <section aria-labelledby="dashboard-budgets-title">
        <CardHeader
          icon={<PiggyBank size={18} aria-hidden />}
          title={<span id="dashboard-budgets-title">Orçamentos</span>}
          subtitle={monthLabel}
          actions={<CardLink to={ROUTES.budgets}>Ver todos</CardLink>}
        />
        {items.length === 0 ? (
          <EmptyState
            icon={<PiggyBank size={36} aria-hidden />}
            title="Nenhum orçamento"
            description="Defina limites mensais por categoria e acompanhe aqui quanto ainda pode gastar."
            action={<LinkButton to={ROUTES.budgets}>Criar orçamento</LinkButton>}
          />
        ) : (
          <>
            <ul className="space-y-3.5">
              {items.map((item) => (
                <li key={item.budgetId}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5 font-medium text-slate-800 dark:text-slate-100">
                      <span aria-hidden>{item.icon}</span>
                      <span className="truncate">{item.categoryName}</span>
                      <StatusBadge item={item} />
                    </span>
                    <span className="tabular shrink-0 text-xs text-slate-500 dark:text-slate-400">
                      {Number.isFinite(item.percent) ? formatPercent(item.percent) : 'sem limite'}
                    </span>
                  </div>
                  <ProgressBar value={item.percent} label={`Orçamento de ${item.categoryName}`} />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    <Money value={item.spent} /> de <Money value={item.budgeted} />
                    {item.remaining >= 0 ? (
                      <>
                        {' '}
                        · resta <Money value={item.remaining} />
                      </>
                    ) : (
                      <>
                        {' '}
                        · <span className="text-rose-600 dark:text-rose-400">passou</span>{' '}
                        <Money value={-item.remaining} className="text-rose-600 dark:text-rose-400" />
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
            {overview.items.length > items.length && (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                + {plural(overview.items.length - items.length, 'outro orçamento', 'outros orçamentos')} com uso
                menor.
              </p>
            )}
          </>
        )}
      </section>
    </Card>
  );
}
