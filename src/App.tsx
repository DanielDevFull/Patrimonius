import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import { router } from '@/app/router';
import { ThemeController } from '@/app/ThemeController';
import { FeedbackProvider, Spinner } from '@/components/ui';
import { ensureInitialized, runRecurring } from '@/db/repo';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureInitialized();
        await runRecurring();
        if (!cancelled) setReady(true);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Não foi possível abrir seus dados</h1>
        <p className="mt-2 text-sm text-slate-500">{error}</p>
        <p className="mt-2 text-sm text-slate-500">
          Verifique se o navegador permite armazenamento local (IndexedDB) e se não está em modo anônimo restrito.
        </p>
      </div>
    );
  }
  if (!ready) return <Spinner label="Abrindo o Patrimonius…" />;

  return (
    <FeedbackProvider>
      <ThemeController />
      <RouterProvider router={router} />
    </FeedbackProvider>
  );
}
