import { Button, Modal, Money } from '@/components/ui';
import { plural } from '@/domain/text';
import type { Account } from '@/domain/types';
import type { AccountRemovalImpact } from './account-utils';

export interface DeleteAccountModalProps {
  /** Conta a excluir/arquivar (o modal fica aberto enquanto não for null). */
  account: Account | null;
  impact: AccountRemovalImpact | null;
  onClose: () => void;
  /** Abre o pagamento da fatura (só para cartão com fatura em aberto). */
  onPayInvoice: (account: Account) => void;
  onAdjust: (account: Account) => void;
  onConfirm: (account: Account) => void;
}

/**
 * Confirmação de "Excluir ou arquivar" para conta com saldo/fatura em aberto ou lançamentos futuros:
 * avisa que o valor sai dos totais de Contas e do Painel (o patrimônio continua contando a conta arquivada)
 * e oferece pagar a fatura ou ajustar o saldo antes.
 */
export function DeleteAccountModal({
  account,
  impact,
  onClose,
  onPayInvoice,
  onAdjust,
  onConfirm,
}: DeleteAccountModalProps) {
  const open = !!account && !!impact;
  const isCard = account?.type === 'cartao_credito';
  const balance = impact?.balance ?? 0;
  const invoice = isCard && balance < 0 ? -balance : 0;
  const futureCount = impact?.futureCount ?? 0;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={account ? `Excluir a conta “${account.name}”?` : ''}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      }
    >
      {account && impact && (
        <>
          <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
            {invoice > 0 ? (
              <>
                Esta conta tem fatura em aberto de <Money value={invoice} className="font-semibold" />
              </>
            ) : balance !== 0 ? (
              <>
                Esta conta tem saldo de <Money value={balance} className="font-semibold" />
              </>
            ) : (
              'Esta conta tem saldo zerado'
            )}
            {futureCount > 0 && (
              <>
                {' '}
                e {plural(
                  futureCount,
                  'lançamento futuro ou pendente',
                  'lançamentos futuros ou pendentes',
                )}{' '}
                (como parcelas)
              </>
            )}
            .
          </p>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
            {impact.willArchive
              ? 'Como ela tem lançamentos, será arquivada: o saldo sai do “Total em contas”, das faturas de cartão e do saldo do Painel, mas continua no patrimônio líquido. Os lançamentos futuros continuam na lista.'
              : 'Como ela não tem lançamentos, será excluída e esse saldo deixa de ser contado no app.'}
          </p>
          <div className="flex flex-col gap-2">
            {invoice > 0 && (
              <Button variant="secondary" fullWidth data-autofocus onClick={() => onPayInvoice(account)}>
                Pagar a fatura antes
              </Button>
            )}
            <Button
              variant="secondary"
              fullWidth
              data-autofocus={invoice > 0 ? undefined : true}
              onClick={() => onAdjust(account)}
            >
              Ajustar o saldo antes
            </Button>
            <Button variant="danger" fullWidth onClick={() => onConfirm(account)}>
              {impact.willArchive ? 'Arquivar mesmo assim' : 'Excluir mesmo assim'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
