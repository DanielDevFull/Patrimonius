import { Eye, EyeOff, Menu, Plus } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { MOBILE_PRIMARY, NAV_ITEMS, newTransactionPath, ROUTES } from '@/app/navigation';
import { useSettings } from '@/db/hooks';
import { updateSettings } from '@/db/repo';
import { cn, IconButton, Modal, Spinner } from '@/components/ui';

const OnboardingWizard = lazy(() => import('@/features/onboarding/OnboardingWizard'));

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <img src="./favicon.svg" alt="" className="size-8" />
      <span className="text-lg font-bold tracking-tight">Patrimonius</span>
    </div>
  );
}

function PrivacyToggle({ hidden }: { hidden: boolean }) {
  return (
    <IconButton
      label={hidden ? 'Mostrar valores' : 'Ocultar valores'}
      onClick={() => void updateSettings({ hideValues: !hidden })}
    >
      {hidden ? <EyeOff size={20} /> : <Eye size={20} />}
    </IconButton>
  );
}

/** Estrutura principal: menu lateral (desktop), barra inferior (celular), botão "+" de lançamento rápido. */
export function AppShell() {
  const settings = useSettings();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const hidden = settings?.hideValues ?? false;

  if (settings && !settings.onboardingDone) {
    return (
      <Suspense fallback={<Spinner />}>
        <OnboardingWizard />
      </Suspense>
    );
  }

  const primary = NAV_ITEMS.filter((i) => MOBILE_PRIMARY.includes(i.to));
  const secondary = NAV_ITEMS.filter((i) => !MOBILE_PRIMARY.includes(i.to));

  return (
    <div className={cn('min-h-dvh', hidden && 'hide-values')}>
      {/* Menu lateral (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-16 items-center justify-between px-5">
          <Logo />
          <PrivacyToggle hidden={hidden} />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="Menu principal">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === ROUTES.dashboard}
              className={({ isActive }) =>
                cn(
                  'mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white',
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3">
          <button
            type="button"
            onClick={() => navigate(newTransactionPath('despesa'))}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-800"
          >
            <Plus size={18} /> Novo lançamento
          </button>
          <p className="mt-3 text-center text-[11px] text-slate-400">Seus dados ficam só neste dispositivo.</p>
        </div>
      </aside>

      {/* Topo (celular) */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/90">
        <Logo />
        <PrivacyToggle hidden={hidden} />
      </header>

      <main className="px-4 pb-28 pt-5 sm:px-6 lg:ml-64 lg:px-8 lg:pb-10 lg:pt-8">
        <div className="mx-auto max-w-6xl">
          <Suspense fallback={<Spinner />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      {/* Barra inferior (celular) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-slate-800 dark:bg-slate-900"
        aria-label="Navegação"
      >
        <div className="grid grid-cols-5 items-center">
          {primary.slice(0, 2).map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === ROUTES.dashboard}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
                  isActive ? 'text-brand-700 dark:text-brand-400' : 'text-slate-500',
                )
              }
            >
              <Icon size={22} />
              {label}
            </NavLink>
          ))}
          <div className="flex justify-center">
            <button
              type="button"
              aria-label="Novo lançamento"
              onClick={() => navigate(newTransactionPath('despesa'))}
              className="-mt-6 flex size-14 items-center justify-center rounded-full bg-brand-700 text-white shadow-lg ring-4 ring-slate-50 dark:ring-slate-950"
            >
              <Plus size={28} />
            </button>
          </div>
          {primary.slice(2).map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
                  isActive ? 'text-brand-700 dark:text-brand-400' : 'text-slate-500',
                )
              }
            >
              <Icon size={22} />
              {label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500"
          >
            <Menu size={22} />
            Mais
          </button>
        </div>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Menu">
        <div className="grid grid-cols-3 gap-2">
          {secondary.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMoreOpen(false)}
              className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-3 text-center text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Icon size={22} className="text-brand-700 dark:text-brand-400" />
              {label}
            </NavLink>
          ))}
        </div>
      </Modal>
    </div>
  );
}
