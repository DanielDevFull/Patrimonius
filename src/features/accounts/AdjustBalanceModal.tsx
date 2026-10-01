import { useId, useState, type FormEvent } from 'react';
import { Button, Field, Modal, Money, MoneyInput, useToast } from '@/components/ui';
import { addTransaction } from '@/db/repo';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { Account, Category, Cents, ISODate } from '@/domain/types';
import { balanceAdjustment } from './account-utils';

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
 * "Ajustar saldo": o usuário informa o saldo real e o app cria um lançamento de ajuste
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
  const [real, setReal] = useState<Cents | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const adjustment = real === null ? null : balanceAdjustment(currentBalance, real);
  const isCard = account.type === 'cartao_credito';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (real === null) return;
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
          Saldo no app hoje: <Money value={currentBalance} className="font-semibold" />
        </p>
        <Field
          label="Saldo real hoje"
          htmlFor={ids.real}
          error={submitted && real === null ? 'Informe o saldo real da conta.' : undefined}
          hint={
            isCard
              ? 'Para cartão, informe a fatura em aberto como valor negativo (ex.: -350,00).'
              : 'Confira no app do banco ou no extrato. Pode ser negativo.'
          }
        >
          <MoneyInput id={ids.real} value={real} onChange={setReal} allowNegative autoFocus />
        </Field>
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
