import { Landmark, ShieldCheck, TrendingUp } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { debtCurrentBalance } from '@/analytics';
import { Field, Input, Money, MoneyInput, Select, StatCard, cn } from '@/components/ui';
import type { Cents, Debt, DebtPayment } from '@/domain/types';
import { formatRate, parsePercent, rateToInput } from './shared/format';
import { payOrInvest } from './simulator-utils';
import { SimCard, SimEmpty } from './SimLayout';

/** "Quitar ou investir?": compara a taxa da dívida com o rendimento líquido de um investimento. */
export function PayOrInvestSim({ debts, payments }: { debts: Debt[]; payments: DebtPayment[] }) {
  const ids = { debt: useId(), debtRate: useId(), invest: useId(), tax: useId(), amount: useId() };
  const active = useMemo(
    () => debts.filter((d) => d.status === 'ativa' && debtCurrentBalance(d, payments) > 0),
    [debts, payments],
  );
  const [debtId, setDebtId] = useState('');
  const [debtRate, setDebtRate] = useState('');
  const [investRate, setInvestRate] = useState('10');
  const [tax, setTax] = useState('15');
  const [amount, setAmount] = useState<Cents | null>(100000);

  const debtPct = parsePercent(debtRate);
  const investPct = parsePercent(investRate);
  const taxPct = parsePercent(tax);
  const errors = {
    debtRate: debtRate.trim() && debtPct === null ? 'Taxa inválida. Ex.: 2,5' : undefined,
    investRate: investRate.trim() && investPct === null ? 'Taxa inválida. Ex.: 10' : undefined,
    tax: tax.trim() && (taxPct === null || taxPct > 100) ? 'Use de 0 a 100.' : undefined,
  };
  const result =
    debtPct !== null && investPct !== null && taxPct !== null && taxPct <= 100
      ? payOrInvest(debtPct, investPct, taxPct, amount ?? 0)
      : null;

  function pickDebt(id: string) {
    setDebtId(id);
    const debt = active.find((d) => d.id === id);
    if (debt) setDebtRate(rateToInput(debt.interestRate));
  }

  return (
    <SimCard
      title="Quitar ou investir?"
      subtitle="Tem um dinheiro sobrando? Compare o juro que a dívida cobra com o que o investimento rende de verdade."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {active.length > 0 && (
          <Field label="Usar uma dívida cadastrada" htmlFor={ids.debt} className="sm:col-span-2">
            <Select id={ids.debt} value={debtId} onChange={(e) => pickDebt(e.target.value)}>
              <option value="">Digitar a taxa manualmente</option>
              {active.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} — {formatRate(d.interestRate)} a.m.
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Juros da dívida (% ao mês)" htmlFor={ids.debtRate} error={errors.debtRate}>
          <Input
            id={ids.debtRate}
            inputMode="decimal"
            autoComplete="off"
            placeholder="Ex.: 2,5"
            value={debtRate}
            onChange={(e) => {
              setDebtRate(e.target.value);
              setDebtId('');
            }}
          />
        </Field>
        <Field label="Valor disponível" htmlFor={ids.amount}>
          <MoneyInput id={ids.amount} value={amount} onChange={setAmount} />
        </Field>
        <Field label="Rendimento do investimento (% ao ano)" htmlFor={ids.invest} error={errors.investRate}>
          <Input
            id={ids.invest}
            inputMode="decimal"
            autoComplete="off"
            value={investRate}
            onChange={(e) => setInvestRate(e.target.value)}
          />
        </Field>
        <Field
          label="Imposto sobre o rendimento (%)"
          htmlFor={ids.tax}
          error={errors.tax}
          hint="CDB e Tesouro: 15% a 22,5%. Poupança, LCI e LCA: 0%."
        >
          <Input
            id={ids.tax}
            inputMode="decimal"
            autoComplete="off"
            value={tax}
            onChange={(e) => setTax(e.target.value)}
          />
        </Field>
      </div>

      {!result ? (
        <SimEmpty>Informe os juros da dívida e o rendimento do investimento para comparar.</SimEmpty>
      ) : (
        <div className="mt-5 space-y-4" aria-live="polite">
          <section aria-label="Comparação" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatCard
              label="Quitar a dívida"
              tone={result.winner === 'quitar' ? 'positive' : 'neutral'}
              icon={<Landmark size={20} aria-hidden />}
              value={`${formatRate(result.debtAnnual)} a.a.`}
              hint={
                <>
                  Evita <Money value={result.savedIn12} /> de juros em 12 meses
                </>
              }
            />
            <StatCard
              label="Investir"
              tone={result.winner === 'investir' ? 'positive' : 'neutral'}
              icon={<TrendingUp size={20} aria-hidden />}
              value={`${formatRate(result.investNetAnnual)} a.a. líquido`}
              hint={
                <>
                  Rende <Money value={result.earnedIn12} /> em 12 meses
                </>
              }
            />
          </section>

          <div
            className={cn(
              'flex items-start gap-3 rounded-xl p-4 text-sm',
              result.winner === 'investir'
                ? 'bg-sky-50 text-sky-900 dark:bg-sky-950/50 dark:text-sky-100'
                : 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100',
            )}
          >
            <ShieldCheck size={18} aria-hidden className="mt-0.5 shrink-0" />
            <div className="space-y-2">
              {result.winner === 'quitar' && (
                <p>
                  <strong>Quitar a dívida é o melhor “investimento”.</strong> Cada real usado para abater a
                  dívida deixa de pagar {formatRate(result.debtMonthly)} ao mês (
                  {formatRate(result.debtAnnual)} ao ano). É um retorno <strong>garantido</strong>, sem risco
                  e sem imposto — bem acima dos {formatRate(result.investNetAnnual)} ao ano líquidos do
                  investimento.
                </p>
              )}
              {result.winner === 'investir' && (
                <p>
                  <strong>Investir rende mais</strong> do que os juros dessa dívida (
                  {formatRate(result.investNetAnnual)} líquidos contra {formatRate(result.debtAnnual)} ao
                  ano). Mantenha as parcelas em dia e invista a sobra — mas lembre que o rendimento pode
                  variar, enquanto o juro da dívida é certo.
                </p>
              )}
              {result.winner === 'empate' && (
                <p>
                  <strong>Praticamente empate.</strong> A dívida custa o mesmo que o investimento rende. Na
                  dúvida, quitar é mais seguro: o retorno é garantido e você ganha folga no orçamento todo
                  mês.
                </p>
              )}
              <p className="text-xs opacity-80">
                Regra de bolso: dívida com juros maiores que o rendimento líquido do investimento deve ser
                quitada primeiro. Antes de usar todo o dinheiro, garanta uma reserva de emergência mínima.
              </p>
            </div>
          </div>
        </div>
      )}
    </SimCard>
  );
}
