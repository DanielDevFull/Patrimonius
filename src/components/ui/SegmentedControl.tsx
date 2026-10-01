import { useRef, type KeyboardEvent } from 'react';
import { cn } from './cn';
import { segmentPanelId, segmentTabId } from './segment-ids';

export interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  'aria-label'?: string;
  /**
   * 'tabs' (padrão): abas que trocam um painel (role tablist/tab). Informe `idPrefix` e use
   * `segmentPanelId(idPrefix, value)` como id do painel para ligar aria-controls.
   * 'radio': escolha de um valor (tema, tipo, período) — role radiogroup/radio.
   */
  mode?: 'tabs' | 'radio';
  idPrefix?: string;
}

/** Abas/segmentos com navegação por setas (←/→/Home/End) e tabindex itinerante. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  mode = 'tabs',
  idPrefix,
  ...rest
}: SegmentedControlProps<T>) {
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const isTabs = mode === 'tabs';

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next].value);
    buttonsRef.current[next]?.focus();
  };

  return (
    <div
      role={isTabs ? 'tablist' : 'radiogroup'}
      aria-label={rest['aria-label']}
      className={cn('inline-flex max-w-full overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800', className)}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              buttonsRef.current[i] = el;
            }}
            type="button"
            role={isTabs ? 'tab' : 'radio'}
            id={idPrefix ? segmentTabId(idPrefix, opt.value) : undefined}
            aria-controls={isTabs && idPrefix ? segmentPanelId(idPrefix, opt.value) : undefined}
            aria-selected={isTabs ? selected : undefined}
            aria-checked={isTabs ? undefined : selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              selected
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
