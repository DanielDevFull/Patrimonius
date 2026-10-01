import { useId, useMemo, useState } from 'react';
import { affordability } from '@/analytics';
import { Field, Input, Money, MoneyInput, cn, MoneyText } from '@/components/ui';
import type { Cents, FinanceData, ISODate } from '@/domain/types';
import { parsePositiveInt } from '@/domain/format';
import { VERDICT_META } from './simulator-utils';
import { SimCard, SimEmpty } from './SimLayout';

const MAX_INSTALLMENTS = 120;

const TONE_CLASSES = {
  positive:
    'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100',
  warning:
    'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
  negative:
    'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100',
} as const;

function Line({ label, value, signed }: { label: string; value: Cents; signed?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <dt className="text-slate-600 dark:text-slate-300">{label}</dt>
      <dd className="font-semibold">
        <Money value={value} signed={signed} colored={signed} />
      </dd>
    </div>
  );
}

/** "Posso comprar?": veredito com base na previsão do mês, sobra média, reserva e orçamentos. */
export function AffordabilitySim({ data, today }: { data: FinanceData; today: ISODate }) {
  const ids = { amount: useId(), installments: useId() };
  const [amount, setAmount] = useState<Cents | null>(null);
  const [installments, setInstallments] = useState('1');

  const n = parsePositiveInt(installments);
  const installmentsError =
    installments.trim() && (n === null || n > MAX_INSTALLMENTS)
      ? `Use de 1 a ${MAX_INSTALLMENTS} parcelas.`
      : undefined;
  const result = useMemo(
    () =>
      amount !== null && amount > 0 && n !== null && n <= MAX_INSTALLMENTS
        ? affordability(data, today, amount, n)
        : null,
    [data, today, amount, n],
  );
  const meta = result ? VERDICT_META[result.verdict] : null;

  return (
    <SimCard
      title="Posso comprar?"
      subtitle="Eu olho a previsão do seu mês, sua sobra média e sua reserva de emergência antes de responder."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Valor da compra" htmlFor={ids.amount}>
          <MoneyInput id={ids.amount} value={amount} onChange={setAmount} />
        </Field>
        <Field
          label="Parcelas"
          htmlFor={ids.installments}
          error={installmentsError}
          hint={n === 1 ? 'À vista' : undefined}
        >
          <Input
            id={ids.installments}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_INSTALLMENTS}
            value={installments}
            onChange={(e) => setInstallments(e.target.value)}
          />
        </Field>
      </div>

      {!result || !meta ? (
        <SimEmpty>Informe o valor da compra para ver o veredito.</SimEmpty>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2" aria-live="polite">
          <section aria-label="Veredito" className={cn('rounded-2xl border p-4', TONE_CLASSES[meta.tone])}>
            <p className="text-2xl font-bold">
              <span aria-hidden>{meta.emoji}</span> {meta.title}
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
              {result.reasons.map((r) => (
                <li key={r}>
                  <MoneyText text={r} />
                </li>
              ))}
            </ul>
          </section>
          <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200 px-4 py-2 dark:divide-slate-800 dark:border-slate-800">
            <Line
              label={result.installments > 1 ? `1ª parcela (de ${result.installments})` : 'Valor no mês'}
              value={result.firstPayment}
            />
            <Line label="Saldo previsto no fim do mês" value={result.projectedEndBalance} />
            <Line label="Depois da compra" value={result.balanceAfter} signed />
            <Line label="Sobra média por mês" value={result.averageMonthlySurplus} signed />
          </dl>
        </div>
      )}
      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        Quanto mais lançamentos, recorrências e contas você registrar, mais precisa fica a resposta.
      </p>
    </SimCard>
  );
}
