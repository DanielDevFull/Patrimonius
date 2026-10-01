import { cn } from './cn';

export type ProgressTone = 'auto' | 'brand' | 'positive' | 'warning' | 'negative' | 'neutral';

export interface ProgressBarProps {
  /** Fração (0..1). Valores > 1 preenchem a barra inteira. */
  value: number;
  /**
   * 'auto' (padrão): verde < 0.8, âmbar 0.8..1, vermelho > 1 — ideal para orçamentos (gasto/limite).
   * Para metas (quanto maior melhor) use 'brand' ou 'positive'.
   */
  tone?: ProgressTone;
  size?: 'sm' | 'md';
  className?: string;
  label?: string;
}

const TONES: Record<Exclude<ProgressTone, 'auto'>, string> = {
  brand: 'bg-brand-600',
  positive: 'bg-emerald-500',
  warning: 'bg-amber-500',
  negative: 'bg-rose-500',
  neutral: 'bg-slate-400',
};

export function ProgressBar({ value, tone = 'auto', size = 'md', className, label }: ProgressBarProps) {
  // +Infinity (ex.: gasto com orçamento zero) conta como estourado; NaN/-Infinity como vazio.
  const safe = Number.isFinite(value) ? Math.max(0, value) : value > 0 ? 2 : 0;
  const resolved: Exclude<ProgressTone, 'auto'> =
    tone === 'auto' ? (safe > 1 ? 'negative' : safe >= 0.8 ? 'warning' : 'positive') : tone;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(safe, 1) * 100)}
      className={cn(
        'w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800',
        size === 'sm' ? 'h-1.5' : 'h-2.5',
        className,
      )}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', TONES[resolved])}
        style={{ width: `${Math.min(safe, 1) * 100}%` }}
      />
    </div>
  );
}
