import type { TooltipPayload } from 'recharts';
import { Money } from '@/components/ui';

export interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayload;
  label?: string | number;
  /** Converte o rótulo do eixo X (ex.: '2026-10') no título do tooltip (ex.: 'Outubro de 2026'). */
  formatLabel?: (label: string) => string;
  /** Esconde o título (ex.: gráficos de rosca, em que o nome já identifica a fatia). */
  hideLabel?: boolean;
}

function colorOf(entry: TooltipPayload[number]): string | undefined {
  const fromPayload: unknown = entry.payload;
  if (fromPayload && typeof fromPayload === 'object' && 'color' in fromPayload) {
    const c = (fromPayload as { color: unknown }).color;
    if (typeof c === 'string') return c;
  }
  return entry.color ?? entry.stroke ?? entry.fill;
}

/**
 * Conteúdo do tooltip dos gráficos: valor em destaque (em BRL, via <Money>, que respeita o modo
 * "ocultar valores") e nome da série em segundo plano, com uma pequena linha da cor da série.
 * Os valores chegam em centavos.
 */
export function ChartTooltip({ active, payload, label, formatLabel, hideLabel }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload.filter((entry) => typeof entry.value === 'number');
  if (rows.length === 0) return null;
  const title = label === undefined ? '' : formatLabel ? formatLabel(String(label)) : String(label);
  return (
    <div className="min-w-36 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      {!hideLabel && title && <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">{title}</p>}
      <ul className="space-y-1">
        {rows.map((entry, i) => (
          <li key={`${String(entry.dataKey ?? entry.name ?? i)}-${i}`} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-0.5 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: colorOf(entry) ?? 'currentColor' }}
            />
            <Money value={entry.value as number} className="font-semibold text-slate-900 dark:text-white" />
            <span className="truncate text-xs text-slate-500 dark:text-slate-400">{String(entry.name ?? '')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
