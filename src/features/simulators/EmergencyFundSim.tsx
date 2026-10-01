import { CalendarCheck, ShieldCheck } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { emergencyFund, type EmergencyFundLevel } from '@/analytics';
import { Badge, Button, Field, Input, Money, MoneyInput, ProgressBar, type BadgeTone } from '@/components/ui';
import type { Cents, FinanceData, ISODate } from '@/domain/types';
import { formatDuration, monthLongFrom, parsePercent, parsePositiveInt } from './shared/format';
import { monthlyToCompleteIn, reservePlan } from './simulator-utils';
import { SimCard, SimEmpty } from './SimLayout';

const LEVEL_META: Record<EmergencyFundLevel, { label: string; tone: BadgeTone }> = {
  sem_dados: { label: 'Sem dados', tone: 'neutral' },
  critica: { label: 'Crítica', tone: 'negative' },
  baixa: { label: 'Baixa', tone: 'warning' },
  parcial: { label: 'Parcial', tone: 'info' },
  completa: { label: 'Completa', tone: 'positive' },
};

const monthsFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

function levelOf(monthsCovered: number | null, reserve: Cents, target: Cents): EmergencyFundLevel {
  if (monthsCovered === null) return 'sem_dados';
  if (reserve >= target) return 'completa';
  if (monthsCovered < 1) return 'critica';
  if (monthsCovered < 3) return 'baixa';
  return 'parcial';
}

/** Reserva de emergência: situação atual e em quanto tempo completa com um aporte mensal. */
export function EmergencyFundSim({ data, today }: { data: FinanceData; today: ISODate }) {
  const ids = { essential: useId(), months: useId(), monthly: useId(), rate: useId() };
  const fund = useMemo(() => emergencyFund(data, today), [data, today]);
  /** undefined = usar o valor calculado pelas análises. */
  const [essentialInput, setEssentialInput] = useState<Cents | null | undefined>(undefined);
  const [monthsInput, setMonthsInput] = useState<string | undefined>(undefined);
  const [monthly, setMonthly] = useState<Cents | null>(null);
  const [rate, setRate] = useState('');

  const essential =
    essentialInput === undefined
      ? fund.monthlyEssential > 0
        ? fund.monthlyEssential
        : null
      : essentialInput;
  const monthsText = monthsInput ?? String(fund.targetMonths);
  const targetMonths = parsePositiveInt(monthsText);
  const yieldPct = rate.trim() ? parsePercent(rate) : 0;
  const rateError = yieldPct === null ? 'Taxa inválida. Ex.: 10' : undefined;
  const monthsError = targetMonths === null || targetMonths > 60 ? 'Use de 1 a 60 meses.' : undefined;

  const plan =
    essential !== null && essential > 0 && targetMonths !== null && targetMonths <= 60 && yieldPct !== null
      ? reservePlan(fund.reserve, essential, targetMonths, monthly ?? 0, yieldPct)
      : null;
  const level = plan ? levelOf(plan.monthsCovered, fund.reserve, plan.target) : 'sem_dados';
  const suggestion = plan ? monthlyToCompleteIn(plan.gap, 12) : 0;

  return (
    <SimCard
      title="Reserva de emergência"
      subtitle="Dinheiro guardado para imprevistos (perda de renda, saúde, conserto). O ideal é cobrir de 3 a 6 meses do seu custo essencial."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Custo essencial por mês"
          htmlFor={ids.essential}
          hint={
            fund.monthlyEssential > 0 && essentialInput === undefined
              ? 'Calculado pelos seus gastos essenciais'
              : 'Moradia, contas, mercado, saúde, transporte…'
          }
        >
          <MoneyInput id={ids.essential} value={essential} onChange={setEssentialInput} />
        </Field>
        <Field label="Meta (meses de custo)" htmlFor={ids.months} error={monthsError}>
          <Input
            id={ids.months}
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            value={monthsText}
            onChange={(e) => setMonthsInput(e.target.value)}
          />
        </Field>
        <Field label="Quanto posso guardar por mês" htmlFor={ids.monthly}>
          <MoneyInput id={ids.monthly} value={monthly} onChange={setMonthly} />
        </Field>
        <Field label="Rendimento ao ano (%)" htmlFor={ids.rate} error={rateError} hint="Opcional. Ex.: 10">
          <Input
            id={ids.rate}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </Field>
      </div>

      {!plan ? (
        <SimEmpty>
          Ainda não há gastos essenciais suficientes registrados. Informe acima quanto você gasta por mês com
          o essencial para calcular a reserva ideal.
        </SimEmpty>
      ) : (
        <div className="mt-5 space-y-4" aria-live="polite">
          <section aria-label="Situação da reserva" className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Reserva atual:{' '}
                <Money value={fund.reserve} className="font-semibold text-slate-900 dark:text-white" /> de{' '}
                <Money value={plan.target} className="font-semibold text-slate-900 dark:text-white" />
              </p>
              <Badge tone={LEVEL_META[level].tone}>
                <ShieldCheck size={12} aria-hidden /> {LEVEL_META[level].label}
              </Badge>
            </div>
            <ProgressBar
              value={plan.target > 0 ? fund.reserve / plan.target : 1}
              tone="brand"
              label="Progresso da reserva de emergência"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cobre {monthsFmt.format(Math.floor((plan.monthsCovered ?? 0) * 10) / 10)}{' '}
              {plan.monthsCovered !== null && plan.monthsCovered >= 1 && plan.monthsCovered < 2
                ? 'mês'
                : 'meses'}{' '}
              do seu custo essencial. Saldo de contas correntes, poupança, carteira e investimentos.
            </p>
          </section>

          {plan.gap === 0 ? (
            <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
              🎉 Sua reserva de emergência está completa! Daqui pra frente, o que sobrar pode ir para metas e
              investimentos de longo prazo.
            </p>
          ) : (monthly ?? 0) <= 0 ? (
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
              <p>
                Faltam <Money value={plan.gap} className="font-semibold" />. Informe quanto você consegue
                guardar por mês para ver quando a reserva fica completa.
              </p>
              {suggestion > 0 && (
                <Button size="sm" variant="secondary" className="mt-3" onClick={() => setMonthly(suggestion)}>
                  Completar em 12 meses: <Money value={suggestion} />
                  /mês
                </Button>
              )}
            </div>
          ) : plan.monthsToComplete === null ? (
            <p
              role="alert"
              className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
            >
              Com esse valor, a reserva não fica completa em um prazo razoável. Tente guardar um pouco mais
              por mês.
            </p>
          ) : (
            <div className="rounded-xl bg-brand-50 p-4 dark:bg-brand-950/40">
              <p className="flex items-center gap-2 text-sm text-brand-900 dark:text-brand-200">
                <CalendarCheck size={18} aria-hidden /> Guardando <Money value={monthly ?? 0} /> por mês, sua
                reserva fica completa em
              </p>
              <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">
                {formatDuration(plan.monthsToComplete)}
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Previsão: {monthLongFrom(today, plan.monthsToComplete)}. Faltam <Money value={plan.gap} />.
              </p>
            </div>
          )}
        </div>
      )}
    </SimCard>
  );
}
