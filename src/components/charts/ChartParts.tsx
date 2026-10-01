import type { ReactNode } from 'react';
import { Money, cn } from '@/components/ui';
import type { Cents } from '@/domain/types';
import { CHART_VARS_CLASS } from './chart-theme';

export interface SeriesKey {
  label: string;
  /** Cor (normalmente uma variável CSS de chart-theme). */
  color: string;
}

/**
 * Contêiner de gráfico: define as variáveis de cor (claro/escuro), a legenda (para 2+ séries)
 * e reserva a altura do gráfico incluindo o eixo X.
 */
export function ChartFrame({
  label,
  legend,
  height = 256,
  children,
  footer,
  className,
}: {
  /** Descrição acessível do gráfico. */
  label: string;
  legend?: SeriesKey[];
  height?: number;
  children: ReactNode;
  /** Normalmente a tabela de dados (<ChartDataTable>). */
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn(CHART_VARS_CLASS, 'm-0', className)} aria-label={label}>
      {legend && legend.length > 1 && <ChartLegend items={legend} />}
      <div style={{ height }} className="w-full">
        {children}
      </div>
      {footer}
    </figure>
  );
}

/** Legenda com chave de linha (2px) — a identidade nunca depende só da cor: o texto nomeia a série. */
export function ChartLegend({ items }: { items: SeriesKey[] }) {
  return (
    <ul
      className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300"
      aria-label="Legenda"
    >
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-0.5 w-4 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export interface TooltipRow {
  label: string;
  color: string;
  value: Cents;
}

/** Conteúdo do tooltip: o valor lidera (negrito), o nome da série vem depois. */
export function ChartTooltipBox({
  title,
  rows,
  note,
}: {
  title: ReactNode;
  rows: TooltipRow[];
  note?: ReactNode;
}) {
  return (
    <div className="min-w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <p className="mb-1 font-medium text-slate-500 dark:text-slate-400">{title}</p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-0.5 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: row.color }}
            />
            <Money value={row.value} className="font-semibold text-slate-900 dark:text-white" />
            <span className="text-slate-500 dark:text-slate-400">{row.label}</span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-1 text-slate-500 dark:text-slate-400">{note}</p>}
    </div>
  );
}

/** Tabela equivalente ao gráfico (acessível sem passar o mouse), recolhida por padrão. */
export function ChartDataTable({
  summary = 'Ver dados em tabela',
  caption,
  columns,
  rows,
}: {
  summary?: string;
  caption: string;
  columns: string[];
  rows: { key: string; label: ReactNode; values: (Cents | null)[] }[];
}) {
  return (
    <details className="group mt-3 text-sm">
      <summary className="cursor-pointer select-none rounded-lg py-1 text-sm font-medium text-brand-700 hover:underline dark:text-brand-400">
        {summary}
      </summary>
      <div className="relative mt-2 max-h-72 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-xs sm:text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c}
                  scope="col"
                  className={cn(
                    'px-3 py-2 font-medium text-slate-600 dark:text-slate-300',
                    i > 0 && 'text-right',
                  )}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className="px-3 py-1.5 font-normal text-slate-700 dark:text-slate-300">
                  {row.label}
                </th>
                {row.values.map((v, i) => (
                  <td key={columns[i + 1] ?? i} className="px-3 py-1.5 text-right">
                    {v === null ? <span className="text-slate-400">—</span> : <Money value={v} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
