import { ArrowLeftRight, CheckCircle2, Copy, Repeat, RotateCcw, Trash2 } from 'lucide-react';
import { memo } from 'react';
import { Badge, Money, ActionsMenu } from '@/components/ui';
import type { Account, Category, ISODate, Transaction } from '@/domain/types';

export interface TransactionRowProps {
  tx: Transaction;
  category: Category | undefined;
  account: Account | undefined;
  toAccount: Account | undefined;
  today: ISODate;
  onEdit: (tx: Transaction) => void;
  onToggleStatus: (tx: Transaction) => void;
  onDuplicate: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}

function TransactionRowBase({
  tx,
  category,
  account,
  toAccount,
  today,
  onEdit,
  onToggleStatus,
  onDuplicate,
  onDelete,
}: TransactionRowProps) {
  const isTransfer = tx.type === 'transferencia';
  const pending = tx.status === 'pendente';
  const overdue = pending && tx.date < today;
  const color = category?.color ?? '#94a3b8';
  const secondary = isTransfer
    ? `${account?.name ?? 'Conta removida'} → ${toAccount?.name ?? 'Conta removida'}`
    : `${category?.name ?? 'Sem categoria'} • ${account?.name ?? 'Conta removida'}`;

  return (
    <li className="flex items-center gap-1 pr-1">
      <button
        type="button"
        onClick={() => onEdit(tx)}
        title="Editar lançamento"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
      >
        {isTransfer ? (
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            <ArrowLeftRight size={18} />
          </span>
        ) : (
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-lg"
            style={{ backgroundColor: `${color}26` }}
          >
            {category?.icon ?? '❔'}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
            {tx.description}
          </span>
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="truncate">{secondary}</span>
            {pending && (
              <Badge tone={overdue ? 'negative' : 'warning'}>
                {overdue ? 'Pendente · atrasado' : 'Pendente'}
              </Badge>
            )}
            {tx.installment && (
              <Badge tone="neutral">
                <span className="sr-only">Parcela </span>
                {tx.installment.number}/{tx.installment.total}
              </Badge>
            )}
            {tx.recurringId && (
              <span
                title="Gerado por recorrência"
                className="inline-flex items-center text-brand-700 dark:text-brand-400"
              >
                <Repeat size={13} aria-hidden />
                <span className="sr-only">Recorrente</span>
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 text-right text-sm font-semibold">
          {isTransfer ? (
            <Money value={tx.amount} className="text-slate-600 dark:text-slate-300" />
          ) : (
            <Money value={tx.type === 'receita' ? tx.amount : -tx.amount} signed colored />
          )}
        </span>
      </button>
      <ActionsMenu
        label={`Ações de ${tx.description}`}
        items={[
          pending
            ? {
                label: tx.type === 'receita' ? 'Marcar como recebido' : 'Marcar como pago',
                icon: <CheckCircle2 size={16} aria-hidden />,
                onSelect: () => onToggleStatus(tx),
              }
            : {
                label: 'Marcar como pendente',
                icon: <RotateCcw size={16} aria-hidden />,
                onSelect: () => onToggleStatus(tx),
              },
          { label: 'Duplicar', icon: <Copy size={16} aria-hidden />, onSelect: () => onDuplicate(tx) },
          {
            label: 'Excluir',
            icon: <Trash2 size={16} aria-hidden />,
            onSelect: () => onDelete(tx),
            danger: true,
          },
        ]}
      />
    </li>
  );
}

/** Item da lista de lançamentos (memoizado: a lista pode ter milhares de itens). */
export const TransactionRow = memo(TransactionRowBase);
