import { Bot, ChevronDown, Lightbulb, MessageCircle, OctagonAlert, PartyPopper, Sparkles, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { useId, useState } from 'react';
import type { Insight, InsightSeverity } from '@/agent';
import { ROUTES } from '@/app/navigation';
import { Badge, Button, Card, CardHeader, cn, IconButton, useToast, type BadgeTone, MoneyText } from '@/components/ui';
import { dismissInsight } from '@/db/repo';
import type { MonthKey } from '@/domain/types';
import { LinkButton } from './shared';

const SEVERITY: Record<InsightSeverity, { label: string; icon: LucideIcon; tone: BadgeTone; iconClass: string }> = {
  critico: {
    label: 'Urgente',
    icon: OctagonAlert,
    tone: 'negative',
    iconClass: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400',
  },
  atencao: {
    label: 'Atenção',
    icon: TriangleAlert,
    tone: 'warning',
    iconClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  },
  info: {
    label: 'Dica',
    icon: Lightbulb,
    tone: 'info',
    iconClass: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400',
  },
  positivo: {
    label: 'Conquista',
    icon: PartyPopper,
    tone: 'positive',
    iconClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  },
};

/** Quantos insights o painel mostra de início (os de maior prioridade); "Ver todas" mostra o restante no próprio card. */
export const DASHBOARD_INSIGHTS = 5;

export interface InsightsCardProps {
  insights: Insight[];
  agentName: string;
  /** Mês corrente (o insight dispensado volta no mês seguinte). */
  currentMonth: MonthKey;
  className?: string;
}

/** "O Pat recomenda": principais insights com ação e opção de dispensar. */
export function InsightsCard({ insights, agentName, currentMonth, className }: InsightsCardProps) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const collapsible = insights.length > DASHBOARD_INSIGHTS;
  const shown = expanded ? insights : insights.slice(0, DASHBOARD_INSIGHTS);
  const agent = agentName.trim() || 'Pat';

  async function dismiss(insight: Insight) {
    setBusy(insight.id);
    try {
      await dismissInsight(insight.id, currentMonth);
      toast('Recomendação dispensada até o fim do mês.', 'info');
    } catch {
      toast('Não foi possível dispensar a recomendação.', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className={className}>
      <section aria-labelledby="dashboard-insights-title">
        <CardHeader
          icon={<Sparkles size={18} aria-hidden />}
          title={<span id="dashboard-insights-title">O {agent} recomenda</span>}
          subtitle="Alertas e sugestões a partir dos seus números"
        />
        {shown.length === 0 ? (
          <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            <Bot size={20} className="mt-0.5 shrink-0 text-brand-700 dark:text-brand-400" aria-hidden />
            <p>Tudo em ordem por aqui. Nenhuma recomendação nova no momento — continue registrando seus lançamentos.</p>
          </div>
        ) : (
          <ul id={listId} className="space-y-3">
            {shown.map((insight) => {
              const meta = SEVERITY[insight.severity];
              const Icon = meta.icon;
              return (
                <li
                  key={insight.id}
                  className="flex gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                  aria-label={insight.title}
                >
                  <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', meta.iconClass)}>
                    <Icon size={18} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Badge tone={meta.tone} className="mb-1">
                          {meta.label}
                        </Badge>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{insight.title}</h3>
                      </div>
                      <IconButton
                        label={`Dispensar: ${insight.title}`}
                        size="sm"
                        disabled={busy === insight.id}
                        onClick={() => void dismiss(insight)}
                      >
                        <X size={16} aria-hidden />
                      </IconButton>
                    </div>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      <MoneyText text={insight.message} />
                    </p>
                    {insight.action && (
                      <div className="mt-2">
                        <LinkButton to={insight.action.to}>{insight.action.label}</LinkButton>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {insights.length > shown.length
              ? `Mostrando ${shown.length} de ${insights.length} recomendações.`
              : 'Recomendações dispensadas voltam no próximo mês, se ainda fizerem sentido.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {collapsible && (
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={expanded}
                aria-controls={listId}
                icon={<ChevronDown size={16} aria-hidden className={cn('transition-transform', expanded && 'rotate-180')} />}
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? 'Mostrar menos' : `Ver todas (${insights.length})`}
              </Button>
            )}
            <LinkButton to={ROUTES.assistant} icon={<MessageCircle size={16} aria-hidden />}>
              Conversar com o {agent}
            </LinkButton>
          </div>
        </div>
      </section>
    </Card>
  );
}
