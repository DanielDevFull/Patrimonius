import { CalendarCheck, Lightbulb } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Field, Input, Money, MoneyInput } from '@/components/ui';
import type { Cents, ISODate } from '@/domain/types';
import { formatDuration, monthLongFrom, parsePercent } from '@/domain/format';
import { goalTime } from './simulator-utils';
import { SimCard, SimEmpty } from './SimLayout';

/** Quanto a mais por mês o simulador sugere testar. */
const BOOST = 10000;

/** "Quanto tempo até…": meses para atingir um objetivo com valor inicial, aporte e rendimento. */
export function TimeToGoalSim({ today }: { today: ISODate }) {
  const ids = { target: useId(), initial: useId(), monthly: useId(), rate: useId() };
  const [target, setTarget] = useState<Cents | null>(null);
  const [initial, setInitial] = useState<Cents | null>(null);
  const [monthly, setMonthly] = useState<Cents | null>(null);
  const [rate, setRate] = useState('10');

  const annual = parsePercent(rate);
  const rateError = rate.trim() && annual === null ? 'Taxa inválida. Ex.: 10,5' : undefined;
  const ready = target !== null && target > 0 && annual !== null;
  const result = useMemo(
    () => (ready ? goalTime(target, initial ?? 0, monthly ?? 0, annual) : null),
    [ready, target, initial, monthly, annual],
  );
  const boosted = useMemo(
    () =>
      ready && result && result.months !== 0
        ? goalTime(target, initial ?? 0, (monthly ?? 0) + BOOST, annual)
        : null,
    [ready, result, target, initial, monthly, annual],
  );

  return (
    <SimCard title="Quanto tempo até…" subtitle="Descubra em quanto tempo você junta o valor de um objetivo.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Objetivo" htmlFor={ids.target} hint="Ex.: entrada do apartamento">
          <MoneyInput id={ids.target} value={target} onChange={setTarget} />
        </Field>
        <Field label="Já tenho" htmlFor={ids.initial}>
          <MoneyInput id={ids.initial} value={initial} onChange={setInitial} />
        </Field>
        <Field label="Aporte mensal" htmlFor={ids.monthly}>
          <MoneyInput id={ids.monthly} value={monthly} onChange={setMonthly} />
        </Field>
        <Field label="Rendimento ao ano (%)" htmlFor={ids.rate} error={rateError}>
          <Input
            id={ids.rate}
            inputMode="decimal"
            autoComplete="off"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </Field>
      </div>

      {!result ? (
        <SimEmpty>Informe o valor do objetivo para calcular.</SimEmpty>
      ) : (
        <div className="mt-5 space-y-3" aria-live="polite">
          {result.months === 0 ? (
            <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
              🎉 Você já tem o valor do objetivo!
            </p>
          ) : result.months === null ? (
            <p
              role="alert"
              className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
            >
              Com esses valores, você não chega lá em 100 anos. Defina um aporte mensal (ou aumente o que já
              tem).
            </p>
          ) : (
            <div className="rounded-xl bg-brand-50 p-4 dark:bg-brand-950/40">
              <p className="flex items-center gap-2 text-sm text-brand-900 dark:text-brand-200">
                <CalendarCheck size={18} aria-hidden /> Você chega lá em
              </p>
              <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">
                {formatDuration(result.months)}
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Previsão: {monthLongFrom(today, result.months)}. Você terá aportado{' '}
                <Money value={result.contributed ?? 0} /> e os juros farão o resto, totalizando{' '}
                <Money value={result.finalBalance ?? 0} />.
              </p>
            </div>
          )}
          {boosted?.months != null && (result.months === null || boosted.months < result.months) && (
            <p className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Lightbulb size={16} aria-hidden className="mt-0.5 shrink-0 text-amber-500" />
              <span>
                Com <Money value={BOOST} /> a mais por mês, você chegaria em {formatDuration(boosted.months)}
                {result.months !== null && ` (${formatDuration(result.months - boosted.months)} antes)`}.
              </span>
            </p>
          )}
        </div>
      )}
    </SimCard>
  );
}
