import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import { HideValuesController } from '@/app/HideValuesController';
import { RecurringController } from '@/app/RecurringController';
import { router } from '@/app/router';
import { describeStartupError } from '@/app/startup-error';
import { ThemeController } from '@/app/ThemeController';
import { Button, FeedbackProvider, Spinner } from '@/components/ui';
import { ensureInitialized, runRecurring } from '@/db/repo';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recurringFailed, setRecurringFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Abrir o banco é obrigatório: sem ele não há o que mostrar.
      try {
        await ensureInitialized();
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(describeStartupError(e));
        return;
      }
      // Gerar as recorrências do mês grava dados e pode falhar (ex.: armazenamento cheio). Isso não pode impedir
      // o acesso aos dados nem a exportação de um backup: o app abre e avisa.
      try {
        await runRecurring();
      } catch (e) {
        console.error(e);
        if (!cancelled) setRecurringFailed(true);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div role="alert" className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Não foi possível abrir seus dados</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{error}</p>
        <Button className="mt-4" onClick={() => window.location.reload()}>
          Recarregar
        </Button>
      </div>
    );
  }
  if (!ready) return <Spinner label="Abrindo o Patrimonius…" />;

  return (
    <FeedbackProvider>
      <ThemeController />
      <HideValuesController />
      <RecurringController startupFailed={recurringFailed} />
      <RouterProvider router={router} />
    </FeedbackProvider>
  );
}
