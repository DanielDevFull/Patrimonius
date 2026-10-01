import { DatabaseBackup, Download, FileSpreadsheet, HardDrive, ShieldCheck, Sparkles, Trash2, Upload } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Button, Card, CardHeader, useConfirm, useToast } from '@/components/ui';
import { downloadBackup, downloadCSV, parseBackupText, transactionsToCSV, type BackupFile } from '@/db/backup';
import { loadDemoData } from '@/db/demo';
import { plural } from '@/domain/text';
import type { FinanceData, ISODate } from '@/domain/types';
import { ImportBackupModal } from './ImportBackupModal';
import { ResetDataModal } from './ResetDataModal';

interface ActionRowProps {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  action: ReactNode;
  danger?: boolean;
}

function ActionRow({ icon, title, description, action, danger }: ActionRowProps) {
  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span
          className={
            danger
              ? 'flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400'
              : 'flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-400'
          }
          aria-hidden
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
      <div className="shrink-0 sm:ml-4">{action}</div>
    </li>
  );
}

type PersistState = 'unsupported' | 'persisted' | 'not-persisted';

/** Pede ao navegador para não apagar os dados automaticamente quando faltar espaço (100% local). */
function StoragePersistence() {
  const toast = useToast();
  const [state, setState] = useState<PersistState>('unsupported');

  useEffect(() => {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!storage?.persisted) return;
    let cancelled = false;
    storage
      .persisted()
      .then((p) => {
        if (!cancelled) setState(p ? 'persisted' : 'not-persisted');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'unsupported') return null;

  async function request() {
    try {
      const granted = (await navigator.storage.persist?.()) ?? false;
      setState(granted ? 'persisted' : 'not-persisted');
      toast(
        granted
          ? 'Armazenamento protegido: o navegador não vai apagar seus dados para liberar espaço.'
          : 'O navegador não concedeu a proteção agora. Instalar o app costuma ajudar.',
        granted ? 'success' : 'info',
      );
    } catch {
      toast('Não foi possível pedir a proteção do armazenamento.', 'error');
    }
  }

  return (
    <ActionRow
      icon={<HardDrive size={18} />}
      title="Proteção do armazenamento"
      description={
        state === 'persisted'
          ? 'Ativada: o navegador não apaga seus dados automaticamente.'
          : 'Peça ao navegador para não apagar seus dados quando o aparelho estiver com pouco espaço.'
      }
      action={
        state === 'persisted' ? (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <ShieldCheck size={16} aria-hidden /> Protegido
          </span>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => void request()}>
            Proteger dados
          </Button>
        )
      }
    />
  );
}

export interface DataSectionProps {
  data: FinanceData;
  today: ISODate;
}

/** Backup, importação, exportação CSV, dados de exemplo e exclusão total. */
export function DataSection({ data, today }: DataSectionProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();
  const [pendingImport, setPendingImport] = useState<{ backup: BackupFile; fileName: string } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState<'backup' | 'demo' | null>(null);

  async function exportJson() {
    setBusy('backup');
    try {
      const name = await downloadBackup(today);
      toast(`Backup salvo como ${name}.`);
    } catch {
      toast('Não foi possível gerar o backup.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function onFileChosen(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setImportError(null);
    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportError('Não foi possível ler o arquivo.');
      return;
    }
    const result = parseBackupText(text);
    if (!result.ok) {
      setImportError(result.error);
      toast('Arquivo de backup inválido.', 'error');
      return;
    }
    setPendingImport({ backup: result.backup, fileName: file.name });
  }

  function exportCsv() {
    if (data.transactions.length === 0) {
      toast('Ainda não há lançamentos para exportar.', 'info');
      return;
    }
    const csv = transactionsToCSV(data.transactions, data.categories, data.accounts);
    downloadCSV(`patrimonius-lancamentos-${today}.csv`, csv);
    toast(`Planilha com ${plural(data.transactions.length, 'lançamento', 'lançamentos')} salva.`);
  }

  async function loadDemo() {
    const ok = await confirm({
      title: 'Carregar dados de exemplo?',
      message:
        'TODOS os dados atuais serão apagados e substituídos por cerca de 6 meses de dados fictícios. ' +
        'Exporte um backup antes se quiser guardar o que já registrou.',
      confirmLabel: 'Substituir tudo',
      danger: true,
    });
    if (!ok) return;
    setBusy('demo');
    try {
      await loadDemoData(today);
      toast('Dados de exemplo carregados. Explore à vontade!');
    } catch {
      toast('Não foi possível carregar os dados de exemplo.', 'error');
    } finally {
      setBusy(null);
    }
  }

  const summary = [
    plural(data.accounts.length, 'conta', 'contas'),
    plural(data.transactions.length, 'lançamento', 'lançamentos'),
    plural(data.categories.length, 'categoria', 'categorias'),
    plural(data.goals.length, 'meta', 'metas'),
  ].join(' · ');

  return (
    <Card id="dados" className="scroll-mt-20">
      <CardHeader
        icon={<DatabaseBackup size={20} />}
        title="Dados e privacidade"
        subtitle="Tudo fica salvo apenas neste navegador. Faça backups regularmente."
      />
      <p className="mb-1 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
        Neste dispositivo: {summary}
      </p>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        <ActionRow
          icon={<Download size={18} />}
          title="Exportar backup"
          description="Arquivo .json com todos os seus dados, para guardar ou levar para outro aparelho."
          action={
            <Button variant="secondary" size="sm" onClick={() => void exportJson()} loading={busy === 'backup'}>
              Exportar backup
            </Button>
          }
        />
        <ActionRow
          icon={<Upload size={18} />}
          title="Importar backup"
          description={
            <>
              Restaure um arquivo gerado pelo Patrimonius. Você poderá escolher entre substituir ou mesclar.
              {importError && (
                <span role="alert" className="mt-1 block font-medium text-rose-600 dark:text-rose-400">
                  {importError}
                </span>
              )}
            </>
          }
          action={
            <>
              <input
                ref={fileInputRef}
                id={fileInputId}
                type="file"
                accept=".json,application/json"
                aria-label="Arquivo de backup"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => void onFileChosen(e)}
              />
              <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                Escolher arquivo
              </Button>
            </>
          }
        />
        <ActionRow
          icon={<FileSpreadsheet size={18} />}
          title="Exportar lançamentos (CSV)"
          description="Planilha com todos os lançamentos, pronta para Excel, LibreOffice ou Google Planilhas."
          action={
            <Button variant="secondary" size="sm" onClick={exportCsv}>
              Exportar CSV
            </Button>
          }
        />
        <StoragePersistence />
        <ActionRow
          icon={<Sparkles size={18} />}
          title="Carregar dados de exemplo"
          description="Substitui tudo por 6 meses de dados fictícios para explorar o app e o agente."
          action={
            <Button variant="secondary" size="sm" onClick={() => void loadDemo()} loading={busy === 'demo'}>
              Carregar exemplo
            </Button>
          }
        />
        <ActionRow
          danger
          icon={<Trash2 size={18} />}
          title="Apagar todos os dados"
          description="Remove tudo deste dispositivo e volta à tela de boas-vindas."
          action={
            <Button variant="danger" size="sm" onClick={() => setResetOpen(true)}>
              Apagar tudo
            </Button>
          }
        />
      </ul>

      {pendingImport && (
        <ImportBackupModal
          backup={pendingImport.backup}
          fileName={pendingImport.fileName}
          today={today}
          onClose={() => setPendingImport(null)}
        />
      )}
      {resetOpen && <ResetDataModal today={today} onClose={() => setResetOpen(false)} />}
    </Card>
  );
}
