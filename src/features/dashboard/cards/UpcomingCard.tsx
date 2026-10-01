import { CalendarClock, Check } from 'lucide-react';
import { useState } from 'react';
import type { UpcomingItem } from '@/analytics';
import { ROUTES } from '@/app/navigation';
import { Badge, Button, Card, CardHeader, cn, Money, useToast } from '@/components/ui';
import { setTransactionStatus } from '@/db/repo';
import { formatDateRelative, formatDateShort } from '@/domain/dates';
import { plural } from '@/domain/text';
import type { ISODate } from '@/domain/types';
import { CardLink } from './shared';

/** Horizonte (dias) dos próximos compromissos. */
export const UPCOMING_DAYS = 7;
const MAX_ITEMS = 6;

function itemKey(item: UpcomingItem): string {
  return item.transactionId ?? `${item.recurringId ?? 'item'}:${item.date}:${item.description}`;
}

export interface UpcomingCardProps {
  items: UpcomingItem[];
  today: ISODate;
  className?: string;
}

/** Contas a pagar e a receber nos próximos 7 dias (inclui pendentes vencidos). */
export function UpcomingCard({ items, today, className }: UpcomingCardProps) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const shown = items.slice(0, MAX_ITEMS);
  const overdue = items.filter((i) => i.overdue).length;

  async function markPaid(item: UpcomingItem) {
    if (!item.transactionId) return;
    setBusy(item.transactionId);
    try {
      await setTransactionStatus(item.transactionId, 'pago');
      toast(item.type === 'receita' ? 'Receita marcada como recebida.' : 'Despesa marcada como paga.', 'success');
    } catch {
      toast('Não foi possível atualizar o lançamento.', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className={className}>
      <section aria-labelledby="dashboard-upcoming-title">
        <CardHeader
          icon={<CalendarClock size={18} aria-hidden />}
          title={<span id="dashboard-upcoming-title">Próximos compromissos</span>}
          subtitle={
            overdue > 0
              ? `Próximos ${UPCOMING_DAYS} dias · ${plural(overdue, 'vencido', 'vencidos')}`
              : `Próximos ${UPCOMING_DAYS} dias`
          }
          actions={<CardLink to={ROUTES.recurring}>Recorrências</CardLink>}
        />
        {shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Nada a pagar ou receber nos próximos {UPCOMING_DAYS} dias.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {shown.map((item) => {
              const rel = formatDateRelative(item.date, today);
              const isWord = rel === 'hoje' || rel === 'amanhã' || rel === 'ontem';
              return (
                <li key={itemKey(item)} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                  <div
                    className={cn(
                      'flex w-12 shrink-0 flex-col items-center rounded-lg py-1 text-center text-[11px] font-semibold leading-tight',
                      item.overdue
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                    )}
                  >
                    {isWord ? rel : formatDateShort(item.date)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{item.description}</p>
                    <div className="flex flex-wrap items-center gap-1">
                      {item.overdue && <Badge tone="negative">Vencido</Badge>}
                      {item.source === 'recorrencia' && <Badge tone="neutral">Recorrência</Badge>}
                      {item.source === 'pendente' && !item.overdue && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">Pendente</span>
                      )}
                    </div>
                  </div>
                  <Money
                    value={item.type === 'receita' ? item.amount : -item.amount}
                    signed
                    colored
                    className="text-sm font-semibold"
                  />
                  {item.source === 'pendente' && item.transactionId && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Check size={14} aria-hidden />}
                      loading={busy === item.transactionId}
                      onClick={() => void markPaid(item)}
                      aria-label={`${item.type === 'receita' ? 'Marcar como recebido' : 'Marcar como pago'}: ${item.description}`}
                      className="w-full sm:w-auto"
                    >
                      {item.type === 'receita' ? 'Marcar como recebido' : 'Marcar como pago'}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {items.length > shown.length && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            + {plural(items.length - shown.length, 'compromisso', 'compromissos')} no período.{' '}
            <CardLink to={ROUTES.transactions}>Ver lançamentos</CardLink>
          </p>
        )}
      </section>
    </Card>
  );
}
