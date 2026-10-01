import type { ReactNode } from 'react';
import { cn } from './cn';

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'neutral' | 'positive' | 'negative' | 'warning' | 'brand';
  className?: string;
}

const ICON_TONES = {
  neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  positive: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  negative: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  brand: 'bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-400',
};

/** Cartão de indicador (KPI). */
export function StatCard({ label, value, hint, icon, tone = 'neutral', className }: StatCardProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900',
        className,
      )}
    >
      {icon && <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', ICON_TONES[tone])}>{icon}</div>}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-1 truncate text-xl font-bold text-slate-900 dark:text-white">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}
