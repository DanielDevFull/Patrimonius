import { ArrowRightLeft } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { debtCurrentBalance, monthlyToAnnualRate } from '@/analytics';
import { Button, Field, Input, Modal, Money, MoneyInput, Select, Textarea, useToast } from '@/components/ui';
import { addDebt, updateDebt } from '@/db/repo';
import { formatDateBR } from '@/domain/dates';
import { DEBT_TYPE_LABELS, type Debt, type DebtPayment, type DebtType, type ISODate } from '@/domain/types';
import { formatRate, parsePercent } from '@/domain/format';
import {
  DEBT_FORM_ORDER,
  annualInputToMonthly,
  debtFormToFields,
  debtToFormValues,
  validateDebtForm,
  type DebtFormField,
  type DebtFormValues,
} from './debt-utils';

export interface DebtFormModalProps {
  /** Dívida em edição (null = nova). */
  debt: Debt | null;
  payments: DebtPayment[];
  today: ISODate;
  onClose: () => void;
}

const TYPES = Object.keys(DEBT_TYPE_LABELS) as DebtType[];

/** Criação/edição de dívida. Montado somente quando aberto. */
export function DebtFormModal({ debt, payments, today, onClose }: DebtFormModalProps) {
  const toast = useToast();
  const ids: Record<DebtFormField | 'form' | 'creditor' | 'type' | 'notes' | 'annual', string> = {
    form: useId(),
    name: useId(),
    creditor: useId(),
    type: useId(),
    originalAmount: useId(),
    balance: useId(),
    balanceDate: useId(),
    rate: useId(),
    annual: useId(),
    minimumPayment: useId(),
    dueDay: useId(),
    remainingInstallments: useId(),
    notes: useId(),
  };
  const [values, setValues] = useState<DebtFormValues>(() => debtToFormValues(debt, today));
  const [annual, setAnnual] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors = validateDebtForm(values, today);
  const show = (f: DebtFormField) => (submitted ? errors[f] : undefined);
  const set = <K extends keyof DebtFormValues>(key: K, value: DebtFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const monthlyRate = parsePercent(values.rate);
  const annualPreview = annualInputToMonthly(annual);
  const currentBalance = debt ? debtCurrentBalance(debt, payments) : null;
  const paidSinceSnapshot =
    debt && values.balanceDate
      ? payments
          .filter((p) => p.debtId === debt.id && p.date >= values.balanceDate)
          .reduce((s, p) => s + p.amount, 0)
      : 0;

  function applyAnnual() {
    if (annualPreview === null) return;
    set('rate', annualPreview);
    setAnnual('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const first = DEBT_FORM_ORDER.find((f) => errors[f]);
    if (first) {
      document.getElementById(ids[first])?.focus();
      return;
    }
    setSaving(true);
    const fields = debtFormToFields(values);
    try {
      if (debt) {
        // Mantém o status coerente com o saldo quando o usuário informa um novo saldo/data.
        const balanceChanged = fields.balance !== debt.balance || fields.balanceDate !== debt.balanceDate;
        const remaining = fields.balance - paidSinceSnapshot;
        let status = debt.status;
        if (balanceChanged && debt.status === 'quitada' && remaining > 0) status = 'ativa';
        if (balanceChanged && debt.status === 'ativa' && remaining <= 0) status = 'quitada';
        await updateDebt(debt.id, { ...fields, status });
        toast(
          status === debt.status
            ? 'Dívida atualizada.'
            : status === 'ativa'
              ? 'Dívida atualizada e reaberta.'
              : 'Dívida atualizada e marcada como quitada.',
        );
      } else {
        await addDebt({ ...fields, status: 'ativa' });
        toast('Dívida cadastrada. Vamos montar o plano para quitá-la!');
      }
      onClose();
    } catch {
      toast('Não foi possível salvar a dívida.', 'error');
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={debt ? 'Editar dívida' : 'Nova dívida'}
      description="Os dados ficam só no seu dispositivo. Use o extrato ou o contrato para preencher."
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome" htmlFor={ids.name} error={show('name')}>
            <Input
              id={ids.name}
              value={values.name}
              maxLength={60}
              placeholder="Ex.: Empréstimo do carro"
              aria-invalid={!!show('name')}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
          <Field label="Credor (opcional)" htmlFor={ids.creditor}>
            <Input
              id={ids.creditor}
              value={values.creditor}
              maxLength={60}
              placeholder="Ex.: Banco, financeira, parente"
              onChange={(e) => set('creditor', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tipo" htmlFor={ids.type}>
            <Select
              id={ids.type}
              value={values.type}
              onChange={(e) => set('type', e.target.value as DebtType)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {DEBT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Valor original (opcional)"
            htmlFor={ids.originalAmount}
            error={show('originalAmount')}
            hint="Quanto foi contratado. Vazio = o saldo informado."
          >
            <MoneyInput
              id={ids.originalAmount}
              value={values.originalAmount}
              onChange={(v) => set('originalAmount', v)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Saldo devedor" htmlFor={ids.balance} error={show('balance')}>
            <MoneyInput id={ids.balance} value={values.balance} onChange={(v) => set('balance', v)} />
          </Field>
          <Field
            label="Data do saldo"
            htmlFor={ids.balanceDate}
            error={show('balanceDate')}
            hint="Pagamentos registrados a partir desta data são descontados do saldo."
          >
            <Input
              id={ids.balanceDate}
              type="date"
              value={values.balanceDate}
              max={today}
              aria-invalid={!!show('balanceDate')}
              onChange={(e) => set('balanceDate', e.target.value)}
            />
          </Field>
        </div>
        {debt && currentBalance !== null && (
          <p className="-mt-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            Saldo atual calculado: <Money value={currentBalance} className="font-semibold" />
            {paidSinceSnapshot > 0 && values.balanceDate && (
              <>
                {' '}
                (saldo informado menos <Money value={paidSinceSnapshot} /> pagos desde{' '}
                {formatDateBR(values.balanceDate)})
              </>
            )}
            . Para atualizar com o extrato, informe o novo saldo e a data de hoje.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Juros ao mês (%)"
            htmlFor={ids.rate}
            error={show('rate')}
            hint={
              monthlyRate !== null && monthlyRate > 0
                ? `Equivale a ${formatRate(monthlyToAnnualRate(monthlyRate))} ao ano.`
                : 'Use 0 se não houver juros.'
            }
          >
            <Input
              id={ids.rate}
              inputMode="decimal"
              autoComplete="off"
              placeholder="Ex.: 2,5"
              value={values.rate}
              aria-invalid={!!show('rate')}
              onChange={(e) => set('rate', e.target.value)}
            />
          </Field>
          <Field
            label="Só sabe a taxa ao ano? (%)"
            htmlFor={ids.annual}
            hint={
              annualPreview !== null
                ? `${annual.trim()}% a.a. = ${annualPreview}% a.m.`
                : 'Digite a taxa anual e converta.'
            }
          >
            <div className="flex gap-2">
              <Input
                id={ids.annual}
                inputMode="decimal"
                autoComplete="off"
                placeholder="Ex.: 30"
                value={annual}
                onChange={(e) => setAnnual(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyAnnual();
                  }
                }}
              />
              <Button
                variant="secondary"
                icon={<ArrowRightLeft size={16} aria-hidden />}
                disabled={annualPreview === null}
                onClick={applyAnnual}
              >
                Converter
              </Button>
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            label="Parcela mínima"
            htmlFor={ids.minimumPayment}
            error={show('minimumPayment')}
            hint="Por mês. Vazio = sem mínimo."
          >
            <MoneyInput
              id={ids.minimumPayment}
              value={values.minimumPayment}
              onChange={(v) => set('minimumPayment', v)}
            />
          </Field>
          <Field label="Dia de vencimento" htmlFor={ids.dueDay} error={show('dueDay')}>
            <Input
              id={ids.dueDay}
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              placeholder="Ex.: 10"
              value={values.dueDay}
              aria-invalid={!!show('dueDay')}
              onChange={(e) => set('dueDay', e.target.value)}
            />
          </Field>
          <Field
            label="Parcelas restantes"
            htmlFor={ids.remainingInstallments}
            error={show('remainingInstallments')}
          >
            <Input
              id={ids.remainingInstallments}
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="Opcional"
              value={values.remainingInstallments}
              aria-invalid={!!show('remainingInstallments')}
              onChange={(e) => set('remainingInstallments', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Observações (opcional)" htmlFor={ids.notes}>
          <Textarea
            id={ids.notes}
            value={values.notes}
            maxLength={500}
            onChange={(e) => set('notes', e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}
