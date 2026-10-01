import { Download, TriangleAlert } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button, Field, Input, Modal, useToast } from '@/components/ui';
import { downloadBackup, resetAllData } from '@/db/backup';
import type { ISODate } from '@/domain/types';

export const RESET_CONFIRMATION_WORD = 'APAGAR';

export interface ResetDataModalProps {
  today: ISODate;
  onClose: () => void;
}

/** Segunda etapa da exclusão total: o usuário precisa digitar APAGAR. */
export function ResetDataModal({ today, onClose }: ResetDataModalProps) {
  const toast = useToast();
  const inputId = useId();
  const formId = useId();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const matches = text.trim() === RESET_CONFIRMATION_WORD;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!matches) return;
    setBusy(true);
    try {
      await resetAllData();
      toast('Todos os dados foram apagados.');
      onClose();
    } catch {
      toast('Não foi possível apagar os dados.', 'error');
      setBusy(false);
    }
  }

  async function backupFirst() {
    try {
      const name = await downloadBackup(today);
      toast(`Backup salvo como ${name}.`);
    } catch {
      toast('Não foi possível gerar o backup.', 'error');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Apagar todos os dados?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="danger" disabled={!matches} loading={busy}>
            Apagar tudo
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-4" noValidate>
        <p className="flex gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
          Contas, lançamentos, metas, dívidas, bens, categorias personalizadas e a conversa com o agente serão
          apagados deste dispositivo. Não dá para desfazer.
        </p>
        <Button variant="secondary" size="sm" icon={<Download size={16} />} onClick={() => void backupFirst()}>
          Exportar backup antes
        </Button>
        <Field label={`Digite ${RESET_CONFIRMATION_WORD} para confirmar`} htmlFor={inputId}>
          <Input
            id={inputId}
            value={text}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={RESET_CONFIRMATION_WORD}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}
