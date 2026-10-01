import { Info, Repeat, Sparkles, Wallet } from 'lucide-react';
import { useDeferredValue, useId, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { suggestCategory } from '@/agent/categorizer';
import { ROUTES } from '@/app/navigation';
import {
  Button,
  Field,
  Input,
  Modal,
  Money,
  MoneyInput,
  SegmentedControl,
  Select,
  Spinner,
  Switch,
  Textarea,
  useToast,
} from '@/components/ui';
import { db } from '@/db/db';
import { useFinanceData, useToday } from '@/db/hooks';
import { addAccount, addRecurring, addTransaction, updateTransaction } from '@/db/repo';
import { ACCOUNT_TYPE_ICONS, COLOR_PALETTE } from '@/domain/defaults';
import type {
  Account,
  Cents,
  FinanceData,
  ID,
  ISODate,
  Transaction,
  TransactionStatus,
  TransactionType,
} from '@/domain/types';
import {
  activeAccounts,
  categoryOptions,
  defaultAccountId,
  formatTags,
  installmentPreview,
  MAX_INSTALLMENTS,
  otherAccountId,
  parseInstallments,
  parseTags,
  previousDescriptions,
  resolveDescription,
  validateTransactionForm,
  type TransactionFormField,
} from './form-utils';

/** Valores iniciais aceitos pelo formulário (todos opcionais). */
export interface TransactionFormInitial {
  type?: TransactionType;
  /** Centavos. Para parcelado, é o valor TOTAL. */
  amount?: Cents | null;
  date?: ISODate;
  description?: string;
  categoryId?: ID | null;
  accountId?: ID | null;
  toAccountId?: ID | null;
  status?: TransactionStatus;
  installments?: number;
  notes?: string;
  tags?: string[];
}

export interface TransactionFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Pré-preenchimento de um NOVO lançamento (ignorado quando `transaction` é informado). */
  initial?: TransactionFormInitial;
  /** Lançamento em edição. Em parcelas, a edição altera só aquela parcela. */
  transaction?: Transaction | null;
  /** Chamado com os lançamentos criados/alterados após salvar. */
  onSaved?: (txs: Transaction[]) => void;
}

const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: 'despesa', label: 'Despesa' },
  { value: 'receita', label: 'Receita' },
  { value: 'transferencia', label: 'Transferência' },
];

const STATUS_LABELS: Record<TransactionType, Record<TransactionStatus, string>> = {
  despesa: { pago: 'Pago', pendente: 'Pendente' },
  receita: { pago: 'Recebido', pendente: 'Pendente' },
  transferencia: { pago: 'Realizada', pendente: 'Pendente' },
};

const SAVED_MESSAGES: Record<TransactionType, string> = {
  despesa: 'Despesa salva.',
  receita: 'Receita salva.',
  transferencia: 'Transferência salva.',
};

/**
 * Formulário de lançamento (despesa, receita ou transferência) em um modal.
 * Reutilizável: o assistente usa este componente para confirmar lançamentos sugeridos.
 * O estado é recriado sempre que o modal abre.
 */
export function TransactionFormModal(props: TransactionFormModalProps) {
  if (!props.open) return null;
  return <TransactionFormDialog key={props.transaction?.id ?? 'novo'} {...props} />;
}

function TransactionFormDialog(props: TransactionFormModalProps) {
  const data = useFinanceData();
  const today = useToday();
  if (!data) {
    return (
      <Modal open onClose={props.onClose} title={props.transaction ? 'Editar lançamento' : 'Novo lançamento'}>
        <Spinner />
      </Modal>
    );
  }
  return <TransactionFormBody {...props} data={data} today={today} />;
}

interface BodyProps extends TransactionFormModalProps {
  data: FinanceData;
  today: ISODate;
}

function accountLabel(account: Account): string {
  return `${account.icon ? `${account.icon} ` : ''}${account.name}${account.archived ? ' (arquivada)' : ''}`;
}

function TransactionFormBody({ onClose, initial, transaction, onSaved, data, today }: BodyProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const ids = {
    form: useId(),
    amount: useId(),
    description: useId(),
    descriptions: useId(),
    category: useId(),
    account: useId(),
    toAccount: useId(),
    date: useId(),
    installments: useId(),
    notes: useId(),
    tags: useId(),
  };
  const editing = transaction ?? null;
  const seed: TransactionFormInitial = editing
    ? {
        type: editing.type,
        amount: editing.amount,
        date: editing.date,
        description: editing.description,
        categoryId: editing.categoryId,
        accountId: editing.accountId,
        toAccountId: editing.toAccountId,
        status: editing.status,
        notes: editing.notes,
        tags: editing.tags,
      }
    : (initial ?? {});
  const seedType = seed.type ?? 'despesa';

  const [type, setType] = useState<TransactionType>(seedType);
  const [amount, setAmount] = useState<Cents | null>(seed.amount ?? null);
  const [description, setDescription] = useState(seed.description ?? '');
  const [categoryTouched, setCategoryTouched] = useState(!!seed.categoryId);
  const [chosenCategoryId, setChosenCategoryId] = useState<ID | null>(seed.categoryId ?? null);
  const [accountId, setAccountId] = useState<ID | null>(
    () => seed.accountId ?? defaultAccountId(data.accounts, data.transactions, seedType),
  );
  const [toAccountId, setToAccountId] = useState<ID | null>(() =>
    seedType === 'transferencia'
      ? (seed.toAccountId ??
        otherAccountId(
          data.accounts,
          seed.accountId ?? defaultAccountId(data.accounts, data.transactions, seedType),
        ))
      : null,
  );
  const [date, setDate] = useState<string>(seed.date ?? today);
  const [statusChoice, setStatusChoice] = useState<TransactionStatus | null>(seed.status ?? null);
  const [installmentsText, setInstallmentsText] = useState(String(seed.installments ?? 1));
  const [repeat, setRepeat] = useState(false);
  const [notes, setNotes] = useState(seed.notes ?? '');
  const [tagsText, setTagsText] = useState(formatTags(seed.tags ?? []));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  /** Recria o campo de valor após "Salvar e novo" (limpa o texto e devolve o foco via autoFocus). */
  const [amountKey, setAmountKey] = useState(0);

  const kind = type === 'transferencia' ? null : type;
  const status: TransactionStatus = statusChoice ?? (date > today ? 'pendente' : 'pago');
  const canRepeat = !editing && kind !== null;
  const installmentsApplies = !editing && type === 'despesa' && !repeat;
  const installments = installmentsApplies ? parseInstallments(installmentsText) : 1;

  // Sugestão automática de categoria enquanto o usuário não escolheu uma manualmente.
  const deferredDescription = useDeferredValue(description);
  const suggestion = useMemo(
    () =>
      // `description` também precisa estar preenchida: após "Salvar e novo" o valor adiado ainda traz o texto antigo.
      kind && !categoryTouched && description.trim() && deferredDescription.trim()
        ? suggestCategory(deferredDescription, kind, data.categories, data.transactions)
        : null,
    [kind, categoryTouched, description, deferredDescription, data.categories, data.transactions],
  );
  const rawCategoryId = kind
    ? categoryTouched
      ? chosenCategoryId
      : (suggestion?.categoryId ?? chosenCategoryId)
    : null;
  // Ignora categoria inexistente ou de outro tipo (ex.: pré-preenchimento inconsistente).
  const categoryId =
    rawCategoryId && data.categories.some((c) => c.id === rawCategoryId && c.kind === kind)
      ? rawCategoryId
      : null;
  const autoSuggested =
    kind !== null && !categoryTouched && !!suggestion && suggestion.categoryId === categoryId;

  const accounts = useMemo(() => activeAccounts(data.accounts), [data.accounts]);
  const accountOptions = useMemo(() => {
    const list = [...accounts];
    for (const id of [editing?.accountId, editing?.toAccountId]) {
      const archived = id ? data.accounts.find((a) => a.id === id && a.archived) : undefined;
      if (archived) list.push(archived);
    }
    return list;
  }, [accounts, data.accounts, editing]);
  // Ignora contas inexistentes/arquivadas vindas do pré-preenchimento.
  const fromId = accountId && accountOptions.some((a) => a.id === accountId) ? accountId : null;
  const toId = toAccountId && accountOptions.some((a) => a.id === toAccountId) ? toAccountId : null;
  const categoryGroups = useMemo(
    () => (kind ? categoryOptions(data.categories, kind, editing?.categoryId ?? null) : []),
    [data.categories, kind, editing],
  );
  const descriptionOptions = useMemo(
    () => previousDescriptions(data.transactions, type),
    [data.transactions, type],
  );
  const preview = installmentsApplies ? installmentPreview(amount, installments) : null;

  const errors = validateTransactionForm({
    type,
    amount,
    accountId: fromId,
    toAccountId: toId,
    categoryId,
    date,
    installments,
    installmentsApplies,
  });
  const show = (field: TransactionFormField) => (submitted ? errors[field] : undefined);

  function changeType(next: TransactionType) {
    setType(next);
    if (next === 'transferencia') {
      setRepeat(false);
      if (!toAccountId || toAccountId === accountId) setToAccountId(otherAccountId(data.accounts, accountId));
    }
    // Mantém a categoria escolhida só se ela for do novo tipo; senão volta à sugestão automática.
    const chosen = chosenCategoryId ? data.categories.find((c) => c.id === chosenCategoryId) : undefined;
    if (!categoryTouched || !chosen || chosen.kind !== next) {
      setChosenCategoryId(null);
      setCategoryTouched(false);
    }
  }

  function resetForNext() {
    setAmount(null);
    setDescription('');
    setCategoryTouched(false);
    setChosenCategoryId(null);
    setStatusChoice(null);
    setInstallmentsText('1');
    setRepeat(false);
    setNotes('');
    setTagsText('');
    setSubmitted(false);
    setAmountKey((k) => k + 1);
  }

  async function createQuickWallet() {
    setCreatingAccount(true);
    try {
      const account = await addAccount({
        name: 'Carteira',
        type: 'carteira',
        initialBalance: 0,
        color: COLOR_PALETTE[0],
        icon: ACCOUNT_TYPE_ICONS.carteira,
        archived: false,
        includeInNetWorth: true,
        creditLimit: null,
        closingDay: null,
        dueDay: null,
      });
      setAccountId(account.id);
      toast('Conta “Carteira” criada.');
    } catch {
      toast('Não foi possível criar a conta.', 'error');
    } finally {
      setCreatingAccount(false);
    }
  }

  async function saveRecurring(
    finalDescription: string,
    tags: string[],
    flowType: 'despesa' | 'receita',
    cents: Cents,
    account: ID,
    category: ID,
  ): Promise<Transaction[]> {
    const rule = await addRecurring({
      type: flowType,
      amount: cents,
      description: finalDescription,
      categoryId: category,
      accountId: account,
      frequency: 'mensal',
      startDate: date,
      endDate: null,
      autoGenerate: true,
      active: true,
    });
    const generated = await db.transactions.where('recurringId').equals(rule.id).toArray();
    const first = generated.find((t) => t.date === date);
    if (first) {
      const patch: Partial<Pick<Transaction, 'status' | 'notes' | 'tags'>> = { notes: notes.trim(), tags };
      if (status === 'pago') patch.status = 'pago';
      await updateTransaction(first.id, patch);
      Object.assign(first, patch);
    }
    toast(
      generated.length > 0
        ? `Recorrência mensal criada (${generated.length === 1 ? '1 lançamento gerado' : `${generated.length} lançamentos gerados`}).`
        : 'Recorrência mensal criada. O lançamento será gerado no mês da data escolhida.',
    );
    return generated.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  async function save(andNew: boolean) {
    setSubmitted(true);
    if (Object.keys(errors).length > 0 || amount === null || !fromId) {
      const first = (
        ['amount', 'categoryId', 'accountId', 'toAccountId', 'date', 'installments'] as const
      ).find((f) => errors[f]);
      const targetId =
        first === 'amount'
          ? ids.amount
          : first === 'categoryId'
            ? ids.category
            : first === 'accountId'
              ? ids.account
              : first === 'toAccountId'
                ? ids.toAccount
                : first === 'date'
                  ? ids.date
                  : ids.installments;
      document.getElementById(targetId)?.focus();
      return;
    }
    setSaving(true);
    const category = categoryId ? data.categories.find((c) => c.id === categoryId) : undefined;
    const toAccount = toId ? data.accounts.find((a) => a.id === toId) : undefined;
    const finalDescription = resolveDescription(description, type, category, toAccount);
    const tags = parseTags(tagsText);
    try {
      let saved: Transaction[];
      if (editing) {
        const patch = {
          type,
          amount,
          date,
          description: finalDescription,
          categoryId: type === 'transferencia' ? null : categoryId,
          accountId: fromId,
          toAccountId: type === 'transferencia' ? toId : null,
          status,
          notes: notes.trim(),
          tags,
        };
        await updateTransaction(editing.id, patch);
        saved = [{ ...editing, ...patch }];
        toast(editing.installment ? 'Parcela atualizada.' : 'Lançamento atualizado.');
      } else if (repeat && kind && categoryId) {
        saved = await saveRecurring(finalDescription, tags, kind, amount, fromId, categoryId);
      } else {
        const count = installments ?? 1;
        saved = await addTransaction({
          type,
          amount,
          date,
          description: finalDescription,
          categoryId: type === 'transferencia' ? null : categoryId,
          accountId: fromId,
          toAccountId: type === 'transferencia' ? toId : null,
          status,
          notes: notes.trim(),
          tags,
          installments: count,
        });
        toast(count > 1 ? `Compra parcelada em ${count}x salva.` : SAVED_MESSAGES[type]);
      }
      onSaved?.(saved);
      if (andNew) {
        resetForNext();
        setSaving(false);
      } else {
        onClose();
      }
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : 'Não foi possível salvar o lançamento.', 'error');
      setSaving(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void save(false);
  }

  const title = editing ? (editing.installment ? 'Editar parcela' : 'Editar lançamento') : 'Novo lançamento';
  const noAccounts = accountOptions.length === 0;

  if (noAccounts) {
    return (
      <Modal
        open
        onClose={onClose}
        title={title}
        footer={
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
        }
      >
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
            <Wallet size={24} aria-hidden />
          </span>
          <h3 className="text-base font-semibold">Cadastre uma conta primeiro</h3>
          <p className="max-w-sm text-sm text-slate-600 dark:text-slate-400">
            Todo lançamento precisa de uma conta (banco, carteira ou cartão) para o Patrimonius calcular seus
            saldos.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button data-autofocus loading={creatingAccount} onClick={() => void createQuickWallet()}>
              Criar conta “Carteira”
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                onClose();
                navigate(ROUTES.accounts);
              }}
            >
              Ir para Contas
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  const statusOptions = (['pago', 'pendente'] as const).map((value) => ({
    value,
    label: STATUS_LABELS[type][value],
  }));
  const typeOptions = editing?.installment
    ? TYPE_OPTIONS.filter((o) => o.value !== 'transferencia')
    : TYPE_OPTIONS;

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          {!editing && (
            <Button variant="secondary" disabled={saving} onClick={() => void save(true)}>
              Salvar e novo
            </Button>
          )}
          <Button type="submit" form={ids.form} loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <form id={ids.form} onSubmit={onSubmit} noValidate className="space-y-4">
        <SegmentedControl
          aria-label="Tipo de lançamento"
          options={typeOptions}
          value={type}
          onChange={changeType}
          className="flex w-full [&>button]:flex-1"
        />

        {editing?.installment && (
          <p className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-200">
            <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
            Parcela {editing.installment.number} de {editing.installment.total}: as alterações valem só para
            esta parcela.
          </p>
        )}
        {editing?.recurringId && (
          <p className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-200">
            <Repeat size={14} className="mt-0.5 shrink-0" aria-hidden />
            Gerado por uma recorrência: as alterações valem só para este lançamento.
          </p>
        )}

        <Field
          label={preview || (installments ?? 1) > 1 ? 'Valor total' : 'Valor'}
          htmlFor={ids.amount}
          error={show('amount')}
        >
          <MoneyInput key={amountKey} id={ids.amount} value={amount} onChange={setAmount} autoFocus />
        </Field>

        <Field
          label="Descrição"
          htmlFor={ids.description}
          hint={kind ? 'Se ficar em branco, usamos o nome da categoria.' : undefined}
        >
          <Input
            id={ids.description}
            list={ids.descriptions}
            value={description}
            maxLength={120}
            autoComplete="off"
            placeholder={
              type === 'despesa'
                ? 'Ex.: Mercado, iFood, conta de luz'
                : type === 'receita'
                  ? 'Ex.: Salário'
                  : 'Opcional'
            }
            onChange={(e) => setDescription(e.target.value)}
          />
          <datalist id={ids.descriptions}>
            {descriptionOptions.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </Field>

        {kind && (
          <Field
            label="Categoria"
            htmlFor={ids.category}
            error={show('categoryId')}
            hint={
              autoSuggested ? (
                <span className="inline-flex items-center gap-1 text-brand-700 dark:text-brand-400">
                  <Sparkles size={12} aria-hidden /> Sugerida automaticamente pelo Pat
                </span>
              ) : undefined
            }
          >
            <Select
              id={ids.category}
              value={categoryId ?? ''}
              aria-invalid={!!show('categoryId')}
              onChange={(e) => {
                setCategoryTouched(true);
                setChosenCategoryId(e.target.value || null);
              }}
            >
              <option value="">Selecione…</option>
              {categoryGroups.map((group) =>
                group.label ? (
                  <optgroup key={group.label} label={group.label}>
                    {group.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.name}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  group.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))
                ),
              )}
            </Select>
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={
              type === 'transferencia' ? 'De (origem)' : type === 'despesa' ? 'Conta ou cartão' : 'Conta'
            }
            htmlFor={ids.account}
            error={show('accountId')}
          >
            <Select
              id={ids.account}
              value={fromId ?? ''}
              aria-invalid={!!show('accountId')}
              onChange={(e) => setAccountId(e.target.value || null)}
            >
              <option value="">Selecione…</option>
              {accountOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a)}
                </option>
              ))}
            </Select>
          </Field>
          {type === 'transferencia' ? (
            <Field label="Para (destino)" htmlFor={ids.toAccount} error={show('toAccountId')}>
              <Select
                id={ids.toAccount}
                value={toId ?? ''}
                aria-invalid={!!show('toAccountId')}
                onChange={(e) => setToAccountId(e.target.value || null)}
              >
                <option value="">Selecione…</option>
                {accountOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountLabel(a)}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Data" htmlFor={ids.date} error={show('date')}>
              <Input id={ids.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          )}
        </div>

        {type === 'transferencia' && (
          <Field label="Data" htmlFor={ids.date} error={show('date')}>
            <Input id={ids.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Situação</span>
          <SegmentedControl
            aria-label="Situação"
            options={statusOptions}
            value={status}
            onChange={setStatusChoice}
            className="self-start"
          />
          {status === 'pendente' && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pendentes não alteram o saldo atual; entram só nas previsões até você confirmar.
            </p>
          )}
        </div>

        {canRepeat && (
          <Switch
            checked={repeat}
            onChange={setRepeat}
            label="Repetir todo mês"
            description="Cria uma recorrência mensal a partir desta data e gera os próximos lançamentos automaticamente."
          />
        )}

        {installmentsApplies && (
          <Field
            label="Parcelas"
            htmlFor={ids.installments}
            error={show('installments')}
            hint={
              preview ? (
                <span>
                  {preview.count}x de <Money value={preview.regular} />
                  {preview.first !== preview.regular && (
                    <>
                      {' '}
                      (1ª parcela de <Money value={preview.first} />)
                    </>
                  )}
                  {' · '}as próximas ficam pendentes, uma por mês.
                </span>
              ) : (
                'Compra à vista = 1. Parcelado: de 2 a 48.'
              )
            }
          >
            <Input
              id={ids.installments}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_INSTALLMENTS}
              step={1}
              className="w-28"
              value={installmentsText}
              aria-invalid={!!show('installments')}
              onChange={(e) => setInstallmentsText(e.target.value)}
            />
          </Field>
        )}

        <Field label="Observações" htmlFor={ids.notes}>
          <Textarea
            id={ids.notes}
            value={notes}
            maxLength={500}
            rows={2}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <Field label="Tags" htmlFor={ids.tags} hint="Separe por vírgula. Ex.: viagem, trabalho">
          <Input
            id={ids.tags}
            value={tagsText}
            autoComplete="off"
            onChange={(e) => setTagsText(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}
