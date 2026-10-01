import { Circle, CircleCheck, ListChecks, Sparkles } from 'lucide-react';
import { ROUTES } from '@/app/navigation';
import { Card, CardHeader, cn, ProgressBar } from '@/components/ui';
import type { FirstStep } from '../dashboard-utils';
import { LinkButton } from './shared';

/** Checklist do primeiro uso (sem lançamentos). */
export function FirstStepsCard({ steps, className }: { steps: FirstStep[]; className?: string }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <Card className={className}>
      <section aria-labelledby="dashboard-first-steps-title">
        <CardHeader
          icon={<ListChecks size={18} aria-hidden />}
          title={<span id="dashboard-first-steps-title">Primeiros passos</span>}
          subtitle={`${done} de ${steps.length} concluídos · tudo fica salvo só neste dispositivo`}
        />
        <ProgressBar value={steps.length ? done / steps.length : 0} tone="brand" label="Progresso dos primeiros passos" />
        <ol className="mt-4 space-y-2">
          {steps.map((step) => (
            <li
              key={step.key}
              className={cn(
                'flex flex-wrap items-center gap-3 rounded-xl border p-3',
                step.done
                  ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30'
                  : 'border-slate-200 dark:border-slate-800',
              )}
            >
              {step.done ? (
                <CircleCheck size={22} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              ) : (
                <Circle size={22} className="shrink-0 text-slate-300 dark:text-slate-600" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-sm font-semibold',
                    step.done ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-900 dark:text-slate-100',
                  )}
                >
                  {step.label}
                  {step.done && <span className="sr-only"> (concluído)</span>}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{step.description}</p>
              </div>
              {!step.done && (
                <LinkButton to={step.to} variant={step.key === 'contas' || step.key === 'lancamento' ? 'primary' : 'secondary'}>
                  {step.cta}
                </LinkButton>
              )}
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-900 dark:bg-brand-950/60 dark:text-brand-200">
          <Sparkles size={18} className="shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            Quer ver como fica antes de digitar seus dados? Carregue os <strong>dados de exemplo</strong> em
            Configurações (dá para apagar depois).
          </p>
          <LinkButton to={ROUTES.settings}>Abrir Configurações</LinkButton>
        </div>
      </section>
    </Card>
  );
}
