import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { cn } from './cn';
import { FeedbackContext, type ConfirmOptions, type FeedbackApi, type ToastTone } from './feedback-context';
import { Modal } from './Modal';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

/** Provedor de diálogos de confirmação e notificações (toasts). Envolve o app inteiro. */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const confirm = useCallback((opts: ConfirmOptions) => {
    resolverRef.current?.(false);
    setConfirmState(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const close = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setConfirmState(null);
  }, []);

  const toast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const api = useMemo<FeedbackApi>(() => ({ confirm, toast }), [confirm, toast]);

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <Modal
        open={!!confirmState}
        onClose={() => close(false)}
        title={confirmState?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              {confirmState?.cancelLabel ?? 'Cancelar'}
            </Button>
            <Button variant={confirmState?.danger ? 'danger' : 'primary'} onClick={() => close(true)} data-autofocus>
              {confirmState?.confirmLabel ?? 'Confirmar'}
            </Button>
          </>
        }
      >
        {confirmState?.message && <p className="text-sm text-slate-600 dark:text-slate-300">{confirmState.message}</p>}
      </Modal>
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg',
              t.tone === 'success' && 'bg-emerald-600',
              t.tone === 'error' && 'bg-rose-600',
              t.tone === 'info' && 'bg-slate-800',
            )}
            role="status"
          >
            {t.tone === 'success' && <CheckCircle2 size={18} />}
            {t.tone === 'error' && <XCircle size={18} />}
            {t.tone === 'info' && <Info size={18} />}
            {t.message}
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}
