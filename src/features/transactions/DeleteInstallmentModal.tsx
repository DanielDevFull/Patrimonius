import { Button, Modal } from '@/components/ui';
import type { Transaction } from '@/domain/types';

export type DeleteScope = 'one' | 'future' | 'group';

export interface DeleteInstallmentModalProps {
  /** Parcela a excluir (o modal fica aberto enquanto não for null). */
  transaction: Transaction | null;
  onClose: () => void;
  onConfirm: (scope: DeleteScope) => void;
}

/** Pergunta o alcance da exclusão de uma parcela: só esta, esta e as próximas, ou todas. */
export function DeleteInstallmentModal({ transaction, onClose, onConfirm }: DeleteInstallmentModalProps) {
  const info = transaction?.installment;
  const hasNext = !!info && info.number < info.total;
  const isFirst = !!info && info.number === 1;
  const remaining = info ? info.total - info.number + 1 : 0;
  return (
    <Modal
      open={!!info}
      onClose={onClose}
      size="sm"
      title="Excluir parcela"
      description={info ? `Parcela ${info.number} de ${info.total}. O que você quer excluir?` : undefined}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        <Button variant="secondary" fullWidth onClick={() => onConfirm('one')} data-autofocus>
          Só esta parcela
        </Button>
        {hasNext && !isFirst && (
          <Button variant="secondary" fullWidth onClick={() => onConfirm('future')}>
            Esta e as próximas ({remaining})
          </Button>
        )}
        <Button variant="danger" fullWidth onClick={() => onConfirm('group')}>
          Todas as {info?.total ?? ''} parcelas
        </Button>
      </div>
    </Modal>
  );
}
