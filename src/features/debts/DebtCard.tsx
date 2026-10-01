import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Link2,
  Pencil,
  RotateCcw,
  Trash2,
  Wallet,
} from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { monthlyToAnnualRate, type DebtItemOverview } from '@/analytics';
import { Badge, Button, Card, IconButton, Money, ProgressBar, cn } from '@/components/ui';
import { diffDays, formatDateBR } from '@/domain/dates';
import { formatPercent } from '@/domain/money';
import { plural } from '@/domain/text';
import { DEBT_TYPE_LABELS, type Debt, type DebtPayment, type ISODate } from '@/domain/types';
import { formatRate } from '@/domain/format';
import { isHighInterest, nextDueDate } from './debt-utils';

export interface DebtCardProps {
  item: DebtItemOverview;
  /** Pagamentos da dívida, do mais recente para o mais antigo. */
  history: DebtPayment[];
  today: ISODate;
  onPay: (debt: Debt) => void;
  onEdit: (debt: Debt) => void;
  onDelete: (debt: Debt) => void;
  onToggleStatus: (debt: Debt) => void;
  onDeletePayment: (debt: Debt, payment: DebtPayment) => void;
}

function dueLabel(today: ISODate, dueDay: number): { text: string; soon: boolean } {
  const next = nextDueDate(today, dueDay);
  const days = diffDays(today, next);
  const when = days === 0 ? 'hoje' : days === 1 ? 'amanhã' : `em ${plural(days, 'dia', 'dias')}`;
  return { text: `Dia ${dueDay} · próximo ${formatDateBR(next)} (${when})`, soon: days <= 5 };
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-800 dark:text-slate-100">{children}</dd>
    </div>
  );
}

export function DebtCard({
  item,
  history,
  today,
  onPay,
  onEdit,
  onDelete,
  onToggleStatus,
  onDeletePayment,
}: DebtCardProps) {
  const { debt, currentBalance, monthlyInterest, paidTotal, progress } = item;
  const [open, setOpen] = useState(false);
  const historyId = useId();
  const active = debt.status === 'ativa';
  const high = active && isHighInterest(debt);
  const due = active && debt.dueDay !== null ? dueLabel(today, debt.dueDay) : null;

  return (
    <Card role="region" aria-label={debt.name} className={cn('flex flex-col gap-4', !active && 'opacity-90')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-base font-semibold text-slate-900 dark:text-white">{debt.name}</h3>
          <p className="break-words text-sm text-slate-500 dark:text-slate-400">
            {[debt.creditor, DEBT_TYPE_LABELS[debt.type]].filter(Boolean).join(' · ')}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {!active && (
              <Badge tone="positive">
                <CheckCircle2 size={12} aria-hidden /> Quitada
              </Badge>
            )}
            {high && (
              <Badge tone="negative">
                <AlertTriangle size={12} aria-hidden /> Juros altos
              </Badge>
            )}
            {due?.soon && (
              <Badge tone="warning">
                <CalendarClock size={12} aria-hidden /> Vence em breve
              </Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton label={`Editar ${debt.name}`} size="sm" onClick={() => onEdit(debt)}>
            <Pencil size={16} />
          </IconButton>
          <IconButton
            label={`Excluir ${debt.name}`}
            size="sm"
            variant="danger"
            onClick={() => onDelete(debt)}
          >
            <Trash2 size={16} />
          </IconButton>
        </div>
      </div>

      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Saldo devedor atual</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-white">
          <Money value={currentBalance} />
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <Detail label="Juros">
          {formatRate(debt.interestRate)} a.m.
          {debt.interestRate > 0 && (
            <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
              ≈ {formatRate(monthlyToAnnualRate(debt.interestRate))} a.a.
            </span>
          )}
        </Detail>
        <Detail label="Juros estimados/mês">
          <Money value={active ? monthlyInterest : 0} />
        </Detail>
        <Detail label="Parcela mínima">
          {debt.minimumPayment > 0 ? <Money value={debt.minimumPayment} /> : 'Sem mínimo'}
        </Detail>
        <Detail label="Vencimento">
          {due ? due.text : debt.dueDay !== null ? `Dia ${debt.dueDay}` : 'Não informado'}
        </Detail>
        {debt.remainingInstallments !== null && active && (
          <Detail label="Parcelas restantes">{debt.remainingInstallments}</Detail>
        )}
      </dl>

      {debt.originalAmount > 0 && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {active ? `${formatPercent(progress)} quitado` : 'Quitada'} · original{' '}
              <Money value={debt.originalAmount} />
            </span>
            <span>
              Pago: <Money value={paidTotal} />
            </span>
          </div>
          <ProgressBar
            value={active ? progress : 1}
            tone="positive"
            label={`Progresso de quitação de ${debt.name}`}
          />
        </div>
      )}

      {debt.notes && <p className="text-xs text-slate-500 dark:text-slate-400">{debt.notes}</p>}

      <div className="flex flex-wrap gap-2">
        {active && (
          <Button size="sm" icon={<Wallet size={16} aria-hidden />} onClick={() => onPay(debt)}>
            Registrar pagamento
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          icon={active ? <CheckCircle2 size={16} aria-hidden /> : <RotateCcw size={16} aria-hidden />}
          onClick={() => onToggleStatus(debt)}
        >
          {active ? 'Marcar como quitada' : 'Reabrir'}
        </Button>
      </div>

      <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={historyId}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          Histórico de pagamentos ({history.length})
          {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        </button>
        {open && (
          <div id={historyId} className="mt-2">
            {history.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum pagamento registrado ainda.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        <Money value={p.amount} />
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {formatDateBR(p.date)}
                        {p.note && ` · ${p.note}`}
                        {p.date < debt.balanceDate && ' · antes da data do saldo'}
                      </p>
                    </div>
                    {p.transactionId && (
                      <span title="Despesa lançada na conta" className="text-slate-400">
                        <Link2 size={14} aria-label="Despesa lançada na conta" />
                      </span>
                    )}
                    <IconButton
                      label={`Excluir pagamento de ${formatDateBR(p.date)}`}
                      size="sm"
                      variant="danger"
                      onClick={() => onDeletePayment(debt, p)}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
