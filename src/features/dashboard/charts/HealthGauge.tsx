import type { HealthGrade } from '@/analytics';
import { cn } from '@/components/ui';
import { HEALTH_GRADE_LABELS } from '../dashboard-utils';

/** Cores de status (sempre acompanhadas do rótulo da nota, nunca só a cor). */
const GRADE_STROKE: Record<HealthGrade, string> = {
  excelente: 'stroke-emerald-500',
  boa: 'stroke-emerald-500',
  regular: 'stroke-amber-500',
  atencao: 'stroke-orange-500',
  critica: 'stroke-rose-500',
};

/** Fração do círculo usada pelo medidor (arco de 270°, aberto embaixo). */
const ARC = 0.75;

export interface HealthGaugeProps {
  score: number;
  grade: HealthGrade;
  size?: number;
}

/** Medidor circular do score de saúde financeira (0..100). */
export function HealthGauge({ score, grade, size = 136 }: HealthGaugeProps) {
  const strokeWidth = 11;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const arc = circumference * ARC;
  const filled = (arc * clamped) / 100;
  const center = size / 2;
  // Começa em 135° (canto inferior esquerdo) e percorre 270° no sentido horário.
  const transform = `rotate(135 ${center} ${center})`;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Nota de saúde financeira: ${clamped} de 100 (${HEALTH_GRADE_LABELS[grade]})`}
      >
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference}`}
          transform={transform}
          className="stroke-slate-200 dark:stroke-slate-800"
        />
        {clamped > 0 && (
          <circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            transform={transform}
            className={cn('transition-[stroke-dasharray] duration-700', GRADE_STROKE[grade])}
          />
        )}
      </svg>
      <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold text-slate-900 dark:text-white">{clamped}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">de 100</span>
      </div>
    </div>
  );
}
