import { SlidersHorizontal } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button, Card, CardHeader, Field, Input, Money, MoneyInput, useToast } from '@/components/ui';
import { updateSettings } from '@/db/repo';
import type { Cents, Settings } from '@/domain/types';
import {
  EMERGENCY_MONTHS,
  SAVINGS_RATE,
  emergencyMonthsError,
  parseIntInRange,
  savingsRateError,
} from './preferences';

/** Metas pessoais usadas pelas análises e pelo agente. */
export function PreferencesSection({ settings }: { settings: Settings }) {
  const toast = useToast();
  const ids = { months: useId(), rate: useId(), income: useId() };
  const [months, setMonths] = useState(String(settings.emergencyFundTargetMonths));
  const [rate, setRate] = useState(String(settings.savingsRateTarget));
  const [income, setIncome] = useState<Cents | null>(settings.monthlyIncomeEstimate);
  const [saving, setSaving] = useState(false);

  const monthsErr = emergencyMonthsError(months);
  const rateErr = savingsRateError(rate);
  const parsedMonths = parseIntInRange(months, EMERGENCY_MONTHS.min, EMERGENCY_MONTHS.max);
  const parsedRate = parseIntInRange(rate, SAVINGS_RATE.min, SAVINGS_RATE.max);
  const normalizedIncome = income && income > 0 ? income : null;
  const dirty =
    parsedMonths !== settings.emergencyFundTargetMonths ||
    parsedRate !== settings.savingsRateTarget ||
    normalizedIncome !== settings.monthlyIncomeEstimate;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (parsedMonths === null || parsedRate === null) return;
    setSaving(true);
    try {
      await updateSettings({
        emergencyFundTargetMonths: parsedMonths,
        savingsRateTarget: parsedRate,
        monthlyIncomeEstimate: normalizedIncome,
      });
      toast('Preferências financeiras salvas.');
    } catch {
      toast('Não foi possível salvar as preferências.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card id="preferencias" className="scroll-mt-20">
      <CardHeader
        icon={<SlidersHorizontal size={20} />}
        title="Preferências financeiras"
        subtitle="Suas metas guiam os alertas e as dicas do agente."
      />
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field
          label="Meta da reserva de emergência"
          htmlFor={ids.months}
          error={monthsErr}
          hint="Meses de custo essencial guardados. O recomendado é 6."
        >
          <div className="relative">
            <Input
              id={ids.months}
              type="number"
              inputMode="numeric"
              min={EMERGENCY_MONTHS.min}
              max={EMERGENCY_MONTHS.max}
              step={1}
              value={months}
              aria-invalid={!!monthsErr}
              className="pr-16"
              onChange={(e) => setMonths(e.target.value)}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">
              meses
            </span>
          </div>
        </Field>
        <Field
          label="Meta de poupança"
          htmlFor={ids.rate}
          error={rateErr}
          hint="Parte da renda guardada todo mês. A regra 50/30/20 sugere 20%."
        >
          <div className="relative">
            <Input
              id={ids.rate}
              type="number"
              inputMode="numeric"
              min={SAVINGS_RATE.min}
              max={SAVINGS_RATE.max}
              step={1}
              value={rate}
              aria-invalid={!!rateErr}
              className="pr-10"
              onChange={(e) => setRate(e.target.value)}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">
              %
            </span>
          </div>
        </Field>
        <Field
          label="Renda mensal estimada (líquida)"
          htmlFor={ids.income}
          className="sm:col-span-2"
          hint="Usada enquanto há pouco histórico de receitas. Deixe em branco se preferir."
        >
          <MoneyInput id={ids.income} value={income} onChange={setIncome} />
        </Field>
        {normalizedIncome !== null && parsedRate !== null && parsedRate > 0 && (
          <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900 sm:col-span-2 dark:bg-brand-950 dark:text-brand-200">
            Guardar {parsedRate}% de <Money value={normalizedIncome} /> significa{' '}
            <strong>
              <Money value={Math.round((normalizedIncome * parsedRate) / 100)} />
            </strong>{' '}
            por mês.
          </p>
        )}
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" loading={saving} disabled={!dirty || !!monthsErr || !!rateErr}>
            Salvar preferências
          </Button>
        </div>
      </form>
    </Card>
  );
}
