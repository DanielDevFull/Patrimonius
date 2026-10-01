import { Sparkles } from 'lucide-react';
import { useDeferredValue, useId, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
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
  Switch,
  useToast,
} from '@/components/ui';
import { db } from '@/db/db';
import {
  addRecurring,
  deleteRecurringPendingAfter,
  listRecurringTransactions,
  rescheduleRecurring,
  runRecurring,
  updateRecurring,
  updateTransaction,
} from '@/db/repo';
import { formatDateBR, isISODate, monthKey, parseISO, plausibleDateRange, startOfMonth } from '@/domain/dates';
import {
  FREQUENCY_LABELS,
  type Cents,
  type FinanceData,
  type Frequency,
  type ID,
  type ISODate,
  type RecurringRule,
} from '@/domain/types';
import {
  activeAccounts,
  categoryOptions,
  defaultAccountId,
  resolveDescription,
} from '@/features/transactions/form-utils';
import {
  monthlyEquivalent,
  pastOccurrences,
  recomputeNextDate,
  rescheduleNextDate,
  resumeNextDate,
  skipToCurrentMonth,
  validateRecurringForm,
  type RecurringFormField,
} from './recurring-utils';

export interface RecurringFormInitial {
  type?: 'despesa' | 'receita';
  amount?: Cents | null;
  description?: string;
  categoryId?: ID | null;
  accountId?: ID | null;
  frequency?: Frequency;
  startDate?: ISODate;
  endDate?: ISODate | null;
  autoGenerate?: boolean;
}

export interface RecurringFormModalProps {
  /** Regra em edição (null = nova). */
  rule: RecurringRule | null;
  initial?: RecurringFormInitial;
  data: FinanceData;
  today: ISODate;
  onClose: () => void;
}

const TYPE_OPTIONS: { value: 'despesa' | 'receita'; label: string }[] = [
  { value: 'despesa', label: 'Despesa' },
  { value: 'receita', label: 'Receita' },
];
const FREQUENCIES = Object.keys(FREQUENCY_LABELS) as Frequency[];

/** Criação/edição de recorrência. Montado só quando aberto. Depois de salvar chama runRecurring(). */
export function RecurringFormModal({ rule, initial, data, today, onClose }: RecurringFormModalProps) {
  const toast = useToast();
  const ids = {
    form: useId(),
    amount: useId(),
    description: useId(),
    category: useId(),
    account: useId(),
    frequency: useId(),
    start: useId(),
    end: useId(),
  };
  const seed: RecurringFormInitial = rule ?? initial ?? {};
  const seedType = seed.type ?? 'despesa';
  const [type, setType] = useState<'despesa' | 'receita'>(seedType);
  const [amount, setAmount] = useState<Cents | null>(seed.amount ?? null);
  const [description, setDescription] = useState(seed.description ?? '');
  const [categoryTouched, setCategoryTouched] = useState(!!seed.categoryId);
  const [chosenCategoryId, setChosenCategoryId] = useState<ID | null>(seed.categoryId ?? null);
  const [accountId, setAccountId] = useState<ID | null>(
    () => seed.accountId ?? defaultAccountId(data.accounts, data.transactions, seedType),
  );
  const [frequency, setFrequency] = useState<Frequency>(seed.frequency ?? 'mensal');
  const [startDate, setStartDate] = useState<string>(seed.startDate ?? today);
  const [endDate, setEndDate] = useState<string>(seed.endDate ?? '');
  const [autoGenerate, setAutoGenerate] = useState(seed.autoGenerate ?? true);
  const [active, setActive] = useState(rule?.active ?? true);
  const [applyToPending, setApplyToPending] = useState(true);
  /** Nova regra com início antes do mês corrente: gerar também as ocorrências antigas (padrão: não). */
  const [generatePast, setGeneratePast] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const generated = useMemo(
    () => (rule ? data.transactions.filter((t) => t.recurringId === rule.id) : []),
    [data.transactions, rule],
  );
  const pendingGenerated = generated.filter((t) => t.status === 'pendente');

  const deferredDescription = useDeferredValue(description);
  const suggestion = useMemo(
    () =>
      !categoryTouched && deferredDescription.trim()
        ? suggestCategory(deferredDescription, type, data.categories, data.transactions)
        : null,
    [categoryTouched, deferredDescription, type, data.categories, data.transactions],
  );
  const categoryId = categoryTouched ? chosenCategoryId : (suggestion?.categoryId ?? chosenCategoryId);
  const autoSuggested = !categoryTouched && !!suggestion && suggestion.categoryId === categoryId;

  const accounts = useMemo(() => {
    const list = activeAccounts(data.accounts);
    const current = rule ? data.accounts.find((a) => a.id === rule.accountId && a.archived) : undefined;
    return current ? [...list, current] : list;
  }, [data.accounts, rule]);
  const groups = useMemo(
    () => categoryOptions(data.categories, type, rule?.categoryId ?? null),
    [data.categories, type, rule],
  );

  const errors = validateRecurringForm({ amount, categoryId, accountId, startDate, endDate, today });
  const dateRange = plausibleDateRange(today);
  const show = (f: RecurringFormField) => (submitted ? errors[f] : undefined);
  const monthly =
    amount && amount > 0 && frequency !== 'mensal' ? monthlyEquivalent(amount, frequency) : null;
  // Só na criação: ocorrências de meses anteriores que virariam pendentes vencidos.
  const past = useMemo(
    () =>
      !rule && autoGenerate
        ? pastOccurrences(startDate, frequency, isISODate(endDate) ? endDate : null, today)
        : [],
    [rule, autoGenerate, startDate, frequency, endDate, today],
  );

  function changeType(next: 'despesa' | 'receita') {
    setType(next);
    const chosen = chosenCategoryId ? data.categories.find((c) => c.id === chosenCategoryId) : undefined;
    if (!chosen || chosen.kind !== next) {
      setChosenCategoryId(null);
      setCategoryTouched(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0 || amount === null || !accountId || !categoryId) {
      const order: [RecurringFormField, string][] = [
        ['amount', ids.amount],
        ['categoryId', ids.category],
        ['accountId', ids.account],
        ['startDate', ids.start],
        ['endDate', ids.end],
      ];
      const first = order.find(([f]) => errors[f]);
      if (first) document.getElementById(first[1])?.focus();
      return;
    }
    setSaving(true);
    const category = data.categories.find((c) => c.id === categoryId);
    const finalDescription = resolveDescription(description, type, category, undefined);
    const base = {
      type,
      amount,
      description: finalDescription,
      categoryId,
      accountId,
      frequency,
      startDate,
      endDate: endDate || null,
      autoGenerate,
    };
    try {
      if (rule) {
        const scheduleChanged = startDate !== rule.startDate || frequency !== rule.frequency;
        let replaced = 0;
        if (scheduleChanged && active && autoGenerate) {
          // Nova agenda: os pendentes do mês corrente em diante são refeitos (sem duplicar o mês) pelo runRecurring.
          replaced = await rescheduleRecurring(
            rule.id,
            { ...base, active },
            startOfMonth(monthKey(today)),
            (last) => rescheduleNextDate(startDate, frequency, last, today),
          );
        } else {
          let nextDate = rule.nextDate;
          if (scheduleChanged) {
            const last = generated.reduce<ISODate | null>(
              (max, t) => (max === null || t.date > max ? t.date : max),
              null,
            );
            nextDate = recomputeNextDate(startDate, frequency, last);
          }
          // Reativar ou ligar a geração automática não gera de uma vez as ocorrências dos meses anteriores.
          if (active && (!rule.active || (autoGenerate && !rule.autoGenerate))) {
            nextDate = resumeNextDate({ ...rule, ...base, nextDate }, today);
          }
          await updateRecurring(rule.id, { ...base, active, nextDate });
        }
        // Término definido (ou antecipado): os pendentes já gerados depois dele deixam de valer.
        const removedAfterEnd =
          base.endDate !== null && (rule.endDate === null || base.endDate < rule.endDate)
            ? await deleteRecurringPendingAfter(rule.id, base.endDate)
            : 0;
        let updated = 0;
        if (applyToPending && pendingGenerated.length) {
          const remaining = (await listRecurringTransactions(rule.id)).filter((t) => t.status === 'pendente');
          for (const t of remaining) {
            await updateTransaction(t.id, {
              type,
              amount,
              description: finalDescription,
              categoryId,
              accountId,
            });
          }
          updated = remaining.length;
        }
        await runRecurring();
        const messages = [
          updated > 0
            ? `Recorrência atualizada (e ${updated === 1 ? '1 lançamento pendente' : `${updated} lançamentos pendentes`}).`
            : 'Recorrência atualizada.',
        ];
        if (replaced > 0) {
          messages.push(
            replaced === 1
              ? 'O lançamento pendente da agenda antiga foi substituído pela nova data.'
              : `${replaced} lançamentos pendentes da agenda antiga foram substituídos pelas novas datas.`,
          );
        }
        if (removedAfterEnd > 0) {
          messages.push(
            removedAfterEnd === 1
              ? '1 lançamento pendente depois do término foi excluído.'
              : `${removedAfterEnd} lançamentos pendentes depois do término foram excluídos.`,
          );
        }
        toast(messages.join(' '));
      } else {
        // Início no passado: por padrão a agenda começa no mês corrente (o início continua sendo a âncora); as
        // ocorrências antigas só viram pendentes se o usuário pedir.
        const skipPast = startDate < startOfMonth(monthKey(today)) && !(autoGenerate && generatePast);
        const created = await addRecurring({
          ...base,
          active: true,
          nextDate: skipPast ? skipToCurrentMonth(startDate, frequency, parseISO(startDate).day, today) : undefined,
        });
        await runRecurring();
        const count = await db.transactions.where('recurringId').equals(created.id).count();
        toast(
          count > 0
            ? `Recorrência criada (${count === 1 ? '1 lançamento pendente gerado' : `${count} lançamentos pendentes gerados`}).`
            : 'Recorrência criada.',
        );
      }
      onClose();
    } catch {
      toast('Não foi possível salvar a recorrência.', 'error');
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={rule ? 'Editar recorrência' : 'Nova recorrência'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={ids.form} loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <form id={ids.form} onSubmit={onSubmit} noValidate className="space-y-4">
        <SegmentedControl
          mode="radio"
          aria-label="Tipo de recorrência"
          options={TYPE_OPTIONS}
          value={type}
          onChange={changeType}
          className="flex w-full [&>button]:flex-1"
        />

        <Field
          label="Valor"
          htmlFor={ids.amount}
          error={show('amount')}
          hint={
            monthly !== null ? (
              <>
                Equivale a <Money value={monthly} /> por mês.
              </>
            ) : undefined
          }
        >
          <MoneyInput id={ids.amount} value={amount} onChange={setAmount} autoFocus />
        </Field>

        <Field
          label="Descrição"
          htmlFor={ids.description}
          hint="Se ficar em branco, usamos o nome da categoria."
        >
          <Input
            id={ids.description}
            value={description}
            maxLength={120}
            placeholder={type === 'despesa' ? 'Ex.: Aluguel, Netflix, Academia' : 'Ex.: Salário'}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

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
            {groups.map((group) =>
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Conta"
            htmlFor={ids.account}
            error={show('accountId')}
            hint={
              accounts.length === 0 ? (
                <>
                  Nenhuma conta cadastrada.{' '}
                  <Link
                    to={ROUTES.accounts}
                    onClick={onClose}
                    className="font-medium text-brand-700 underline dark:text-brand-400"
                  >
                    Cadastrar conta
                  </Link>
                </>
              ) : undefined
            }
          >
            <Select
              id={ids.account}
              value={accountId ?? ''}
              aria-invalid={!!show('accountId')}
              onChange={(e) => setAccountId(e.target.value || null)}
            >
              <option value="">Selecione…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon} {a.name}
                  {a.archived ? ' (arquivada)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Frequência" htmlFor={ids.frequency}>
            <Select
              id={ids.frequency}
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABELS[f]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Início"
            htmlFor={ids.start}
            error={show('startDate')}
            hint="Data da primeira ocorrência."
          >
            <Input
              id={ids.start}
              type="date"
              value={startDate}
              min={dateRange.min}
              max={dateRange.max}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field
            label="Término (opcional)"
            htmlFor={ids.end}
            error={show('endDate')}
            hint="Em branco = sem data para acabar."
          >
            <Input
              id={ids.end}
              type="date"
              value={endDate}
              min={startDate || dateRange.min}
              max={dateRange.max}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        </div>

        <Switch
          checked={autoGenerate}
          onChange={setAutoGenerate}
          label="Gerar lançamentos automaticamente"
          description="Cria os lançamentos como pendentes até o fim do mês; você só confirma quando pagar ou receber."
        />
        {past.length > 0 && (
          <Switch
            checked={generatePast}
            onChange={setGeneratePast}
            label={
              past.length === 1
                ? `Gerar também a ocorrência de ${formatDateBR(past[0])}`
                : `Gerar também as ${past.length} ocorrências anteriores a este mês`
            }
            description={
              past.length === 1
                ? 'O início é anterior a este mês. Ligado, ela entra como pendente vencida; deixe desligado se já foi paga ou lançada.'
                : `O início é anterior a este mês (${formatDateBR(past[0])} a ${formatDateBR(past[past.length - 1])}). Ligado, elas entram como pendentes vencidas; deixe desligado se já foram pagas ou lançadas.`
            }
          />
        )}
        {rule && (
          <Switch
            checked={active}
            onChange={setActive}
            label="Ativa"
            description="Recorrências pausadas não geram lançamentos nem entram nas previsões."
          />
        )}
        {rule && pendingGenerated.length > 0 && (
          <Switch
            checked={applyToPending}
            onChange={setApplyToPending}
            label={`Atualizar ${pendingGenerated.length === 1 ? 'o lançamento pendente já gerado' : `os ${pendingGenerated.length} lançamentos pendentes já gerados`}`}
            description="Aplica valor, descrição, categoria e conta aos pendentes desta recorrência."
          />
        )}
      </form>
    </Modal>
  );
}
