import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMonthLong, formatMonthShort } from '@/domain/dates';
import { capitalize } from '@/domain/text';
import type { Cents, MonthKey } from '@/domain/types';
import { ChartTooltip } from './ChartTooltip';
import { axisReaisFormatter } from './format';
import { useChartTheme, useHideValues } from './theme';

export interface FlowChartRow {
  month: MonthKey;
  income: Cents;
  expense: Cents;
  /** Saldo acumulado no período (opcional — desenhado como linha no mesmo eixo, mesma unidade). */
  accumulated?: Cents;
}

export interface IncomeExpenseChartProps {
  rows: FlowChartRow[];
  showAccumulated?: boolean;
  height?: number;
}

function LegendKey({ color, label, kind }: { color: string; label: string; kind: 'bar' | 'line' }) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        aria-hidden
        className={kind === 'bar' ? 'size-2.5 rounded-sm' : 'h-0.5 w-4 rounded-full'}
        style={{ backgroundColor: color }}
      />
      {label}
    </li>
  );
}

const monthTitle = (m: string) => capitalize(formatMonthLong(m));

/** Barras de receitas x despesas por mês (+ linha opcional de saldo acumulado), com legenda visível. */
export function IncomeExpenseChart({ rows, showAccumulated = false, height = 220 }: IncomeExpenseChartProps) {
  const t = useChartTheme();
  const hidden = useHideValues();
  const hasNegative = showAccumulated && rows.some((r) => (r.accumulated ?? 0) < 0);
  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300" aria-label="Legenda">
        <LegendKey color={t.income} label="Receitas" kind="bar" />
        <LegendKey color={t.expense} label="Despesas" kind="bar" />
        {showAccumulated && <LegendKey color={t.balance} label="Saldo acumulado" kind="line" />}
      </ul>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="24%">
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthShort}
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
              <ChartTooltip active={p.active} payload={p.payload} label={p.label} formatLabel={monthTitle} />
            )}
          />
          {hasNegative && <ReferenceLine y={0} stroke={t.axis} />}
          <Bar
            dataKey="income"
            name="Receitas"
            fill={t.income}
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          />
          <Bar
            dataKey="expense"
            name="Despesas"
            fill={t.expense}
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          />
          {showAccumulated && (
            <Line
              type="monotone"
              dataKey="accumulated"
              name="Saldo acumulado"
              stroke={t.balance}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={{ r: 4, fill: t.balance, stroke: t.surface, strokeWidth: 2 }}
              activeDot={{ r: 5, fill: t.balance, stroke: t.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
