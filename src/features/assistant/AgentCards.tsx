import type { ReactNode } from 'react';
import type { AgentCard, CardTone } from '@/agent';
import { cn, Money, ProgressBar, type ProgressTone } from '@/components/ui';
import { MiniChart } from './MiniChart';
import { InlineText } from './RichText';

const VALUE_TONE: Record<CardTone, string> = {
  positive: 'text-emerald-700 dark:text-emerald-400',
  negative: 'text-rose-700 dark:text-rose-400',
  warning: 'text-amber-700 dark:text-amber-400',
  neutral: 'text-slate-900 dark:text-slate-100',
};

const DOT_TONE: Record<CardTone, string> = {
  positive: 'bg-emerald-500',
  negative: 'bg-rose-500',
  warning: 'bg-amber-500',
  neutral: 'bg-slate-300 dark:bg-slate-600',
};

const PROGRESS_TONE: Record<CardTone, ProgressTone> = {
  positive: 'positive',
  negative: 'negative',
  warning: 'warning',
  neutral: 'brand',
};

function CardFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h3>
      {children}
    </section>
  );
}

/** Um card estruturado da resposta do agente. */
export function AgentCardView({ card }: { card: AgentCard }) {
  switch (card.type) {
    case 'stat':
      return (
        <CardFrame title={card.title}>
          <p className={cn('text-xl font-bold', VALUE_TONE[card.tone ?? 'neutral'])}>
            <InlineText text={card.value} />
          </p>
          {card.hint && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              <InlineText text={card.hint} />
            </p>
          )}
        </CardFrame>
      );
    case 'list':
      return (
        <CardFrame title={card.title}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {card.items.map((item, i) => (
              <li key={`${item.label}-${i}`} className="flex items-start gap-2 py-1.5 first:pt-0 last:pb-0">
                {item.tone && (
                  <span aria-hidden className={cn('mt-1.5 size-2 shrink-0 rounded-full', DOT_TONE[item.tone])} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-slate-800 dark:text-slate-200">
                    <InlineText text={item.label} />
                  </p>
                  {item.hint && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      <InlineText text={item.hint} />
                    </p>
                  )}
                </div>
                <span className={cn('shrink-0 text-right font-medium', VALUE_TONE[item.tone ?? 'neutral'])}>
                  <InlineText text={item.value} />
                </span>
              </li>
            ))}
          </ul>
        </CardFrame>
      );
    case 'progress':
      return (
        <CardFrame title={card.title}>
          <ul className="space-y-3">
            {card.items.map((item, i) => {
              const ratio = item.target > 0 ? item.current / item.target : item.current > 0 ? 1 : 0;
              return (
                <li key={`${item.label}-${i}`}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{item.label}</span>
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      <Money value={item.current} /> de <Money value={item.target} />
                    </span>
                  </div>
                  <ProgressBar
                    value={ratio}
                    tone={item.tone ? PROGRESS_TONE[item.tone] : 'brand'}
                    label={`${item.label}: ${Math.round(Math.min(Math.max(ratio, 0), 1) * 100)}%`}
                  />
                  {item.hint && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      <InlineText text={item.hint} />
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </CardFrame>
      );
    case 'chart':
      return (
        <CardFrame title={card.title}>
          <MiniChart kind={card.chart} title={card.title} data={card.data} />
        </CardFrame>
      );
  }
}
