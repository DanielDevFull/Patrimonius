import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonthsToKey, formatMonthLong } from '@/domain/dates';
import type { MonthKey } from '@/domain/types';
import { capitalize } from '@/domain/text';
import { IconButton } from './Button';

export interface MonthPickerProps {
  value: MonthKey;
  onChange: (month: MonthKey) => void;
  /** Mês máximo permitido (opcional). */
  max?: MonthKey;
}

/** Seletor de mês com setas anterior/próximo. */
export function MonthPicker({ value, onChange, max }: MonthPickerProps) {
  const next = addMonthsToKey(value, 1);
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
      <IconButton label="Mês anterior" size="sm" onClick={() => onChange(addMonthsToKey(value, -1))}>
        <ChevronLeft size={18} />
      </IconButton>
      <span className="min-w-36 text-center text-sm font-semibold" aria-live="polite">
        {capitalize(formatMonthLong(value))}
      </span>
      <IconButton label="Próximo mês" size="sm" disabled={!!max && next > max} onClick={() => onChange(next)}>
        <ChevronRight size={18} />
      </IconButton>
    </div>
  );
}
