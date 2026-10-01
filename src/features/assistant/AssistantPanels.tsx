import {
  CalendarCheck,
  Lightbulb,
  MessageCircle,
  OctagonAlert,
  PartyPopper,
  PencilLine,
  Search,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Insight, InsightSeverity } from '@/agent';
import { Badge, cn, IconButton, useToast, type BadgeTone } from '@/components/ui';
import { dismissInsight } from '@/db/repo';
import type { MonthKey } from '@/domain/types';
import { EXAMPLE_GROUPS, INSIGHT_AREA_QUESTION, isInternalPath, type ExampleGroup } from './chat-utils';
import { InlineText } from './RichText';

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

export interface InsightsListProps {
  insights: Insight[];
  /** Mês corrente: o insight dispensado volta no mês seguinte. */
  month: MonthKey;
  agentName: string;
  /** Envia uma pergunta ao agente sobre o insight. */
  onAsk: (question: string) => void;
  /** Desabilita "Conversar sobre isso" (ex.: enquanto o agente responde). */
  askDisabled?: boolean;
}

/** Lista de insights proativos com dispensar, link de ação e "conversar sobre isso". */
export function InsightsList({ insights, month, agentName, onAsk, askDisabled }: InsightsListProps) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function dismiss(insight: Insight) {
    setBusy(insight.id);
    try {
      await dismissInsight(insight.id, month);
      toast('Insight dispensado até o fim do mês.', 'info');
    } catch {
      toast('Não foi possível dispensar o insight.', 'error');
    } finally {
      setBusy(null);
    }
  }

  if (insights.length === 0) {
    return (
      <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
        Nenhum alerta no momento. 👌 Continue registrando seus lançamentos que o {agentName} avisa o que merecer atenção.
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {insights.map((insight) => {
        const meta = SEVERITY[insight.severity];
        const Icon = meta.icon;
        const action = insight.action && isInternalPath(insight.action.to) ? insight.action : null;
        return (
          <li
            key={insight.id}
            aria-label={insight.title}
            className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start gap-2.5">
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', meta.iconClass)}>
                <Icon size={16} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <Badge tone={meta.tone}>{meta.label}</Badge>
                <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{insight.title}</h3>
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
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
              <InlineText text={insight.message} />
            </p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              <button
                type="button"
                disabled={askDisabled}
                onClick={() => onAsk(INSIGHT_AREA_QUESTION[insight.area])}
                className="inline-flex items-center gap-1 rounded font-medium text-brand-700 hover:underline disabled:opacity-50 dark:text-brand-400"
              >
                <MessageCircle size={14} aria-hidden /> Conversar sobre isso
              </button>
              {action && (
                <Link
                  to={action.to}
                  className="rounded font-medium text-slate-600 hover:underline dark:text-slate-300"
                >
                  {action.label}
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const GROUP_ICON: Record<ExampleGroup['id'], LucideIcon> = {
  registrar: PencilLine,
  consultar: Search,
  planejar: CalendarCheck,
};

export interface ExamplesListProps {
  onPick: (example: string) => void;
  disabled?: boolean;
}

/** "Pergunte ao Pat": exemplos clicáveis por categoria (Registrar, Consultar, Planejar). */
export function ExamplesList({ onPick, disabled }: ExamplesListProps) {
  return (
    <div className="space-y-4">
      {EXAMPLE_GROUPS.map((group) => {
        const Icon = GROUP_ICON[group.id];
        return (
          <section key={group.id} aria-label={group.title}>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <Icon size={14} aria-hidden /> {group.title}
            </h3>
            <ul className="space-y-1">
              {group.examples.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(example)}
                    className="w-full rounded-lg bg-slate-50 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-brand-50 hover:text-brand-800 disabled:opacity-50 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-brand-950 dark:hover:text-brand-300"
                  >
                    “{example}”
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
