import { Palette } from 'lucide-react';
import { Card, CardHeader, Money, SegmentedControl, Switch, useToast } from '@/components/ui';
import { updateSettings } from '@/db/repo';
import type { Settings, ThemePreference } from '@/domain/types';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
];

/** Tema e modo privacidade (aplicados na hora, sem botão de salvar). */
export function AppearanceSection({ settings }: { settings: Settings }) {
  const toast = useToast();

  async function save(patch: Partial<Pick<Settings, 'theme' | 'hideValues'>>) {
    try {
      await updateSettings(patch);
    } catch {
      toast('Não foi possível salvar a aparência.', 'error');
    }
  }

  return (
    <Card id="aparencia" className="scroll-mt-20">
      <CardHeader icon={<Palette size={20} />} title="Aparência" subtitle="As mudanças são aplicadas na hora." />
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Tema</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">"Sistema" segue a configuração do aparelho.</p>
          </div>
          <SegmentedControl
            aria-label="Tema"
            options={THEME_OPTIONS}
            value={settings.theme}
            onChange={(theme) => void save({ theme })}
          />
        </div>
        <Switch
          checked={settings.hideValues}
          onChange={(hideValues) => void save({ hideValues })}
          label="Ocultar valores"
          description="Borra os valores na tela, útil em lugares públicos. Também pelo ícone de olho no topo."
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Prévia: <Money value={123456} className="font-semibold text-slate-700 dark:text-slate-200" />
        </p>
      </div>
    </Card>
  );
}
