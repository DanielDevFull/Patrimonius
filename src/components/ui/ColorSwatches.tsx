import { Check } from 'lucide-react';
import { COLOR_PALETTE } from '@/domain/defaults';
import { cn } from './cn';

export interface ColorSwatchesProps {
  value: string;
  onChange: (color: string) => void;
  colors?: string[];
}

export function ColorSwatches({ value, onChange, colors = COLOR_PALETTE }: ColorSwatchesProps) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === value}
          aria-label={c}
          onClick={() => onChange(c)}
          className={cn('flex size-8 items-center justify-center rounded-full ring-offset-2 dark:ring-offset-slate-900', c === value && 'ring-2 ring-slate-900 dark:ring-white')}
          style={{ backgroundColor: c }}
        >
          {c === value && <Check size={16} className="text-white" />}
        </button>
      ))}
    </div>
  );
}
