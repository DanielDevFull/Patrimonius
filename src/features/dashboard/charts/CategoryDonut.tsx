import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Money } from '@/components/ui';
import type { Cents } from '@/domain/types';
import type { DonutSlice } from '../dashboard-utils';
import { ChartTooltip } from './ChartTooltip';
import { useChartTheme } from './theme';

export interface CategoryDonutProps {
  slices: DonutSlice[];
  total: Cents;
  /** Rótulo pequeno sob o total, no centro da rosca. */
  centerLabel?: string;
  height?: number;
}

/**
 * Rosca de participação por categoria (cores das próprias categorias). As fatias são separadas por um
 * espaço de 2px na cor da superfície. A legenda com valores e % fica fora do gráfico (HTML acessível).
 */
export function CategoryDonut({ slices, total, centerLabel = 'Total', height = 200 }: CategoryDonutProps) {
  const t = useChartTheme();
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            innerRadius="62%"
            outerRadius="92%"
            stroke={t.surface}
            strokeWidth={2}
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
          >
            {slices.map((s) => (
              <Cell key={s.key} fill={s.color} />
            ))}
          </Pie>
          <Tooltip content={(p) => <ChartTooltip active={p.active} payload={p.payload} hideLabel />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xs text-slate-500 dark:text-slate-400">{centerLabel}</span>
        <Money value={total} compact className="text-base font-bold text-slate-900 dark:text-white" />
      </div>
    </div>
  );
}
