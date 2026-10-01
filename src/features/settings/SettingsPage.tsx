import { PageHeader, Spinner } from '@/components/ui';
import { useFinanceData, useToday } from '@/db/hooks';
import { AboutSection } from './AboutSection';
import { AppearanceSection } from './AppearanceSection';
import { CategoriesSection } from './CategoriesSection';
import { DataSection } from './DataSection';
import { PreferencesSection } from './PreferencesSection';
import { ProfileSection } from './ProfileSection';

const SECTIONS = [
  { id: 'perfil', label: 'Perfil' },
  { id: 'preferencias', label: 'Preferências' },
  { id: 'aparencia', label: 'Aparência' },
  { id: 'categorias', label: 'Categorias' },
  { id: 'dados', label: 'Dados' },
  { id: 'sobre', label: 'Sobre' },
] as const;

/** Atalhos para as seções (botões, pois o HashRouter usa o "#" da URL para as rotas). */
function SectionNav() {
  return (
    <nav aria-label="Seções das configurações" className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-2">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => document.getElementById(s.id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })}
              className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-brand-300"
            >
              {s.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function SettingsPage() {
  const data = useFinanceData();
  const today = useToday();
  if (!data) return <Spinner />;
  const { settings } = data;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Configurações" subtitle="Personalize o app, organize categorias e cuide dos seus dados." />
      <SectionNav />
      <div className="space-y-4">
        {/* As chaves remontam o formulário quando o valor salvo muda fora dele (ex.: importação de backup). */}
        <ProfileSection key={`${settings.userName}\u0000${settings.agentName}`} settings={settings} />
        <PreferencesSection
          key={`${settings.emergencyFundTargetMonths}|${settings.savingsRateTarget}|${settings.monthlyIncomeEstimate}`}
          settings={settings}
        />
        <AppearanceSection settings={settings} />
        <CategoriesSection
          categories={data.categories}
          transactions={data.transactions}
          recurring={data.recurring}
          budgets={data.budgets}
        />
        <DataSection data={data} today={today} />
        <AboutSection agentName={settings.agentName} />
      </div>
    </div>
  );
}
