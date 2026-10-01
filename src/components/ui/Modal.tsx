import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';
import { cn } from './cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Rodapé (normalmente botões Cancelar/Salvar). */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZES = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };

/** Id do conteúdo principal (AppShell): recebe o foco quando o elemento que abriu o modal não existe mais. */
export const MAIN_CONTENT_ID = 'conteudo';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex], [contenteditable="true"]';

/** Modais abertos (o último é o do topo): só ele responde ao Esc e o app fica inerte enquanto houver algum. */
const openModals: symbol[] = [];

/** Deixa o app (#root) inerte: Tab, leitores de tela e cliques não alcançam a página coberta pelo modal. */
function setAppInert(inert: boolean) {
  const root = document.getElementById('root');
  if (!root) return;
  if (inert) root.setAttribute('inert', '');
  else root.removeAttribute('inert');
}

function focusables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0 && !el.closest('[hidden], [inert]'),
  );
}

/** Devolve o foco a quem abriu o modal; se ele sumiu (ou era o <body>), ao conteúdo principal. */
function restoreFocus(target: Element | null) {
  if (target instanceof HTMLElement && target.isConnected && target !== document.body) {
    target.focus({ preventScroll: true });
    if (document.activeElement === target) return;
  }
  document.getElementById(MAIN_CONTENT_ID)?.focus({ preventScroll: true });
}

/**
 * Diálogo modal acessível. No celular aparece como "bottom sheet". Fecha com ESC ou clique fora.
 * Prende o foco (Tab/Shift+Tab circulam dentro do diálogo), deixa o resto do app inerte e, ao fechar, devolve o
 * foco ao elemento que o abriu.
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Quem abriu o modal: lido na renderização da abertura, ANTES de um `autoFocus` dos filhos mover o foco.
  const [wasOpen, setWasOpen] = useState(open);
  const [opener, setOpener] = useState<Element | null>(() => (open ? document.activeElement : null));
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpener(document.activeElement);
  }
  const openerRef = useRef(opener);
  useEffect(() => {
    openerRef.current = opener;
  }, [opener]);

  useEffect(() => {
    if (!open) return;
    // Quem abriu saiu da tela no mesmo clique (ex.: outro modal que fechou): usa onde o foco está agora.
    const captured = openerRef.current;
    if (!(captured instanceof HTMLElement && captured.isConnected) && !panelRef.current?.contains(document.activeElement)) {
      openerRef.current = document.activeElement;
    }
    const token = Symbol('modal');
    openModals.push(token);
    setAppInert(true);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && openModals[openModals.length - 1] === token) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Foca o primeiro campo do modal.
    const t = window.setTimeout(() => {
      // Não rouba o foco se o usuário já está interagindo dentro do modal.
      if (panelRef.current?.contains(document.activeElement)) return;
      const el = panelRef.current?.querySelector<HTMLElement>(
        'input:not([type=hidden]), select, textarea, button[data-autofocus]',
      );
      (el ?? panelRef.current)?.focus();
    }, 30);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      const index = openModals.indexOf(token);
      if (index >= 0) openModals.splice(index, 1);
      // Antes de devolver o foco: elementos inertes não recebem foco.
      if (openModals.length === 0) setAppInert(false);
      restoreFocus(openerRef.current);
    };
  }, [open]);

  /** Tab/Shift+Tab circulam entre o primeiro e o último elemento focável do diálogo. */
  function onPanelKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const panel = panelRef.current;
    // Eventos de um modal aninhado (portal) também passam por aqui pela árvore do React: ignora.
    if (e.key !== 'Tab' || !panel || !panel.contains(e.target as Node)) return;
    const nodes = focusables(panel);
    if (!nodes.length) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel || !panel.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onPanelKeyDown}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl outline-none sm:rounded-2xl dark:bg-slate-900',
          SIZES[size],
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
          </div>
          <IconButton label="Fechar" onClick={onClose} size="sm">
            <X size={18} />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-slate-800">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
