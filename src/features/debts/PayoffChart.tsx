import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBRLCompact } from '@/domain/money';
import {
  ChartDataTable,
  ChartFrame,
  ChartTooltipBox,
  type TooltipRow,
} from '@/components/charts/ChartParts';
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
import { STRATEGY_META, yearlyIndices, type PayoffChartRow } from './debt-utils';

const SERIES = [
  { key: 'avalanche', label: STRATEGY_META.avalanche.name, color: SERIES_COLORS.primary },
  { key: 'snowball', label: STRATEGY_META.snowball.name, color: SERIES_COLORS.secondary },
] as const;

/** Saldo total das dívidas mês a mês nas duas estratégias (linhas). */
export function PayoffChart({ rows, hideValues }: { rows: PayoffChartRow[]; hideValues: boolean }) {
  const indices = yearlyIndices(rows.length);
  const identical = rows.every((r) => r.avalanche === r.snowball);
  return (
    <ChartFrame
      label="Saldo total das dívidas ao longo do tempo: Avalanche e Bola de neve"
      legend={SERIES.map((s) => ({ label: s.label, color: s.color }))}
      height={260}
      footer={
        <>
          {identical && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              As duas estratégias têm o mesmo resultado aqui, por isso as linhas se sobrepõem.
            </p>
          )}
          <ChartDataTable
            caption="Saldo total das dívidas por estratégia"
            columns={['Mês', STRATEGY_META.avalanche.name, STRATEGY_META.snowball.name]}
            rows={indices.map((i) => ({
              key: String(i),
              label: i === 0 ? `${rows[i].label} (hoje)` : `${rows[i].label} (${formatDuration(i)})`,
              values: [rows[i].avalanche, rows[i].snowball],
            }))}
          />
        </>
      }
    >
      <LineChart
        data={rows}
        responsive
        style={{ width: '100%', height: '100%' }}
        margin={{ top: 8, right: 24, bottom: 0, left: 0 }}
      >
        <CartesianGrid vertical={false} stroke={CHART_GRID} />
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: CHART_AXIS }}
          minTickGap={24}
          interval="preserveStartEnd"
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
            const row = active ? activeRow<PayoffChartRow>(payload) : undefined;
            if (!row) return null;
            const items: TooltipRow[] = [];
            for (const s of SERIES) {
              const value = row[s.key];
              if (value !== null) items.push({ label: s.label, color: s.color, value });
            }
            return (
              <ChartTooltipBox
                title={
                  row.month === 0
                    ? `${row.label} · hoje`
                    : `${row.label} · daqui a ${formatDuration(row.month)}`
                }
                rows={items}
              />
            );
          }}
        />
        {SERIES.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 4, fill: s.color, stroke: CHART_SURFACE, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ChartFrame>
  );
}
