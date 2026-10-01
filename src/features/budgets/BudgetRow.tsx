import { CircleCheck, CircleX, Pencil, Trash2, TriangleAlert } from 'lucide-react';
import { useId } from 'react';
import type { BudgetHealth, BudgetStatus } from '@/analytics';
import { Badge, IconButton, Money, ProgressBar } from '@/components/ui';
import { formatPercent } from '@/domain/money';
import { BUDGET_HEALTH_META } from './budget-utils';

const HEALTH_ICONS: Record<BudgetHealth, typeof CircleCheck> = {
  ok: CircleCheck,
  alerta: TriangleAlert,
  estourado: CircleX,
};

export interface BudgetRowProps {
  item: BudgetStatus;
  /** Mostra a projeção para o fim do mês (somente no mês corrente). */
  showProjection: boolean;
  onEdit: (item: BudgetStatus) => void;
  onRemove: (item: BudgetStatus) => void;
}

/** Linha de uma categoria com orçamento: gasto x orçado, barra de uso, restante/excedente e projeção. */
export function BudgetRow({ item, showProjection, onEdit, onRemove }: BudgetRowProps) {
  const headingId = useId();
  const meta = BUDGET_HEALTH_META[item.status];
  const HealthIcon = HEALTH_ICONS[item.status];
  const over = item.remaining < 0;
  const projectedOver = item.projected - item.budgeted;

  return (
    <li aria-labelledby={headingId} className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-lg"
          style={{ backgroundColor: `${item.color}26`, boxShadow: `inset 0 0 0 1px ${item.color}55` }}
        >
          {item.icon || '📦'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 id={headingId} className="truncate font-medium text-slate-900 dark:text-slate-100">
              {item.categoryName}
            </h3>
            <Badge tone={meta.tone}>
              <HealthIcon size={12} aria-hidden />
              {meta.label}
            </Badge>
            <Badge
              tone={item.isDefault ? 'neutral' : 'info'}
              className="whitespace-nowrap"
            >
              {item.isDefault ? 'Padrão' : 'Só este mês'}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
            <Money value={item.spent} /> <span className="text-slate-400">de</span>{' '}
            <Money value={item.budgeted} />
          </p>
        </div>
        <div className="-mr-1 flex shrink-0 items-center">
          <IconButton label={`Editar orçamento de ${item.categoryName}`} size="sm" onClick={() => onEdit(item)}>
            <Pencil size={16} aria-hidden />
          </IconButton>
          <IconButton
            label={`Remover orçamento de ${item.categoryName}`}
            size="sm"
            variant="danger"
            onClick={() => onRemove(item)}
          >
            <Trash2 size={16} aria-hidden />
          </IconButton>
        </div>
      </div>

      <ProgressBar
        // Limite zero com gasto (percent = Infinity): barra cheia em vermelho, como um orçamento estourado.
        value={Number.isFinite(item.percent) ? item.percent : 2}
        label={`Uso do orçamento de ${item.categoryName}`}
        className="mt-3"
      />

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        {over ? (
          <span className="font-medium text-rose-600 dark:text-rose-400">
            Excedeu <Money value={-item.remaining} />
          </span>
        ) : (
          <span className="text-slate-600 dark:text-slate-300">
            Restam <Money value={item.remaining} />
          </span>
        )}
        <span className="tabular text-slate-500 dark:text-slate-400">
          {Number.isFinite(item.percent) ? `${formatPercent(item.percent)} usado` : 'Limite zerado'}
        </span>
      </div>

      {showProjection && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Projeção para o fim do mês: <Money value={item.projected} />
          {!over && projectedOver > 0 && (
            <span className="text-amber-700 dark:text-amber-400">
              {' '}
              — no ritmo atual, deve passar <Money value={projectedOver} /> do limite
            </span>
          )}
        </p>
      )}
    </li>
  );
}
