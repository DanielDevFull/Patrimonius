import { HeartPulse, Info } from 'lucide-react';
import type { HealthReport } from '@/analytics';
import { Badge, Card, CardHeader, ProgressBar, type BadgeTone } from '@/components/ui';
import { HealthGauge } from '../charts/HealthGauge';
import { componentTone, HEALTH_GRADE_LABELS, weakestComponent } from '../dashboard-utils';
import { MoneyText } from '../MoneyText';

const GRADE_TONE: Record<HealthReport['grade'], BadgeTone> = {
  excelente: 'positive',
  boa: 'positive',
  regular: 'warning',
  atencao: 'warning',
  critica: 'negative',
};

/** Saúde financeira: score em medidor circular, nota e mini-barras dos 6 componentes (dica no title). */
export function HealthCard({ report, className }: { report: HealthReport; className?: string }) {
  const weakest = weakestComponent(report.components);
  return (
    <Card className={className}>
      <section aria-labelledby="dashboard-health-title">
        <CardHeader
          icon={<HeartPulse size={18} aria-hidden />}
          title={<span id="dashboard-health-title">Saúde financeira</span>}
          subtitle="Nota de 0 a 100 calculada com seus dados"
        />
        <div className="flex flex-wrap items-center gap-4">
          <HealthGauge score={report.score} grade={report.grade} />
          <div className="min-w-0 flex-1 space-y-2">
            <Badge tone={GRADE_TONE[report.grade]}>Nota: {HEALTH_GRADE_LABELS[report.grade]}</Badge>
            {weakest && (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <span className="font-medium text-slate-800 dark:text-slate-100">Para melhorar: </span>
                <MoneyText text={weakest.tip} />
              </p>
            )}
            {report.dataQuality !== 'boa' && (
              <p className="flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
                {report.dataQuality === 'insuficiente'
                  ? 'Ainda há poucos dados: a nota fica precisa depois de alguns meses de lançamentos.'
                  : 'Avaliação parcial: com 3 meses de lançamentos a nota fica mais precisa.'}
              </p>
            )}
          </div>
        </div>
        <ul className="mt-4 space-y-2.5">
          {report.components.map((c) => (
            <li key={c.key} title={c.tip}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {c.label} <span className="font-normal text-slate-400">· peso {c.weight}</span>
                </span>
                <span className="tabular text-slate-500 dark:text-slate-400">{Math.round(c.score)}/100</span>
              </div>
              <ProgressBar
                value={c.score / 100}
                tone={componentTone(c.score)}
                size="sm"
                className="mt-1"
                label={`${c.label}: ${Math.round(c.score)} de 100`}
              />
              <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                <MoneyText text={c.value} />
              </p>
            </li>
          ))}
        </ul>
      </section>
    </Card>
  );
}
