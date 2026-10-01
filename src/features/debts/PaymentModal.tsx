import { PartyPopper } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button, Field, Input, Modal, Money, MoneyInput, Select, useToast } from '@/components/ui';
import { debtPayoffAmount } from '@/analytics';
import { addDebtPayment } from '@/db/repo';
import { formatDateBR } from '@/domain/dates';
import type { Account, Cents, Debt, DebtPayment, ID, ISODate } from '@/domain/types';
import { validatePayment } from './debt-utils';

export interface PaymentModalProps {
  debt: Debt;
  /** Saldo devedor atual (já descontados os pagamentos). */
  currentBalance: Cents;
  /**
   * Pagamentos registrados (de todas as dívidas). Com eles, "Quitar tudo" e o aviso de quitação incluem os juros
   * do mês da data escolhida (debtPayoffAmount); sem eles, usa-se `currentBalance`.
   */
  payments?: DebtPayment[];
  accounts: Account[];
  today: ISODate;
  onClose: () => void;
  /** Chamado após registrar; `paidOff` = o pagamento quitou a dívida. */
  onDone?: (result: { paidOff: boolean }) => void;
}

/** Registrar pagamento de uma dívida, com débito opcional em uma conta (cria uma despesa). */
export function PaymentModal({
  debt,
  currentBalance,
  payments,
  accounts,
  today,
  onClose,
  onDone,
}: PaymentModalProps) {
  const toast = useToast();
  const ids = { form: useId(), amount: useId(), date: useId(), note: useId(), account: useId() };
  const [amount, setAmount] = useState<Cents | null>(null);
  const [date, setDate] = useState<string>(today);
  const [note, setNote] = useState('');
  const [fromAccountId, setFromAccountId] = useState<ID>('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors = validatePayment(amount, date, today);
  const sources = accounts.filter((a) => !a.archived && a.type !== 'cartao_credito');
  const selected = sources.find((a) => a.id === fromAccountId);
  const beforeSnapshot = !!date && date < debt.balanceDate;
  // Valor que zera a dívida na data escolhida (com os juros do mês, se ela vier depois do último pagamento).
  const payoff =
    payments && !beforeSnapshot ? debtPayoffAmount(debt, payments, date || today) : currentBalance;
  const paysOff = !beforeSnapshot && amount !== null && amount > 0 && amount >= payoff;

  const shortcuts: { label: string; value: Cents }[] = [];
  if (debt.minimumPayment > 0 && debt.minimumPayment < payoff)
    shortcuts.push({ label: 'Parcela mínima', value: debt.minimumPayment });
  if (payoff > 0) shortcuts.push({ label: 'Quitar tudo', value: payoff });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (errors.amount || errors.date || amount === null) {
      document.getElementById(errors.amount ? ids.amount : ids.date)?.focus();
      return;
    }
    setSaving(true);
    try {
      await addDebtPayment({
        debtId: debt.id,
        amount,
        date,
        note: note.trim(),
        fromAccountId: fromAccountId || null,
      });
      if (!paysOff) toast('Pagamento registrado.');
      onDone?.({ paidOff: paysOff });
      onClose();
    } catch {
      toast('Não foi possível registrar o pagamento.', 'error');
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Pagar ${debt.name}`}
      description={
        <>
          Saldo devedor: <Money value={currentBalance} />
        </>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={ids.form} loading={saving}>
            Registrar pagamento
          </Button>
        </>
      }
    >
      <form id={ids.form} onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Valor pago" htmlFor={ids.amount} error={submitted ? errors.amount : undefined}>
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
        {paysOff && (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
            <PartyPopper size={16} aria-hidden className="shrink-0" />
            Este pagamento quita a dívida.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Data"
            htmlFor={ids.date}
            error={submitted ? errors.date : undefined}
            hint={
              beforeSnapshot
                ? `Antes de ${formatDateBR(debt.balanceDate)} (data do saldo informado): não reduz o saldo, fica só no histórico.`
                : undefined
            }
          >
            <Input
              id={ids.date}
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Observação (opcional)" htmlFor={ids.note}>
            <Input
              id={ids.note}
              value={note}
              maxLength={120}
              placeholder="Ex.: parcela 3/24"
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Debitar de uma conta (opcional)"
          htmlFor={ids.account}
          hint={
            selected
              ? `Será criada uma despesa em “Dívidas e empréstimos” na conta ${selected.name}.`
              : 'Sem conta, o pagamento só é registrado na dívida (seus saldos não mudam).'
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
      </form>
    </Modal>
  );
}
