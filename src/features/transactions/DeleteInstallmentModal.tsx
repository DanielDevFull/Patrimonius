import { Button, Modal } from '@/components/ui';
import type { Transaction } from '@/domain/types';

export type DeleteScope = 'one' | 'future' | 'group';

export interface DeleteInstallmentModalProps {
  /** Parcela a excluir (o modal fica aberto enquanto não for null). */
  transaction: Transaction | null;
  /** Quantas parcelas da compra ainda existem (algumas podem já ter sido excluídas). */
  groupCount: number;
  /** Quantas parcelas existentes são esta ou as seguintes (número >= o desta). */
  futureCount: number;
  onClose: () => void;
  onConfirm: (scope: DeleteScope) => void;
}

/**
 * Pergunta o alcance da exclusão de uma parcela: só esta, esta e as próximas, ou todas.
 * Os rótulos usam as parcelas que ainda existem, não o total original da compra.
 */
export function DeleteInstallmentModal({
  transaction,
  groupCount,
  futureCount,
  onClose,
  onConfirm,
}: DeleteInstallmentModalProps) {
  const info = transaction?.installment;
  // "Esta e as próximas" só faz sentido se alcança mais de uma parcela e não é o mesmo que "todas".
  const showFuture = futureCount > 1 && futureCount < groupCount;
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
        {showFuture && (
          <Button variant="secondary" fullWidth onClick={() => onConfirm('future')}>
            Esta e as próximas ({futureCount})
          </Button>
        )}
        {groupCount > 1 && (
          <Button variant="danger" fullWidth onClick={() => onConfirm('group')}>
            Todas as {groupCount} parcelas
          </Button>
        )}
      </div>
    </Modal>
  );
}
