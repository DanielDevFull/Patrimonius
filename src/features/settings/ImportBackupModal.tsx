import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Button, cn, Modal, useToast } from '@/components/ui';
import { backupCounts, importBackup, TABLE_LABELS, type BackupFile, type ImportMode } from '@/db/backup';
import type { DataTableName } from '@/db/db';
import { runRecurring } from '@/db/repo';
import type { ISODate } from '@/domain/types';

/** Tabelas mostradas no resumo (as demais entram no total). */
const SUMMARY_TABLES: DataTableName[] = [
  'accounts',
  'transactions',
  'categories',
  'recurring',
  'budgets',
  'goals',
  'debts',
  'assets',
];

const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function formatExportedAt(value: string): string | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : dateTimeFmt.format(d);
}

export interface ImportBackupModalProps {
  backup: BackupFile;
  fileName: string;
  today: ISODate;
  onClose: () => void;
}

const MODES: { value: ImportMode; title: string; description: string }[] = [
  {
    value: 'replace',
    title: 'Substituir tudo',
    description: 'Apaga os dados deste dispositivo e restaura exatamente o conteúdo do backup.',
  },
  {
    value: 'merge',
    title: 'Mesclar',
    description:
      'Mantém os dados atuais e adiciona os do backup. Registros com o mesmo id são atualizados pela versão do arquivo; registros equivalentes (a mesma ocorrência de uma recorrência, o mesmo orçamento) são unificados.',
  },
];

/** Confirmação da importação: resumo do arquivo + escolha entre substituir e mesclar. */
export function ImportBackupModal({ backup, fileName, today, onClose }: ImportBackupModalProps) {
  const toast = useToast();
  const [mode, setMode] = useState<ImportMode>('replace');
  const [busy, setBusy] = useState(false);
  const counts = backupCounts(backup);
  const exportedAt = formatExportedAt(backup.exportedAt);

  async function confirm() {
    setBusy(true);
    try {
      const total = await importBackup(backup, mode);
      await runRecurring(today);
      toast(`Backup importado: ${total.toLocaleString('pt-BR')} registros.`);
      onClose();
    } catch (e) {
      console.error(e);
      toast('Não foi possível importar o backup. Nenhum dado foi alterado.', 'error');
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title="Importar backup"
      description={fileName}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant={mode === 'replace' ? 'danger' : 'primary'} onClick={() => void confirm()} loading={busy}>
            {mode === 'replace' ? 'Substituir meus dados' : 'Mesclar dados'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
          {exportedAt && (
            <p className="mb-2 text-slate-600 dark:text-slate-300">
              Backup criado em <strong>{exportedAt}</strong>.
            </p>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            {SUMMARY_TABLES.map((t) => (
              <div key={t} className="flex justify-between gap-2">
                <dt className="text-slate-500 first-letter:uppercase dark:text-slate-400">{TABLE_LABELS[t]}</dt>
                <dd className="tabular font-medium">{counts[t]}</dd>
              </div>
            ))}
          </dl>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">Como importar?</legend>
          {MODES.map((m) => (
            <label
              key={m.value}
              className={cn(
                'flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors',
                mode === m.value
                  ? 'border-brand-500 bg-brand-50 dark:border-brand-600 dark:bg-brand-950/50'
                  : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800',
              )}
            >
              <input
                type="radio"
                name="import-mode"
                value={m.value}
                checked={mode === m.value}
                onChange={() => setMode(m.value)}
                className="mt-1 accent-brand-700"
              />
              <span>
                <span className="block text-sm font-medium">{m.title}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{m.description}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {mode === 'replace' && (
          <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
            <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
            Os dados atuais deste dispositivo serão apagados. Se quiser guardá-los, exporte um backup antes.
          </p>
        )}
      </div>
    </Modal>
  );
}
