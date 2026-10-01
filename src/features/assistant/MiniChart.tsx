import { useId } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipPayload,
} from 'recharts';
import { useChartTheme, useHideValues } from '@/components/charts/theme';
import { Money } from '@/components/ui';
import { COLOR_PALETTE } from '@/domain/defaults';
import { formatBRLCompact, formatPercent } from '@/domain/money';

export interface MiniChartDatum {
  label: string;
  /** Centavos. */
  value: number;
  color?: string;
}

export interface MiniChartProps {
  kind: 'bar' | 'pie';
  title: string;
  data: MiniChartDatum[];
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload; label?: string | number }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  if (typeof entry.value !== 'number') return null;
  const name = label !== undefined && label !== '' ? String(label) : String(entry.name ?? '');
  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900/95">
      {name && <p className="text-slate-500 dark:text-slate-400">{name}</p>}
      <Money value={entry.value} className="font-semibold text-slate-900 dark:text-white" />
    </div>
  );
}

/**
 * Gráfico pequeno das respostas do agente (barras de uma série ou pizza por categoria). Valores em centavos.
 * Cores do tema compartilhado (@/components/charts/theme): série única na cor do saldo (azul), com passo próprio
 * para o modo escuro. As pizzas usam as cores das próprias categorias e sempre têm legenda com nome e valor
 * (a identidade nunca depende só da cor).
 */
export function MiniChart({ kind, title, data }: MiniChartProps) {
  const t = useChartTheme();
  const hideValues = useHideValues();
  const tableId = useId();

  if (kind === 'pie') {
    const slices = data
      .filter((d) => d.value > 0)
      .map((d, i) => ({ ...d, color: d.color ?? COLOR_PALETTE[i % COLOR_PALETTE.length] }));
    const total = slices.reduce((s, d) => s + d.value, 0);
    if (slices.length === 0 || total <= 0) return null;
    return (
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <div className="size-32 shrink-0" role="img" aria-label={`Gráfico de pizza: ${title}`}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="label"
                innerRadius="55%"
                outerRadius="95%"
                stroke={t.surface}
                strokeWidth={2}
                startAngle={90}
                endAngle={-270}
                isAnimationActive={false}
              >
                {slices.map((s) => (
                  <Cell key={s.label} fill={s.color} />
                ))}
              </Pie>
              <Tooltip content={(p) => <ChartTip active={p.active} payload={p.payload} />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="w-full min-w-0 space-y-1 text-xs" aria-label={`Legenda: ${title}`}>
          {slices.map((s) => (
            <li key={s.label} className="flex items-center gap-2">
              <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-300">{s.label}</span>
              <Money value={s.value} className="font-medium text-slate-900 dark:text-slate-100" />
              <span className="w-11 text-right tabular text-slate-500 dark:text-slate-400">
                {formatPercent(s.value / total)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const rows = data.map((d) => ({ ...d, fill: d.color ?? t.balance }));
  const hasNegative = rows.some((r) => r.value < 0);
  return (
    <div>
      <div className="h-40 w-full" role="img" aria-label={`Gráfico de barras: ${title}`} aria-describedby={tableId}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={t.grid} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: t.tick }}
              tickLine={false}
              axisLine={{ stroke: t.axis }}
              interval="preserveStartEnd"
              minTickGap={4}
            />
            <YAxis
              width={64}
              tick={{ fontSize: 10, fill: t.tick }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => (hideValues ? '•••' : formatBRLCompact(v))}
            />
            <Tooltip cursor={{ fill: t.cursor }} content={(p) => <ChartTip active={p.active} payload={p.payload} label={p.label} />} />
            {hasNegative && <ReferenceLine y={0} stroke={t.axis} />}
            <Bar dataKey="value" name={title} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {rows.map((r, i) => (
                <Cell key={`${r.label}-${i}`} fill={r.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-1 text-xs" id={tableId}>
        <summary className="cursor-pointer rounded text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          Ver valores
        </summary>
        <ul className="mt-1 space-y-0.5">
          {rows.map((r, i) => (
            <li key={`${r.label}-${i}`} className="flex justify-between gap-3">
              <span className="text-slate-600 dark:text-slate-300">{r.label}</span>
              <Money value={r.value} className="text-slate-900 dark:text-slate-100" />
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
