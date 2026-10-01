import { useId } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts';
import type { GrowthPoint } from '@/analytics';
import { Money } from '@/components/ui';
import { formatBRLCompact } from '@/domain/money';
import { plural } from '@/domain/text';
import { ChartDataTable, ChartFrame, ChartTooltipBox } from '@/components/charts/ChartParts';
import {
  AXIS_TICK,
  CHART_AXIS,
  CHART_GRID,
  CHART_SURFACE,
  CROSSHAIR,
  SERIES_COLORS,
  activeRow,
} from '@/components/charts/chart-theme';
import { formatDuration } from '@/domain/format';
import { yearTicks, yearlyPoints } from './simulator-utils';

const TOTAL = { label: 'Total acumulado', color: SERIES_COLORS.primary };
const INVESTED = { label: 'Total investido', color: SERIES_COLORS.secondary };

function tickLabel(month: number, totalMonths: number): string {
  if (month === 0) return 'hoje';
  if (totalMonths < 12) return `${month}m`;
  return plural(month / 12, 'ano', 'anos');
}

/** Investido x total acumulado ao longo do prazo. */
export function CompoundChart({ points, hideValues }: { points: GrowthPoint[]; hideValues: boolean }) {
  const gradientId = `compound-fill${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const totalMonths = points[points.length - 1]?.month ?? 0;
  const yearly = yearlyPoints(points);
  return (
    <ChartFrame
      label="Total investido e total acumulado com juros ao longo do tempo"
      legend={[TOTAL, INVESTED]}
      height={260}
      footer={
        <ChartDataTable
          caption="Evolução por ano"
          columns={['Prazo', 'Investido', 'Juros', 'Total']}
          rows={yearly.map((p) => ({
            key: String(p.month),
            label: p.month === 0 ? 'Início' : formatDuration(p.month),
            values: [p.contributed, p.interest, p.total],
          }))}
        />
      }
    >
      <ComposedChart
        data={points}
        responsive
        style={{ width: '100%', height: '100%' }}
        margin={{ top: 8, right: 24, bottom: 0, left: 0 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TOTAL.color} stopOpacity={0.14} />
            <stop offset="100%" stopColor={TOTAL.color} stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={CHART_GRID} />
        <XAxis
          dataKey="month"
          type="number"
          domain={[0, totalMonths]}
          ticks={yearTicks(totalMonths)}
          tickFormatter={(m: number) => tickLabel(m, totalMonths)}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: CHART_AXIS }}
          minTickGap={16}
        />
        <YAxis
          tick={hideValues ? false : AXIS_TICK}
          tickFormatter={(v: number) => formatBRLCompact(v)}
          width={hideValues ? 8 : 'auto'}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={CROSSHAIR}
          content={({ active, payload }) => {
            const row = active ? activeRow<GrowthPoint>(payload) : undefined;
            if (!row) return null;
            return (
              <ChartTooltipBox
                title={row.month === 0 ? 'Início' : `Após ${formatDuration(row.month)}`}
                rows={[
                  { ...TOTAL, value: row.total },
                  { ...INVESTED, value: row.contributed },
                ]}
                note={
                  <>
                    Juros: <Money value={row.interest} />
                  </>
                }
              />
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="total"
          name={TOTAL.label}
          stroke={TOTAL.color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 4, fill: TOTAL.color, stroke: CHART_SURFACE, strokeWidth: 2 }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="contributed"
          name={INVESTED.label}
          stroke={INVESTED.color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: INVESTED.color, stroke: CHART_SURFACE, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartFrame>
  );
}
