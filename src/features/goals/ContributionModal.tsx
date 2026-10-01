import { useId, useState, type FormEvent } from 'react';
import type { GoalProgress } from '@/analytics';
import { Button, Field, Input, Modal, Money, MoneyInput, Select, useToast } from '@/components/ui';
import { addGoalContribution } from '@/db/repo';
import type { Account, Cents, Goal, ID, ISODate } from '@/domain/types';
import { completesGoal, validateContribution, type ContributionMode } from './goal-utils';

export interface ContributionModalProps {
  goal: Goal;
  progress: GoalProgress;
  mode: ContributionMode;
  accounts: Account[];
  today: ISODate;
  onClose: () => void;
  /** Chamado após registrar; `completed` = o aporte fez a meta atingir o alvo. */
  onDone?: (result: { completed: boolean }) => void;
}

/** Registrar aporte (com débito opcional em uma conta) ou resgate de uma meta. */
export function ContributionModal({ goal, progress, mode, accounts, today, onClose, onDone }: ContributionModalProps) {
  const toast = useToast();
  const ids = { form: useId(), amount: useId(), date: useId(), note: useId(), account: useId() };
  const [amount, setAmount] = useState<Cents | null>(null);
  const [date, setDate] = useState<string>(today);
  const [note, setNote] = useState('');
  const [fromAccountId, setFromAccountId] = useState<ID>('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const isDeposit = mode === 'aporte';
  const errors = validateContribution(mode, amount, progress.saved, date);
  const sources = accounts.filter((a) => !a.archived && a.type !== 'cartao_credito' && a.id !== goal.accountId);
  const goalAccount = goal.accountId ? accounts.find((a) => a.id === goal.accountId) : undefined;
  const selected = sources.find((a) => a.id === fromAccountId);

  const shortcuts: { label: string; value: Cents }[] = [];
  if (isDeposit) {
    if (progress.requiredMonthly && progress.requiredMonthly > 0 && progress.requiredMonthly < progress.remaining)
      shortcuts.push({ label: 'Aporte do mês', value: progress.requiredMonthly });
    if (progress.remaining > 0) shortcuts.push({ label: 'Tudo o que falta', value: progress.remaining });
  } else if (progress.saved > 0) {
    shortcuts.push({ label: 'Resgatar tudo', value: progress.saved });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (errors.amount || errors.date || amount === null) {
      document.getElementById(errors.amount ? ids.amount : ids.date)?.focus();
      return;
    }
    setSaving(true);
    try {
      const delta = isDeposit ? amount : -amount;
      const completed = completesGoal(goal, progress.saved, delta);
      await addGoalContribution({
        goalId: goal.id,
        amount: delta,
        date,
        note: note.trim(),
        fromAccountId: isDeposit && fromAccountId ? fromAccountId : null,
      });
      if (!completed) toast(isDeposit ? 'Aporte registrado.' : 'Resgate registrado.');
      onDone?.({ completed });
      onClose();
    } catch {
      toast(isDeposit ? 'Não foi possível registrar o aporte.' : 'Não foi possível registrar o resgate.', 'error');
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isDeposit ? `Aportar em ${goal.name}` : `Resgatar de ${goal.name}`}
      description={
        <>
          Guardado: <Money value={progress.saved} /> de <Money value={progress.targetAmount} />
        </>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={ids.form} loading={saving} variant={isDeposit ? 'primary' : 'danger'}>
            {isDeposit ? 'Aportar' : 'Resgatar'}
          </Button>
        </>
      }
    >
      <form id={ids.form} onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Valor" htmlFor={ids.amount} error={submitted ? errors.amount : undefined}>
          <MoneyInput id={ids.amount} value={amount} onChange={setAmount} />
        </Field>
        {shortcuts.length > 0 && (
          <div className="-mt-2 flex flex-wrap gap-2">
            {shortcuts.map((s) => (
              <Button key={s.label} size="sm" variant="ghost" onClick={() => setAmount(s.value)}>
                {s.label}: <Money value={s.value} />
              </Button>
            ))}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data" htmlFor={ids.date} error={submitted ? errors.date : undefined}>
            <Input id={ids.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Observação (opcional)" htmlFor={ids.note}>
            <Input
              id={ids.note}
              value={note}
              maxLength={120}
              placeholder={isDeposit ? 'Ex.: 13º salário' : 'Ex.: conserto do carro'}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>

        {isDeposit ? (
          <Field
            label="Debitar de uma conta (opcional)"
            htmlFor={ids.account}
            hint={
              !selected
                ? 'Sem conta, o aporte só é registrado na meta (seus saldos não mudam).'
                : goalAccount
                  ? `Será criada uma transferência de ${selected.name} para ${goalAccount.name}.`
                  : `Será criada uma despesa em “Investimentos e reserva” na conta ${selected.name}.`
            }
          >
            <Select id={ids.account} value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
              <option value="">Não debitar (só registrar)</option>
              {sources.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon} {a.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            O resgate diminui o valor guardado na meta. Se o dinheiro voltou para uma conta, registre também o
            lançamento correspondente em Lançamentos.
          </p>
        )}
      </form>
    </Modal>
  );
}
