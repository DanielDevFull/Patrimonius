import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ForecastPoint } from '@/analytics';
import { formatDateBR } from '@/domain/dates';
import { ChartTooltip } from './ChartTooltip';
import { formatAxisDay, axisReaisFormatter } from './format';
import { useChartTheme, useHideValues } from '@/components/charts/theme';

export interface ForecastChartProps {
  points: ForecastPoint[];
  /** Altura fixa (px), já incluindo a faixa do eixo X. */
  height?: number;
}

/** Saldo diário projetado até o fim do mês (área de uma série, em azul "saldo"). */
export function ForecastChart({ points, height = 200 }: ForecastChartProps) {
  const t = useChartTheme();
  const hidden = useHideValues();
  const crossesZero = points.some((p) => p.balance < 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={t.grid} />
        <XAxis
          dataKey="date"
          tickFormatter={formatAxisDay}
          tick={{ fill: t.tick, fontSize: 11 }}
          axisLine={{ stroke: t.axis }}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis
          className="money"
          tickFormatter={axisReaisFormatter(hidden)}
          tick={{ fill: t.tick, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip
          cursor={{ stroke: t.axis, strokeWidth: 1 }}
          content={(p) => (
            <ChartTooltip active={p.active} payload={p.payload} label={p.label} formatLabel={formatDateBR} />
          )}
        />
        {crossesZero && <ReferenceLine y={0} stroke={t.danger} strokeWidth={1} />}
        <Area
          type="monotone"
          dataKey="balance"
          name="Saldo previsto"
          stroke={t.balance}
          strokeWidth={2}
          fill={t.balance}
          fillOpacity={0.1}
          dot={false}
          activeDot={{ r: 4, fill: t.balance, stroke: t.surface, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
