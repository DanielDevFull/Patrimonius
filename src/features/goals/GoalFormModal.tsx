import { CalendarClock } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import {
  Button,
  ColorSwatches,
  Field,
  Input,
  Modal,
  Money,
  MoneyInput,
  Select,
  Textarea,
  cn,
  useToast,
} from '@/components/ui';
import { addGoal, updateGoal } from '@/db/repo';
import { COLOR_PALETTE } from '@/domain/defaults';
import { plural } from '@/domain/text';
import { PRIORITY_LABELS, type Account, type Cents, type Goal, type ID, type ISODate, type Priority } from '@/domain/types';
import { GOAL_EMOJIS, monthlyPlan, reconcileStatus, validateGoalForm, type GoalFormField, type GoalTemplate } from './goal-utils';

export interface GoalFormModalProps {
  /** Meta em edição (null = nova). */
  goal: Goal | null;
  /** Modelo usado para preencher uma nova meta. */
  template?: GoalTemplate | null;
  /** Valor já guardado (edição), para o planejamento e o status. */
  saved: Cents;
  /** A meta em edição já recebeu aporte neste mês (o mês atual deixa de contar no planejamento). */
  contributedThisMonth?: boolean;
  accounts: Account[];
  today: ISODate;
  onClose: () => void;
  onSaved?: (goal: Goal) => void;
}

const PRIORITIES: Priority[] = ['alta', 'media', 'baixa'];

/** Contas que fazem sentido para guardar o dinheiro de uma meta (sem cartão de crédito). */
function accountOptions(accounts: Account[], currentId: ID | null): Account[] {
  return accounts.filter((a) => a.id === currentId || (!a.archived && a.type !== 'cartao_credito'));
}

/** Criação/edição de meta. Montado somente quando aberto. */
export function GoalFormModal({
  goal,
  template,
  saved,
  contributedThisMonth = false,
  accounts,
  today,
  onClose,
  onSaved,
}: GoalFormModalProps) {
  const toast = useToast();
  const ids = {
    form: useId(),
    name: useId(),
    target: useId(),
    date: useId(),
    icon: useId(),
    priority: useId(),
    account: useId(),
    notes: useId(),
  };
  const [name, setName] = useState(goal?.name ?? template?.name ?? '');
  const [target, setTarget] = useState<Cents | null>(goal?.targetAmount ?? template?.target ?? null);
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '');
  const [icon, setIcon] = useState(goal?.icon ?? template?.icon ?? '🎯');
  const [color, setColor] = useState(goal?.color ?? template?.color ?? COLOR_PALETTE[0]);
  const [priority, setPriority] = useState<Priority>(goal?.priority ?? template?.priority ?? 'media');
  const [accountId, setAccountId] = useState<ID>(goal?.accountId ?? '');
  const [notes, setNotes] = useState(goal?.notes ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors = validateGoalForm({ name, target, targetDate }, today, goal?.targetDate ?? null);
  const show = (f: GoalFormField) => (submitted ? errors[f] : undefined);
  const plan = monthlyPlan(target, saved, targetDate || null, today, contributedThisMonth);
  const colors = COLOR_PALETTE.includes(color) ? COLOR_PALETTE : [...COLOR_PALETTE, color];
  const options = accountOptions(accounts, goal?.accountId ?? null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0 || target === null) {
      const first: GoalFormField = errors.name ? 'name' : errors.target ? 'target' : 'targetDate';
      document.getElementById(first === 'name' ? ids.name : first === 'target' ? ids.target : ids.date)?.focus();
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim().replace(/\s+/g, ' '),
      targetAmount: target,
      targetDate: targetDate || null,
      icon: icon.trim() || '🎯',
      color,
      priority,
      accountId: accountId || null,
      notes: notes.trim(),
    };
    try {
      if (goal) {
        // Ajusta o status se o novo alvo já foi atingido (ou deixou de ser).
        const status = reconcileStatus(goal.status, saved, target);
        await updateGoal(goal.id, { ...payload, status });
        onSaved?.({ ...goal, ...payload, status });
        toast('Meta atualizada.');
      } else {
        const created = await addGoal({ ...payload, status: 'ativa' });
        onSaved?.(created);
        toast('Meta criada. Agora é só começar a guardar!');
      }
      onClose();
    } catch {
      toast('Não foi possível salvar a meta.', 'error');
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={goal ? 'Editar meta' : 'Nova meta'}
      description={!goal && template ? template.description : undefined}
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
        <Field label="Nome da meta" htmlFor={ids.name} error={show('name')}>
          <Input
            id={ids.name}
            value={name}
            maxLength={60}
            placeholder="Ex.: Viagem para o Nordeste"
            aria-invalid={!!show('name')}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor alvo" htmlFor={ids.target} error={show('target')}>
            <MoneyInput id={ids.target} value={target} onChange={setTarget} />
          </Field>
          <Field label="Prazo (opcional)" htmlFor={ids.date} error={show('targetDate')}>
            <Input
              id={ids.date}
              type="date"
              value={targetDate}
              min={today}
              aria-invalid={!!show('targetDate')}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </Field>
        </div>

        {plan && (
          <p className="flex items-start gap-2 rounded-xl bg-brand-50 p-3 text-sm text-brand-900 dark:bg-brand-950/50 dark:text-brand-200">
            <CalendarClock size={16} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              Para chegar lá em {plural(plan.months, 'mês', 'meses')}, guarde cerca de{' '}
              <Money value={plan.monthly} className="font-semibold" /> por mês.
            </span>
          </p>
        )}

        <Field label="Emoji" htmlFor={ids.icon}>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={ids.icon}
              value={icon}
              maxLength={8}
              className="w-16 text-center text-lg"
              onChange={(e) => setIcon(e.target.value)}
            />
            <div className="flex flex-wrap gap-1" role="group" aria-label="Sugestões de emoji">
              {GOAL_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`Usar ${emoji}`}
                  aria-pressed={icon === emoji}
                  onClick={() => setIcon(emoji)}
                  className={cn(
                    'flex size-9 items-center justify-center rounded-lg text-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-800',
                    icon === emoji && 'bg-brand-100 ring-1 ring-brand-500 dark:bg-brand-950',
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Cor</span>
          <ColorSwatches value={color} onChange={setColor} colors={colors} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prioridade" htmlFor={ids.priority}>
            <Select id={ids.priority} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Conta onde o dinheiro fica (opcional)"
            htmlFor={ids.account}
            hint="Aportes debitados de outra conta viram transferência para esta."
          >
            <Select id={ids.account} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Nenhuma</option>
              {options.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon} {a.name}
                  {a.archived ? ' (arquivada)' : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Observações (opcional)" htmlFor={ids.notes}>
          <Textarea id={ids.notes} value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
