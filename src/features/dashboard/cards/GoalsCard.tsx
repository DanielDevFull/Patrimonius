import { Target } from 'lucide-react';
import type { GoalProgress } from '@/analytics';
import { ROUTES } from '@/app/navigation';
import { Badge, Card, CardHeader, EmptyState, Money, ProgressBar } from '@/components/ui';
import { formatDateBR } from '@/domain/dates';
import { formatPercent } from '@/domain/money';
import { GOAL_TRACK_META } from '../dashboard-utils';
import { CardLink, LinkButton } from './shared';

/** Quantas metas o painel mostra (as principais, na ordem de goalsOverview). */
export const DASHBOARD_GOALS = 3;

export interface GoalsCardProps {
  /** Metas já ordenadas por goalsOverview (em andamento por prioridade, depois pausadas e concluídas). */
  items: GoalProgress[];
  className?: string;
}

/** As 3 metas principais com progresso. */
export function GoalsCard({ items, className }: GoalsCardProps) {
  const shown = items.slice(0, DASHBOARD_GOALS);
  return (
    <Card className={className}>
      <section aria-labelledby="dashboard-goals-title">
        <CardHeader
          icon={<Target size={18} aria-hidden />}
          title={<span id="dashboard-goals-title">Metas</span>}
          actions={<CardLink to={ROUTES.goals}>Ver todas</CardLink>}
        />
        {shown.length === 0 ? (
          <EmptyState
            icon={<Target size={36} aria-hidden />}
            title="Nenhuma meta ainda"
            description="Uma reserva de emergência é uma ótima primeira meta."
            action={<LinkButton to={ROUTES.goals}>Criar meta</LinkButton>}
          />
        ) : (
          <ul className="space-y-4">
            {shown.map((g) => {
              const meta = GOAL_TRACK_META[g.track];
              return (
                <li key={g.goalId}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">
                      <span aria-hidden>{g.icon}</span>
                      <span className="truncate">{g.name}</span>
                    </span>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>
                  <ProgressBar value={g.percent} tone="brand" label={`Progresso da meta ${g.name}`} />
                  <p className="mt-1 flex flex-wrap justify-between gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      <Money value={g.saved} /> de <Money value={g.targetAmount} /> ({formatPercent(g.percent)})
                    </span>
                    {g.track !== 'concluida' && g.requiredMonthly !== null && g.requiredMonthly > 0 && (
                      <span>
                        <Money value={g.requiredMonthly} />
                        /mês{g.targetDate ? ` até ${formatDateBR(g.targetDate)}` : ''}
                      </span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Card>
  );
}
