import type { AgentCard, CardTone } from '@/agent';
import { Card, CardHeader, cn, Money, ProgressBar, StatCard } from '@/components/ui';
import { formatPercent } from '@/domain/money';
import { CategoryDonut } from '../dashboard/charts/CategoryDonut';
import { MonthlyBarChart } from '../dashboard/charts/MonthlyBarChart';
import { useChartTheme } from '../dashboard/charts/theme';
import type { DonutSlice } from '../dashboard/dashboard-utils';
import { MoneyText } from '../dashboard/MoneyText';

const TONE_TEXT: Record<CardTone, string> = {
  positive: 'text-emerald-700 dark:text-emerald-400',
  negative: 'text-rose-700 dark:text-rose-400',
  warning: 'text-amber-700 dark:text-amber-400',
  neutral: 'text-slate-500 dark:text-slate-400',
};

type ChartCard = Extract<AgentCard, { type: 'chart' }>;

const identity = (s: string) => s;

function ChartCardView({ card }: { card: ChartCard }) {
  const t = useChartTheme();
  if (card.chart === 'bar') {
    return (
      <figure aria-label={card.title}>
        <MonthlyBarChart
          data={card.data.map((d) => ({ key: d.label, total: d.value }))}
          name={card.title}
          formatTick={identity}
          formatLabel={identity}
          height={200}
        />
      </figure>
    );
  }
  const total = card.data.reduce((s, d) => s + Math.max(0, d.value), 0);
  const slices: DonutSlice[] = card.data
    .filter((d) => d.value > 0)
    .map((d) => ({
      key: d.label,
      label: d.label,
      icon: '',
      color: d.color ?? t.muted,
      value: d.value,
      share: total > 0 ? d.value / total : 0,
    }));
  return (
    <div>
      <figure aria-label={card.title}>
        <CategoryDonut slices={slices} total={total} centerLabel="Total" height={180} />
      </figure>
      <ul className="mt-3 space-y-1.5" aria-label={`Legenda: ${card.title}`}>
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-sm">
            <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{s.label}</span>
            <Money value={s.value} className="font-medium" />
            <span className="tabular w-12 text-right text-xs text-slate-500 dark:text-slate-400">
              {formatPercent(s.share)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Renderiza os cards estruturados do relatório do agente (stats em linha; listas, progresso e gráficos em grade). */
export function AgentCards({ cards }: { cards: AgentCard[] }) {
  const stats = cards.filter((c): c is Extract<AgentCard, { type: 'stat' }> => c.type === 'stat');
  const others = cards.filter((c) => c.type !== 'stat');
  return (
    <div className="space-y-4">
      {stats.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {stats.map((c) => (
            <StatCard
              key={c.title}
              label={c.title}
              value={<MoneyText text={c.value} />}
              hint={c.hint ? <MoneyText text={c.hint} /> : undefined}
              tone={c.tone ?? 'neutral'}
            />
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {others.map((card, i) => (
            <Card key={`${card.type}-${card.title}-${i}`}>
              <CardHeader title={card.title} className="mb-3" />
              {card.type === 'list' && (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {card.items.map((item) => (
                    <li key={item.label} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{item.label}</span>
                      <span className="flex shrink-0 items-baseline gap-2">
                        <span className={cn('font-medium', item.tone ? TONE_TEXT[item.tone] : 'text-slate-900 dark:text-slate-100')}>
                          <MoneyText text={item.value} />
                        </span>
                        {item.hint && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            <MoneyText text={item.hint} />
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {card.type === 'progress' && (
                <ul className="space-y-3">
                  {card.items.map((item) => (
                    <li key={item.label}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{item.label}</span>
                        <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                          <Money value={item.current} /> de <Money value={item.target} />
                        </span>
                      </div>
                      <ProgressBar
                        value={item.target > 0 ? item.current / item.target : item.current > 0 ? Infinity : 0}
                        label={item.label}
                      />
                      {item.hint && (
                        <p className={cn('mt-0.5 text-xs', item.tone ? TONE_TEXT[item.tone] : 'text-slate-500')}>
                          <MoneyText text={item.hint} />
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {card.type === 'chart' && <ChartCardView card={card} />}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
