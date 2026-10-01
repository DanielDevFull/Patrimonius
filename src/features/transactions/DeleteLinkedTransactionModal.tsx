import { Button, Modal } from '@/components/ui';
import type { Transaction } from '@/domain/types';
import type { TransactionLink } from './form-utils';

export interface DeleteLinkedTransactionModalProps {
  /** Lançamento a excluir e o pagamento/aporte ligado a ele (o modal fica aberto enquanto não for null). */
  target: { tx: Transaction; link: TransactionLink } | null;
  onClose: () => void;
  /** alsoLinked = true exclui também o pagamento da dívida / aporte da meta. */
  onConfirm: (alsoLinked: boolean) => void;
}

function linkNoun(link: TransactionLink): string {
  if (link.kind === 'debtPayment') return 'pagamento';
  return link.amount >= 0 ? 'aporte' : 'resgate';
}

/**
 * Excluir um lançamento criado por um pagamento de dívida ou aporte de meta: avisa do vínculo e deixa escolher
 * entre excluir os dois (a dívida/meta volta ao valor anterior) ou só o lançamento (o dinheiro volta à conta,
 * mas a dívida continua abatida / a meta continua com o aporte).
 */
export function DeleteLinkedTransactionModal({
  target,
  onClose,
  onConfirm,
}: DeleteLinkedTransactionModalProps) {
  const link = target?.link;
  const noun = link ? linkNoun(link) : '';
  const owner = link
    ? link.kind === 'debtPayment'
      ? `da dívida “${link.name}”`
      : `da meta “${link.name}”`
    : '';
  const keeps = link
    ? link.kind === 'debtPayment'
      ? 'a dívida continua abatida'
      : `a meta continua com o ${noun}`
    : '';
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      size="sm"
      title="Excluir lançamento?"
      description={target ? `“${target.tx.description}” é o ${noun} ${owner}.` : undefined}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      }
    >
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        Excluindo só o lançamento, o dinheiro volta para a conta, mas {keeps}.
      </p>
      <div className="flex flex-col gap-2">
        <Button variant="danger" fullWidth data-autofocus onClick={() => onConfirm(true)}>
          Excluir lançamento e {noun}
        </Button>
        <Button variant="secondary" fullWidth onClick={() => onConfirm(false)}>
          Excluir só o lançamento
        </Button>
      </div>
    </Modal>
  );
}
