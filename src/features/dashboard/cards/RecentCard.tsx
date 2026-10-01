import { ArrowLeftRight, Receipt } from 'lucide-react';
import { useMemo } from 'react';
import { ROUTES } from '@/app/navigation';
import { Badge, Card, CardHeader, Money } from '@/components/ui';
import { formatDateRelative } from '@/domain/dates';
import type { Account, Category, ISODate, Transaction } from '@/domain/types';
import { displayAmount } from '../dashboard-utils';
import { CardLink } from './shared';

export interface RecentCardProps {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  today: ISODate;
  className?: string;
}

/** Últimos lançamentos (já filtrados/ordenados pelo chamador). */
export function RecentCard({ transactions, categories, accounts, today, className }: RecentCardProps) {
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  return (
    <Card className={className}>
      <section aria-labelledby="dashboard-recent-title">
        <CardHeader
          icon={<Receipt size={18} aria-hidden />}
          title={<span id="dashboard-recent-title">Últimos lançamentos</span>}
          actions={<CardLink to={ROUTES.transactions}>Ver todos</CardLink>}
        />
        {transactions.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum lançamento até hoje.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label="Últimos lançamentos">
            {transactions.map((tx) => {
              const category = tx.categoryId ? categoryById.get(tx.categoryId) : undefined;
              const account = accountById.get(tx.accountId);
              const target = tx.toAccountId ? accountById.get(tx.toAccountId) : undefined;
              const isTransfer = tx.type === 'transferencia';
              return (
                <li key={tx.id} className="flex items-center gap-3 py-2.5">
                  <div
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-base dark:bg-slate-800"
                  >
                    {isTransfer ? <ArrowLeftRight size={16} className="text-slate-500" /> : (category?.icon ?? '📦')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {tx.description || category?.name || 'Lançamento'}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {formatDateRelative(tx.date, today)}
                      {' · '}
                      {isTransfer
                        ? `${account?.name ?? 'Conta removida'} → ${target?.name ?? 'Conta removida'}`
                        : `${category?.name ?? 'Sem categoria'} · ${account?.name ?? 'Conta removida'}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    {isTransfer ? (
                      <Money value={tx.amount} className="text-sm font-semibold text-slate-600 dark:text-slate-300" />
                    ) : (
                      <Money value={displayAmount(tx)} signed colored className="text-sm font-semibold" />
                    )}
                    {tx.status === 'pendente' && <Badge tone="warning">Pendente</Badge>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Card>
  );
}
