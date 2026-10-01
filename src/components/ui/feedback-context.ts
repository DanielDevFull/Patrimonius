import { createContext, useContext } from 'react';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Botão de confirmação vermelho (ações destrutivas). */
  danger?: boolean;
}

export type ToastTone = 'success' | 'error' | 'info';

export interface FeedbackApi {
  /** Abre um diálogo de confirmação; resolve true se o usuário confirmar. */
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /** Mostra uma notificação temporária (some depois de `durationMs`, padrão 3,5 s). */
  toast: (message: string, tone?: ToastTone, durationMs?: number) => void;
}

export const FeedbackContext = createContext<FeedbackApi | null>(null);

/** Diálogo de confirmação: `const confirm = useConfirm(); if (await confirm({ title: 'Excluir?' })) ...` */
export function useConfirm(): FeedbackApi['confirm'] {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useConfirm precisa de <FeedbackProvider>');
  return ctx.confirm;
}

/** Notificações: `const toast = useToast(); toast('Salvo!', 'success')` */
export function useToast(): FeedbackApi['toast'] {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useToast precisa de <FeedbackProvider>');
  return ctx.toast;
}
