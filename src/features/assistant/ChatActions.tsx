import { ArrowRight, Ban, Check, CheckCircle2, Pencil, ReceiptText, Wallet, X } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import type { AgentAction, TransactionDraft } from '@/agent';
import { ROUTES } from '@/app/navigation';
import { Badge, Button, cn, Field, Money, Select } from '@/components/ui';
import { formatDateBR, formatDateRelative } from '@/domain/dates';
import { splitCents } from '@/domain/money';
import type { Account, FinanceData, ID, ISODate, TransactionType } from '@/domain/types';
import { TRANSACTION_TYPE_LABELS } from '@/domain/types';
import { actionState, type ActionState, type AgentMessagePayload } from './chat-utils';
import { InlineText } from './RichText';

/** Contas selecionadas no card de confirmação. */
export interface ChosenAccounts {
  accountId: ID;
  toAccountId: ID | null;
}

export interface ChatActionHandlers {
  /** Índice da ação desta mensagem em execução (ou null). */
  busyIndex: number | null;
  /** true enquanto qualquer ação (de qualquer mensagem) está em execução. */
  locked: boolean;
  onConfirmTransaction: (index: number, draft: TransactionDraft, accounts: ChosenAccounts) => void;
  onEditTransaction: (index: number, draft: TransactionDraft, accounts: Partial<ChosenAccounts>) => void;
  onCancel: (index: number) => void;
  /** set_budget, create_goal e contribute_goal. */
  onRun: (index: number) => void;
  onNavigate: (to: string) => void;
}

const STATUS_LABEL: Record<TransactionType, { pago: string; pendente: string }> = {
  despesa: { pago: 'Pago', pendente: 'Pendente' },
  receita: { pago: 'Recebido', pendente: 'Pendente' },
  transferencia: { pago: 'Realizada', pendente: 'Pendente' },
};

const FROM_LABEL: Record<TransactionType, string> = {
  despesa: 'Conta ou cartão',
  receita: 'Conta',
  transferencia: 'De (origem)',
};

function accountLabel(a: Account): string {
  return `${a.icon ? `${a.icon} ` : ''}${a.name}`;
}

function relative(date: ISODate, today: ISODate): string | null {
  const rel = formatDateRelative(date, today);
  return /^\d/.test(rel) ? null : rel;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="shrink-0 text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-slate-900 dark:text-slate-100">{children}</dd>
    </div>
  );
}

interface TransactionConfirmProps {
  action: Extract<AgentAction, { type: 'create_transaction' }>;
  index: number;
  state: ActionState;
  data: FinanceData;
  today: ISODate;
  handlers: ChatActionHandlers;
}

/** Card de confirmação de um lançamento proposto pelo agente (Confirmar / Editar / Cancelar). */
function TransactionConfirmCard({ action, index, state, data, today, handlers }: TransactionConfirmProps) {
  const { draft } = action;
  const fromSelectId = useId();
  const toSelectId = useId();
  const accounts = data.accounts.filter((a) => !a.archived);
  const valid = (id: ID | null) => (id && accounts.some((a) => a.id === id) ? id : '');
  const presetFrom = valid(draft.accountId);
  const presetTo = draft.type === 'transferencia' ? valid(draft.toAccountId) : '';
  const [fromChoice, setFromChoice] = useState<string>(presetFrom);
  const [toChoice, setToChoice] = useState<string>(presetTo);
  const fromId = valid(fromChoice || null);
  const toId = valid(toChoice || null);
  const fromAccount = accounts.find((a) => a.id === fromId);
  const toAccount = accounts.find((a) => a.id === toId);
  const isTransfer = draft.type === 'transferencia';
  const category = isTransfer ? undefined : data.categories.find((c) => c.id === draft.categoryId && c.kind === draft.type);
  const installments = Math.max(1, draft.installments);
  const firstInstallment = installments > 1 ? splitCents(draft.amount, installments)[0] : draft.amount;
  const sameAccounts = isTransfer && !!fromId && fromId === toId;
  const busy = handlers.busyIndex === index;
  const ready = !!fromId && (!isTransfer || (!!toId && !sameAccounts)) && (isTransfer || !!category);
  const rel = relative(draft.date, today);
  const pending = state === 'pending';

  const summary = (
    <dl className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
      <Row label="Valor">
        <Money value={draft.amount} />
        {installments > 1 && (
          <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
            {installments}x de <Money value={firstInstallment} />
          </span>
        )}
      </Row>
      <Row label="Descrição">
        <span className="break-words">{draft.description || '—'}</span>
      </Row>
      {!isTransfer && (
        <Row label="Categoria">
          {category ? `${category.icon} ${category.name}` : <span className="text-amber-700 dark:text-amber-400">Escolha em “Editar”</span>}
        </Row>
      )}
      <Row label="Data">
        {formatDateBR(draft.date)}
        {rel && <span className="font-normal text-slate-500 dark:text-slate-400"> ({rel})</span>}
      </Row>
      {fromAccount && (!pending || !!presetFrom) && (
        <Row label={FROM_LABEL[draft.type]}>{accountLabel(fromAccount)}</Row>
      )}
      {isTransfer && toAccount && (!pending || !!presetTo) && (
        <Row label="Para (destino)">{accountLabel(toAccount)}</Row>
      )}
      <Row label="Situação">{STATUS_LABEL[draft.type][draft.status]}</Row>
    </dl>
  );

  const title = `${TRANSACTION_TYPE_LABELS[draft.type]}${installments > 1 ? ` parcelada (${installments}x)` : ''}`;

  return (
    <section
      aria-label={`${action.label}: confirmação`}
      className={cn(
        'rounded-xl border bg-white p-3 shadow-sm dark:bg-slate-900',
        pending ? 'border-brand-300 dark:border-brand-800' : 'border-slate-200 dark:border-slate-700',
        state === 'canceled' && 'opacity-70',
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <ReceiptText size={16} className="text-brand-700 dark:text-brand-400" aria-hidden />
          {title}
        </h3>
        {state === 'done' && (
          <Badge tone="positive">
            <CheckCircle2 size={12} aria-hidden /> Registrado
          </Badge>
        )}
        {state === 'canceled' && (
          <Badge tone="neutral">
            <Ban size={12} aria-hidden /> Cancelado
          </Badge>
        )}
      </div>
      {summary}

      {pending && accounts.length === 0 && (
        <div className="mt-2 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="flex items-center gap-2">
            <Wallet size={16} aria-hidden /> Cadastre uma conta para registrar este lançamento.
          </p>
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => handlers.onNavigate(ROUTES.accounts)}>
            Cadastrar conta
          </Button>
        </div>
      )}

      {pending && accounts.length > 0 && (!presetFrom || (isTransfer && !presetTo)) && (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {!presetFrom && (
            <Field label={FROM_LABEL[draft.type]} htmlFor={fromSelectId}>
              <Select id={fromSelectId} value={fromChoice} onChange={(e) => setFromChoice(e.target.value)}>
                <option value="">Escolha a conta…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountLabel(a)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {isTransfer && !presetTo && (
            <Field
              label="Para (destino)"
              htmlFor={toSelectId}
              error={sameAccounts ? 'Escolha contas diferentes.' : undefined}
            >
              <Select id={toSelectId} value={toChoice} onChange={(e) => setToChoice(e.target.value)}>
                <option value="">Escolha a conta…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountLabel(a)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      )}

      {pending && accounts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            icon={<Check size={16} aria-hidden />}
            loading={busy}
            disabled={!ready || handlers.locked}
            onClick={() => handlers.onConfirmTransaction(index, draft, { accountId: fromId, toAccountId: isTransfer ? toId || null : null })}
          >
            Confirmar
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Pencil size={16} aria-hidden />}
            disabled={handlers.locked}
            onClick={() =>
              handlers.onEditTransaction(index, draft, {
                ...(fromId ? { accountId: fromId } : {}),
                ...(isTransfer && toId ? { toAccountId: toId } : {}),
              })
            }
          >
            Editar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<X size={16} aria-hidden />}
            disabled={handlers.locked}
            onClick={() => handlers.onCancel(index)}
          >
            Cancelar
          </Button>
        </div>
      )}
    </section>
  );
}

function doneLabel(action: AgentAction, data: FinanceData): string {
  switch (action.type) {
    case 'set_budget': {
      const category = data.categories.find((c) => c.id === action.categoryId);
      return category ? `Orçamento de ${category.name} definido` : 'Orçamento definido';
    }
    case 'create_goal':
      return `Meta “${action.draft.name}” criada`;
    case 'contribute_goal':
      return action.amount > 0 ? 'Aporte registrado' : 'Resgate registrado';
    default:
      return 'Feito';
  }
}

export interface ChatActionsProps {
  payload: AgentMessagePayload;
  data: FinanceData;
  today: ISODate;
  handlers: ChatActionHandlers;
}

/** Ações propostas em uma resposta do agente. Nada é executado sem o clique (confirmação) do usuário. */
export function ChatActions({ payload, data, today, handlers }: ChatActionsProps) {
  const actions = payload.reply.actions;
  if (actions.length === 0) return null;
  const transactionCards = actions
    .map((action, index) => ({ action, index }))
    .filter((x): x is { action: Extract<AgentAction, { type: 'create_transaction' }>; index: number } => x.action.type === 'create_transaction');
  const others = actions.map((action, index) => ({ action, index })).filter((x) => x.action.type !== 'create_transaction');
  const firstActionable = others.find((x) => x.action.type !== 'navigate' && actionState(payload, x.index) === 'pending');

  return (
    <div className="space-y-2">
      {transactionCards.map(({ action, index }) => (
        <TransactionConfirmCard
          key={index}
          action={action}
          index={index}
          state={actionState(payload, index)}
          data={data}
          today={today}
          handlers={handlers}
        />
      ))}
      {others.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {others.map(({ action, index }) => {
            if (action.type === 'navigate') {
              return (
                <Button
                  key={index}
                  size="sm"
                  variant="secondary"
                  icon={<ArrowRight size={16} aria-hidden />}
                  onClick={() => handlers.onNavigate(action.to)}
                >
                  {action.label}
                </Button>
              );
            }
            const state = actionState(payload, index);
            if (state !== 'pending') {
              return (
                <Badge key={index} tone={state === 'done' ? 'positive' : 'neutral'} className="py-1">
                  {state === 'done' ? <CheckCircle2 size={12} aria-hidden /> : <Ban size={12} aria-hidden />}
                  {state === 'done' ? doneLabel(action, data) : 'Cancelado'}
                </Badge>
              );
            }
            return (
              <Button
                key={index}
                size="sm"
                variant={firstActionable?.index === index ? 'primary' : 'secondary'}
                icon={<Check size={16} aria-hidden />}
                loading={handlers.busyIndex === index}
                disabled={handlers.locked}
                onClick={() => handlers.onRun(index)}
              >
                <InlineText text={action.label} />
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
