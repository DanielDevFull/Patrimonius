import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMonthLong, formatMonthShort } from '@/domain/dates';
import { capitalize } from '@/domain/text';
import type { Cents } from '@/domain/types';
import { ChartTooltip } from './ChartTooltip';
import { axisReaisFormatter } from './format';
import { useChartTheme, useHideValues } from '@/components/charts/theme';

export interface BarDatum {
  /** Chave do eixo X (por padrão um MonthKey 'YYYY-MM'). */
  key: string;
  /** Valor em centavos. */
  total: Cents;
}

export interface MonthlyBarChartProps {
  data: BarDatum[];
  /** Nome da série (aparece no tooltip). O título do card já identifica a série, então não há legenda. */
  name: string;
  /** Cor da série (ex.: a cor da categoria). Padrão: azul. */
  color?: string;
  height?: number;
  /** Rótulo do eixo X (padrão: 'out/26'). */
  formatTick?: (key: string) => string;
  /** Título do tooltip (padrão: 'Outubro de 2026'). */
  formatLabel?: (key: string) => string;
}

const monthTitle = (m: string) => capitalize(formatMonthLong(m));

/** Barras de uma única série (ex.: tendência mensal de uma categoria). */
export function MonthlyBarChart({
  data,
  name,
  color,
  height = 220,
  formatTick = formatMonthShort,
  formatLabel = monthTitle,
}: MonthlyBarChartProps) {
  const t = useChartTheme();
  const hidden = useHideValues();
  const fill = color ?? t.balance;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={t.grid} />
        <XAxis
          dataKey="key"
          tickFormatter={formatTick}
          tick={{ fill: t.tick, fontSize: 11 }}
          axisLine={{ stroke: t.axis }}
          tickLine={false}
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
          cursor={{ fill: t.cursor }}
          content={(p) => (
            <ChartTooltip active={p.active} payload={p.payload} label={p.label} formatLabel={formatLabel} />
          )}
        />
        <Bar dataKey="total" name={name} fill={fill} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
