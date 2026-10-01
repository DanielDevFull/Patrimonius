import { useEffect, useState } from 'react';
import { Link, useRouteError } from 'react-router';
import { Button, cn } from '@/components/ui';
import { downloadBackup } from '@/db/backup';
import { ROUTES } from './navigation';
import { isChunkLoadError, reloadOnceForChunkError } from './route-error';

const linkClass =
  'inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:ring-slate-600 dark:hover:bg-slate-800';

/**
 * Tela de erro das rotas (errorElement), em pt-BR e sem detalhes técnicos. Dentro do AppShell o menu continua
 * visível; na raiz (`fullPage`) ocupa a tela toda. Erro de carregamento de uma versão antiga do app recarrega a
 * página uma vez.
 */
export function RouteError({ fullPage = false }: { fullPage?: boolean }) {
  const error = useRouteError();
  const outdated = isChunkLoadError(error);
  const [backup, setBackup] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  useEffect(() => {
    console.error(error);
    reloadOnceForChunkError(error);
  }, [error]);

  async function exportBackup() {
    setBackup('saving');
    try {
      await downloadBackup();
      setBackup('saved');
    } catch (e) {
      console.error(e);
      setBackup('failed');
    }
  }

  return (
    <div
      role="alert"
      className={cn(
        'mx-auto flex max-w-lg flex-col items-center gap-3 px-4 py-10 text-center',
        fullPage && 'min-h-dvh justify-center',
      )}
    >
      <div className="text-4xl" aria-hidden>
        {outdated ? '🔄' : '⚠️'}
      </div>
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        {outdated ? 'O Patrimonius foi atualizado' : 'Algo deu errado nesta página'}
      </h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {outdated
          ? 'Esta aba ainda usa a versão anterior do app. Recarregue a página para continuar — seus dados não foram afetados.'
          : 'Seus dados continuam salvos neste dispositivo. Tente outra página, recarregue o app ou, se o problema continuar, exporte um backup em Configurações.'}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button onClick={() => window.location.reload()}>Recarregar</Button>
        <Link to={ROUTES.dashboard} className={linkClass}>
          Ir para o Painel
        </Link>
        <Link to={ROUTES.settings} className={linkClass}>
          Ir para Configurações
        </Link>
        {!outdated && (
          <Button variant="ghost" loading={backup === 'saving'} onClick={() => void exportBackup()}>
            Exportar backup
          </Button>
        )}
      </div>
      {backup === 'saved' && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">Backup salvo na pasta de downloads.</p>
      )}
      {backup === 'failed' && (
        <p className="text-sm text-rose-600 dark:text-rose-400">Não foi possível exportar o backup.</p>
      )}
    </div>
  );
}
