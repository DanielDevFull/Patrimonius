import { useId, useState, type FormEvent } from 'react';
import { Button, Field, Modal, Money, MoneyInput, Switch, useToast } from '@/components/ui';
import { addTransaction } from '@/db/repo';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { Account, Category, Cents, ISODate } from '@/domain/types';
import { balanceAdjustment, realBalanceFromInput } from './account-utils';

export interface AdjustBalanceModalProps {
  account: Account;
  /** Saldo atual calculado pelo app (pagos até hoje). */
  currentBalance: Cents;
  categories: Category[];
  today: ISODate;
  onClose: () => void;
}

/** Categoria "outros" do tipo (ou a primeira não arquivada do tipo, se a padrão não existir mais). */
function adjustmentCategoryId(categories: Category[], type: 'receita' | 'despesa'): string {
  const preferred = type === 'receita' ? CATEGORY_IDS.outrosReceita : CATEGORY_IDS.outrosDespesa;
  if (categories.some((c) => c.id === preferred)) return preferred;
  return categories.find((c) => c.kind === type && !c.archived)?.id ?? preferred;
}

/**
 * "Ajustar saldo": o usuário informa o saldo real (em cartão, a fatura em aberto) e o app cria um lançamento de ajuste
 * (receita ou despesa em "outros", descrição "Ajuste de saldo") com a diferença.
 */
export function AdjustBalanceModal({
  account,
  currentBalance,
  categories,
  today,
  onClose,
}: AdjustBalanceModalProps) {
  const toast = useToast();
  const ids = { form: useId(), real: useId() };
  const isCard = account.type === 'cartao_credito';
  const [real, setReal] = useState<Cents | null>(null);
  const [credit, setCredit] = useState(isCard && currentBalance > 0);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const realBalance = realBalanceFromInput(real, isCard, credit);
  const adjustment = realBalance === null ? null : balanceAdjustment(currentBalance, realBalance);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (realBalance === null) return;
    if (!adjustment) {
      toast('O saldo já confere — nada a ajustar.', 'info');
      onClose();
      return;
    }
    setSaving(true);
    try {
      await addTransaction({
        type: adjustment.type,
        amount: adjustment.amount,
        date: today,
        description: 'Ajuste de saldo',
        categoryId: adjustmentCategoryId(categories, adjustment.type),
        accountId: account.id,
        status: 'pago',
        notes: 'Criado pelo “Ajustar saldo” para igualar o saldo do app ao saldo real.',
      });
      toast('Saldo ajustado.');
      onClose();
    } catch {
      toast('Não foi possível ajustar o saldo.', 'error');
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Ajustar saldo"
      description={account.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={ids.form} loading={saving}>
            Ajustar
          </Button>
        </>
      }
    >
      <form id={ids.form} onSubmit={onSubmit} noValidate className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {isCard ? (
            currentBalance > 0 ? (
              <>
                Crédito a favor no app hoje: <Money value={currentBalance} className="font-semibold" />
              </>
            ) : (
              <>
                Fatura em aberto no app hoje: <Money value={-currentBalance} className="font-semibold" />
              </>
            )
          ) : (
            <>
              Saldo no app hoje: <Money value={currentBalance} className="font-semibold" />
            </>
          )}
        </p>
        <Field
          label={isCard ? (credit ? 'Crédito a favor hoje' : 'Fatura em aberto hoje') : 'Saldo real hoje'}
          htmlFor={ids.real}
          error={
            submitted && real === null
              ? isCard
                ? 'Informe o valor (0 se não houver).'
                : 'Informe o saldo real da conta.'
              : undefined
          }
          hint={
            isCard
              ? 'Confira no app ou na fatura do cartão e digite o valor como aparece lá (sem sinal de menos).'
              : 'Confira no app do banco ou no extrato. Pode ser negativo.'
          }
        >
          <MoneyInput id={ids.real} value={real} onChange={setReal} allowNegative={!isCard} autoFocus />
        </Field>
        {isCard && (
          <Switch
            checked={credit}
            onChange={setCredit}
            label="Tenho crédito no cartão"
            description="Marque se o cartão está com saldo a seu favor (ex.: estorno maior que a fatura)."
          />
        )}
        {real !== null && (
          <p
            className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            aria-live="polite"
          >
            {adjustment ? (
              <>
                Será criada uma {adjustment.type === 'receita' ? 'receita' : 'despesa'} de ajuste de{' '}
                <Money value={adjustment.amount} className="font-semibold" /> em “Ajuste de saldo”.
              </>
            ) : (
              'O saldo já confere. Nenhum ajuste é necessário.'
            )}
          </p>
        )}
      </form>
    </Modal>
  );
}
