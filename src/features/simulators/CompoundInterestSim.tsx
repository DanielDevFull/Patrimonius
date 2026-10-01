import { Coins, PiggyBank, Sparkles } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { annualToMonthlyRate } from '@/analytics';
import { Field, Input, Money, MoneyInput, StatCard } from '@/components/ui';
import type { Cents } from '@/domain/types';
import { CompoundChart } from './CompoundChart';
import { formatDuration, formatRate, parsePercent, parsePositiveInt } from '@/domain/format';
import { MAX_YEARS, compoundSimulation } from './simulator-utils';
import { SimCard, SimEmpty } from './SimLayout';

/** Juros compostos: valor inicial + aporte mensal a uma taxa anual por N anos. */
export function CompoundInterestSim({ hideValues }: { hideValues: boolean }) {
  const ids = { initial: useId(), monthly: useId(), rate: useId(), years: useId() };
  const [initial, setInitial] = useState<Cents | null>(100000);
  const [monthly, setMonthly] = useState<Cents | null>(50000);
  const [rate, setRate] = useState('10');
  const [years, setYears] = useState('10');

  const annual = parsePercent(rate);
  const term = parsePositiveInt(years);
  const yearsError =
    years.trim() && (term === null || term > MAX_YEARS) ? `Use de 1 a ${MAX_YEARS} anos.` : undefined;
  const rateError = rate.trim() && annual === null ? 'Taxa inválida. Ex.: 10,5' : undefined;
  const result = useMemo(() => {
    if (annual === null || term === null || term > MAX_YEARS) return null;
    if ((initial ?? 0) <= 0 && (monthly ?? 0) <= 0) return null;
    return compoundSimulation(initial ?? 0, monthly ?? 0, annual, term);
  }, [initial, monthly, annual, term]);
  const interestShare = result && result.final > 0 ? result.interest / result.final : 0;

  return (
    <SimCard
      title="Juros compostos"
      subtitle="Veja quanto seu dinheiro rende com aportes todo mês. Os aportes entram no fim de cada mês."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Valor inicial" htmlFor={ids.initial}>
          <MoneyInput id={ids.initial} value={initial} onChange={setInitial} />
        </Field>
        <Field label="Aporte mensal" htmlFor={ids.monthly}>
          <MoneyInput id={ids.monthly} value={monthly} onChange={setMonthly} />
        </Field>
        <Field
          label="Rendimento ao ano (%)"
          htmlFor={ids.rate}
          error={rateError}
          hint={annual !== null ? `≈ ${formatRate(annualToMonthlyRate(annual), 4)} ao mês` : undefined}
        >
          <Input
            id={ids.rate}
            inputMode="decimal"
            autoComplete="off"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </Field>
        <Field label="Prazo (anos)" htmlFor={ids.years} error={yearsError}>
          <Input
            id={ids.years}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_YEARS}
            value={years}
            onChange={(e) => setYears(e.target.value)}
          />
        </Field>
      </div>

      {!result ? (
        <SimEmpty>
          Informe um valor inicial ou um aporte mensal, a taxa e o prazo para ver o resultado.
        </SimEmpty>
      ) : (
        <div className="mt-5 space-y-5" aria-live="polite">
          <section aria-label="Resultado" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Valor final"
              tone="brand"
              icon={<Sparkles size={20} aria-hidden />}
              value={<Money value={result.final} />}
              hint={`Em ${formatDuration(result.points.length - 1)}`}
            />
            <StatCard
              label="Total investido"
              icon={<PiggyBank size={20} aria-hidden />}
              value={<Money value={result.contributed} />}
              hint="Valor inicial + aportes"
            />
            <StatCard
              label="Juros ganhos"
              tone="positive"
              icon={<Coins size={20} aria-hidden />}
              value={<Money value={result.interest} />}
              hint={`${formatRate(Math.round(interestShare * 1000) / 10)} do valor final`}
            />
          </section>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {interestShare >= 0.5
              ? 'Os juros já trabalham mais do que você: mais da metade do valor final vem do rendimento. Esse é o poder dos juros compostos — quanto mais tempo, maior o efeito.'
              : 'Quanto mais tempo o dinheiro fica aplicado, mais os juros sobre juros pesam no resultado. Experimente aumentar o prazo.'}
          </p>
          <CompoundChart points={result.points} hideValues={hideValues} />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Simulação com taxa constante, antes de impostos e taxas. Rentabilidade passada não garante
            rentabilidade futura.
          </p>
        </div>
      )}
    </SimCard>
  );
}
