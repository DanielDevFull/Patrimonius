import { useId } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMonthLong } from '@/domain/dates';
import { formatBRLCompact } from '@/domain/money';
import { capitalize } from '@/domain/text';
import { ChartDataTable, ChartFrame, ChartTooltipBox } from '@/features/simulators/shared/ChartParts';
import {
  AXIS_TICK,
  CHART_AXIS,
  CHART_GRID,
  CHART_SURFACE,
  CROSSHAIR,
  SERIES_COLORS,
  activeRow,
} from '@/features/simulators/shared/chart-theme';
import type { HistoryRow } from './networth-utils';

const COLOR = SERIES_COLORS.brand;

/** Evolução do patrimônio líquido (área de série única) + tabela com ativos e passivos. */
export function NetWorthChart({ rows, hideValues }: { rows: HistoryRow[]; hideValues: boolean }) {
  const gradientId = `networth-fill${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const hasNegative = rows.some((r) => r.netWorth < 0);
  return (
    <ChartFrame
      label="Evolução do patrimônio líquido nos últimos 12 meses"
      height={240}
      footer={
        <ChartDataTable
          caption="Patrimônio por mês"
          columns={['Mês', 'Ativos', 'Passivos', 'Patrimônio líquido']}
          rows={[...rows].reverse().map((r) => ({
            key: r.month,
            label: r.label,
            values: [r.totalAssets, r.totalLiabilities, r.netWorth],
          }))}
        />
      }
    >
      <AreaChart
        data={rows}
        responsive
        style={{ width: '100%', height: '100%' }}
        margin={{ top: 8, right: 24, bottom: 0, left: 0 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR} stopOpacity={0.14} />
            <stop offset="100%" stopColor={COLOR} stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={CHART_GRID} />
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: CHART_AXIS }}
          minTickGap={16}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={hideValues ? false : AXIS_TICK}
          tickFormatter={(v: number) => formatBRLCompact(v)}
          width={hideValues ? 8 : 'auto'}
          axisLine={false}
          tickLine={false}
        />
        {hasNegative && <ReferenceLine y={0} stroke={CHART_AXIS} />}
        <Tooltip
          cursor={CROSSHAIR}
          content={({ active, payload }) => {
            const row = active ? activeRow<HistoryRow>(payload) : undefined;
            if (!row) return null;
            return (
              <ChartTooltipBox
                title={capitalize(formatMonthLong(row.month))}
                rows={[{ label: 'Patrimônio líquido', color: COLOR, value: row.netWorth }]}
              />
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="netWorth"
          name="Patrimônio líquido"
          stroke={COLOR}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 4, fill: COLOR, stroke: CHART_SURFACE, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartFrame>
  );
}
