import { ArchiveRestore, ArrowLeftRight, CalendarClock, Pencil, Scale, Trash2 } from 'lucide-react';
import { Badge, Button, Card, cn, Money, ProgressBar } from '@/components/ui';
import { formatDateShort } from '@/domain/dates';
import { ACCOUNT_TYPE_LABELS, type Account, type ISODate } from '@/domain/types';
import { ActionsMenu, type ActionsMenuItem } from '@/features/transactions/ActionsMenu';
import { cardInfo, type AccountBalanceView } from './account-utils';

export interface AccountCardProps {
  account: Account;
  balance: AccountBalanceView;
  today: ISODate;
  onEdit: (account: Account) => void;
  onAdjust: (account: Account) => void;
  onTransfer: (account: Account) => void;
  onPayInvoice: (account: Account, amount: number) => void;
  onDelete: (account: Account) => void;
  onRestore: (account: Account) => void;
}

export function AccountCard({
  account,
  balance,
  today,
  onEdit,
  onAdjust,
  onTransfer,
  onPayInvoice,
  onDelete,
  onRestore,
}: AccountCardProps) {
  const isCard = account.type === 'cartao_credito';
  const card = isCard ? cardInfo(account, balance.current, today) : null;
  const projectedInvoice = Math.max(0, -balance.projected);
  const headingId = `conta-${account.id}`;

  const menu: ActionsMenuItem[] = account.archived
    ? [
        {
          label: 'Reativar',
          icon: <ArchiveRestore size={16} aria-hidden />,
          onSelect: () => onRestore(account),
        },
        { label: 'Editar', icon: <Pencil size={16} aria-hidden />, onSelect: () => onEdit(account) },
        {
          label: 'Excluir',
          icon: <Trash2 size={16} aria-hidden />,
          onSelect: () => onDelete(account),
          danger: true,
        },
      ]
    : [
        { label: 'Editar', icon: <Pencil size={16} aria-hidden />, onSelect: () => onEdit(account) },
        { label: 'Ajustar saldo', icon: <Scale size={16} aria-hidden />, onSelect: () => onAdjust(account) },
        {
          label: 'Transferir',
          icon: <ArrowLeftRight size={16} aria-hidden />,
          onSelect: () => onTransfer(account),
        },
        {
          label: 'Excluir ou arquivar',
          icon: <Trash2 size={16} aria-hidden />,
          onSelect: () => onDelete(account),
          danger: true,
        },
      ];

  return (
    <Card className={cn('flex flex-col gap-3', account.archived && 'opacity-75')}>
      <section aria-labelledby={headingId} className="flex flex-1 flex-col gap-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-xl"
            style={{ backgroundColor: `${account.color}26`, boxShadow: `inset 0 0 0 1px ${account.color}55` }}
          >
            {account.icon || '🏦'}
          </span>
          <div className="min-w-0 flex-1">
            <h3 id={headingId} className="truncate font-semibold text-slate-900 dark:text-slate-100">
              {account.name}
            </h3>
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              {ACCOUNT_TYPE_LABELS[account.type]}
              {!account.includeInNetWorth && <Badge>Fora do patrimônio</Badge>}
              {account.archived && <Badge tone="warning">Arquivada</Badge>}
            </p>
          </div>
          <ActionsMenu label={`Ações da conta ${account.name}`} items={menu} />
        </div>

        {card ? (
          <div className="space-y-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Fatura atual
              </p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                <Money
                  value={card.invoice}
                  className={card.invoice > 0 ? 'text-rose-600 dark:text-rose-400' : undefined}
                />
              </p>
              {card.credit > 0 && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  Crédito a favor: <Money value={card.credit} />
                </p>
              )}
            </div>
            {card.limit !== null && card.usedRatio !== null && card.available !== null && (
              <div className="space-y-1">
                <ProgressBar value={card.usedRatio} label={`Limite usado de ${account.name}`} />
                <div className="flex flex-wrap justify-between gap-x-3 text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    Usado <Money value={card.invoice} /> de <Money value={card.limit} />
                  </span>
                  <span>
                    Disponível <Money value={card.available} colored={card.available < 0} />
                  </span>
                </div>
              </div>
            )}
            {(account.closingDay || account.dueDay) && (
              <p className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <CalendarClock size={14} aria-hidden className="shrink-0" />
                <span>
                  {account.closingDay && card.nextClosing && (
                    <>
                      Fecha dia {account.closingDay} ({formatDateShort(card.nextClosing)})
                    </>
                  )}
                  {account.closingDay && account.dueDay && ' · '}
                  {account.dueDay && card.nextDue && (
                    <>
                      Vence dia {account.dueDay} ({formatDateShort(card.nextDue)})
                    </>
                  )}
                </span>
              </p>
            )}
            {projectedInvoice !== card.invoice && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Fatura prevista até o fim do mês: <Money value={projectedInvoice} />
              </p>
            )}
          </div>
        ) : (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Saldo atual
            </p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              <Money value={balance.current} colored={balance.current < 0} />
            </p>
            {balance.projected !== balance.current && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Previsto no fim do mês (com pendentes):{' '}
                <Money value={balance.projected} colored={balance.projected < 0} />
              </p>
            )}
          </div>
        )}

        <div className="mt-auto flex flex-wrap gap-2">
          {account.archived ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<ArchiveRestore size={14} />}
              onClick={() => onRestore(account)}
            >
              Reativar
            </Button>
          ) : (
            <>
              {card && (
                <Button
                  size="sm"
                  disabled={card.invoice <= 0}
                  onClick={() => onPayInvoice(account, card.invoice)}
                  aria-label={`Pagar fatura de ${account.name}`}
                >
                  Pagar fatura
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                icon={<Scale size={14} />}
                onClick={() => onAdjust(account)}
                aria-label={`Ajustar saldo de ${account.name}`}
              >
                Ajustar saldo
              </Button>
            </>
          )}
        </div>
      </section>
    </Card>
  );
}
