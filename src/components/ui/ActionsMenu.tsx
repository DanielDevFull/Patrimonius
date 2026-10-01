import { MoreVertical } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { IconButton } from './Button';
import { cn } from './cn';

export interface ActionsMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface ActionsMenuProps {
  /** Rótulo acessível do botão (ex.: "Ações de Mercado"). */
  label: string;
  items: ActionsMenuItem[];
  className?: string;
}

/** Atributo da barra inferior fixa (celular): o menu não pode abrir por baixo dela. */
export const BOTTOM_NAV_ATTR = 'data-bottom-nav';

/** Limite inferior da área tocável: a altura da janela ou o topo da barra inferior fixa, se estiver visível. */
function visibleBottom(): number {
  let limit = window.innerHeight;
  const nav = document.querySelector<HTMLElement>(`[${BOTTOM_NAV_ATTR}]`);
  const rect = nav?.getBoundingClientRect();
  if (rect && rect.height > 0) limit = Math.min(limit, rect.top);
  return limit;
}

type Placement = 'down' | 'up';

/**
 * Menu de ações (botão "⋮" + lista). Fecha com ESC, clique fora, ao escolher um item ou quando o foco sai dele (Tab);
 * setas ↑/↓ e Home/End navegam entre os itens e o foco volta ao botão ao fechar com ESC.
 * Abre para cima quando não cabe abaixo do botão (ex.: último item da lista, acima da barra inferior do celular).
 */
export function ActionsMenu({ label, items, className }: ActionsMenuProps) {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const open = placement !== null;
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Mede antes de pintar: se o menu passaria do limite de baixo e há mais espaço acima, abre para cima.
  useLayoutEffect(() => {
    if (placement !== 'down') return;
    const menu = menuRef.current?.getBoundingClientRect();
    const root = rootRef.current?.getBoundingClientRect();
    if (!menu || !root) return;
    const limit = visibleBottom();
    if (menu.bottom > limit && root.top > limit - root.bottom) {
      setPlacement('up');
    }
  }, [placement]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPlacement(null);
    };
    // No documento (fase de captura): fecha só o menu, mesmo que o foco já tenha saído dele.
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      const active = document.activeElement;
      const focusWasInside = !active || active === document.body || !!rootRef.current?.contains(active);
      setPlacement(null);
      if (focusWasInside) rootRef.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey, true);
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const nodes = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    );
    if (!nodes.length) return;
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    let next: number;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = nodes.length - 1;
    else if (e.key === 'ArrowDown') next = (index + 1) % nodes.length;
    else next = (index - 1 + nodes.length) % nodes.length;
    nodes[next].focus();
  }

  return (
    <div
      ref={rootRef}
      className={cn('relative', className)}
      onBlur={(e) => {
        // Tab para fora do menu: fecha. (Sem destino — ex.: toque fora — quem fecha é o listener de ponteiro.)
        const next = e.relatedTarget as Node | null;
        if (open && next && !rootRef.current?.contains(next)) setPlacement(null);
      }}
    >
      <IconButton
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setPlacement((p) => (p ? null : 'down'));
        }}
      >
        <MoreVertical size={18} />
      </IconButton>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={cn(
            // z-40: acima da barra inferior (z-30) e abaixo de modais (z-50) e notificações (z-60).
            'absolute right-0 z-40 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900',
            placement === 'up' ? 'bottom-full mb-1' : 'top-full mt-1',
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={(e) => {
                e.stopPropagation();
                setPlacement(null);
                // O foco volta ao "⋮" antes da ação: um modal aberto por ela devolve o foco a ele ao fechar.
                rootRef.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus();
                item.onSelect();
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors focus:outline-none disabled:opacity-50',
                item.danger
                  ? 'text-rose-600 hover:bg-rose-50 focus:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950 dark:focus:bg-rose-950'
                  : 'text-slate-700 hover:bg-slate-100 focus:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:bg-slate-800',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
