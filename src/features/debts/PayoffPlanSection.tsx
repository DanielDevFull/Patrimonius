import { AlertTriangle, Lightbulb, Route, Trophy } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { compareStrategies, type PayoffDebtInput, type PayoffPlan, type PayoffStrategy } from '@/analytics';
import { Badge, Button, Card, CardHeader, Field, Money, MoneyInput, cn } from '@/components/ui';
import type { Cents, ISODate } from '@/domain/types';
import { formatDuration, monthLongFrom, monthShortFrom } from '@/domain/format';
import {
  STRATEGY_META,
  defaultPayoffBudget,
  payoffAdvice,
  payoffChartRows,
  type PayoffAdvice,
} from './debt-utils';
import { PayoffChart } from './PayoffChart';

export interface PayoffPlanSectionProps {
  /** Dívidas ativas com saldo (toPayoffInputs). */
  inputs: PayoffDebtInput[];
  totalMinimum: Cents;
  monthlyInterest: Cents;
  today: ISODate;
  hideValues: boolean;
}

function StrategyCard({
  plan,
  recommended,
  today,
}: {
  plan: PayoffPlan;
  recommended: boolean;
  today: ISODate;
}) {
  const meta = STRATEGY_META[plan.strategy];
  return (
    <section
      aria-label={`Estratégia ${meta.name}`}
      className={cn(
        'flex flex-col gap-3 rounded-2xl border p-4',
        recommended && plan.feasible
          ? 'border-brand-500 bg-brand-50/60 dark:border-brand-700 dark:bg-brand-950/40'
          : 'border-slate-200 dark:border-slate-800',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">{meta.name}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{meta.tagline}</p>
        </div>
        {recommended && plan.feasible && (
          <Badge tone="brand">
            <Trophy size={12} aria-hidden /> Recomendada
          </Badge>
        )}
        {!plan.feasible && (
          <Badge tone="negative">
            <AlertTriangle size={12} aria-hidden /> Inviável
          </Badge>
        )}
      </div>

      {plan.feasible ? (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Tempo até quitar</dt>
            <dd className="font-semibold">{formatDuration(plan.months)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Previsão</dt>
            <dd className="font-semibold">{monthLongFrom(today, plan.months)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Juros totais</dt>
            <dd className="font-semibold">
              <Money value={plan.totalInterest} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Total pago</dt>
            <dd className="font-semibold">
              <Money value={plan.totalPaid} />
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Com este orçamento, as dívidas não são quitadas em até 50 anos.
        </p>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400">{meta.description}</p>

      {plan.payoffOrder.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Ordem de quitação
          </h4>
          <ol className="space-y-1 text-sm">
            {plan.payoffOrder.map((p, i) => (
              <li key={p.debtId} className="flex gap-1.5">
                <span className="text-slate-400">{i + 1}.</span>
                <span className="min-w-0">
                  <span className="block break-words">{p.name}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    quitada em {monthShortFrom(today, p.month)} · {formatDuration(p.month)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function AdviceBox({
  advice,
  budget,
  totalMinimum,
  monthlyInterest,
}: {
  advice: PayoffAdvice;
  budget: Cents;
  totalMinimum: Cents;
  monthlyInterest: Cents;
}) {
  const warning = advice.kind === 'inviavel_minimos' || advice.kind === 'inviavel_juros';
  let body: ReactNode;
  switch (advice.kind) {
    case 'inviavel_minimos':
      body = (
        <>
          Com <Money value={budget} /> por mês não dá para pagar nem as parcelas mínimas, que somam{' '}
          <Money value={totalMinimum} />. Faltam <Money value={advice.shortfall} /> por mês: aumente o valor
          destinado às dívidas ou procure o credor para renegociar.
        </>
      );
      break;
    case 'inviavel_juros':
      body = (
        <>
          Com esse valor, os juros crescem quase tão rápido quanto você paga e as dívidas não terminam em até
          50 anos. Hoje os juros já somam cerca de <Money value={monthlyInterest} /> por mês. Aumente o valor
          mensal ou busque uma renegociação/portabilidade com juros menores.
        </>
      );
      break;
    case 'unica':
      body = (
        <>
          Só a estratégia <strong>{STRATEGY_META[advice.strategy].name}</strong> consegue quitar tudo com esse
          orçamento. Siga a ordem de quitação dela.
        </>
      );
      break;
    case 'empate':
      body = advice.singleDebt ? (
        <>
          Com uma única dívida, as duas estratégias são iguais: pague todo mês o máximo que couber no
          orçamento.
        </>
      ) : (
        <>
          As duas estratégias custam o mesmo em juros. Recomendo a <strong>Bola de neve</strong>: quitar
          primeiro a menor dívida traz vitórias rápidas e ajuda a manter a motivação.
        </>
      );
      break;
    case 'economia':
      body =
        advice.strategy === 'avalanche' ? (
          <>
            Recomendo a <strong>Avalanche</strong>: atacando primeiro a dívida de juros mais altos, você
            economiza <Money value={advice.savings} className="font-semibold" /> em juros
            {advice.monthsSaved > 0 ? ` e termina ${formatDuration(advice.monthsSaved)} antes` : ''}. Cada
            real que você deixa de pagar em juros vai direto para quitar as dívidas.
            {advice.quickWin && (
              <>
                {' '}
                Se você precisa de vitórias rápidas para manter o ânimo, a Bola de neve elimina “
                {advice.quickWin.name}” em {formatDuration(advice.quickWin.month)} — mas custa mais caro no
                total.
              </>
            )}
          </>
        ) : (
          <>
            Recomendo a <strong>Bola de neve</strong>: neste caso, quitar primeiro as menores dívidas também
            economiza <Money value={advice.savings} className="font-semibold" /> em juros
            {advice.monthsSaved > 0 ? ` e termina ${formatDuration(advice.monthsSaved)} antes` : ''}.
          </>
        );
      break;
  }
  return (
    <div
      role={warning ? 'alert' : undefined}
      className={cn(
        'flex items-start gap-3 rounded-xl p-3 text-sm',
        warning
          ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
          : 'bg-brand-50 text-brand-900 dark:bg-brand-950/50 dark:text-brand-100',
      )}
    >
      {warning ? (
        <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" />
      ) : (
        <Lightbulb size={18} aria-hidden className="mt-0.5 shrink-0" />
      )}
      <p>{body}</p>
    </div>
  );
}

/** Plano de quitação: orçamento mensal, Avalanche x Bola de neve, recomendação e gráfico. */
export function PayoffPlanSection({
  inputs,
  totalMinimum,
  monthlyInterest,
  today,
  hideValues,
}: PayoffPlanSectionProps) {
  const budgetId = useId();
  const suggested = defaultPayoffBudget(totalMinimum);
  /** undefined = usar a sugestão (acompanha mudanças nas dívidas). */
  const [custom, setCustom] = useState<Cents | null | undefined>(undefined);
  const budget = custom === undefined ? suggested : custom;

  const comparison = useMemo(
    () => (budget !== null && budget > 0 && inputs.length > 0 ? compareStrategies(inputs, budget) : null),
    [inputs, budget],
  );
  const rows = useMemo(() => (comparison ? payoffChartRows(comparison, today) : []), [comparison, today]);
  const advice =
    comparison && budget !== null ? payoffAdvice(comparison, budget, totalMinimum, inputs.length) : null;
  const extra = budget !== null ? budget - totalMinimum : 0;

  return (
    <Card role="region" aria-labelledby={`${budgetId}-title`}>
      <CardHeader
        icon={<Route size={20} aria-hidden />}
        title={<span id={`${budgetId}-title`}>Plano de quitação</span>}
        subtitle="Quanto você consegue destinar às dívidas por mês? Eu simulo as duas estratégias mais usadas."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field
          label="Orçamento mensal para dívidas"
          htmlFor={budgetId}
          className="sm:w-72"
          hint={
            totalMinimum > 0 ? (
              <>
                Mínimos somam <Money value={totalMinimum} />
                {extra > 0 && (
                  <>
                    {' '}
                    · extra de <Money value={extra} /> acelera a quitação
                  </>
                )}
              </>
            ) : (
              'Suas dívidas não têm parcela mínima informada.'
            )
          }
        >
          <MoneyInput id={budgetId} value={budget} onChange={setCustom} />
        </Field>
        {custom !== undefined && suggested !== null && custom !== suggested && (
          <Button variant="ghost" size="sm" className="sm:mb-6" onClick={() => setCustom(undefined)}>
            Usar sugestão (mínimos + 10%)
          </Button>
        )}
      </div>

      {!comparison || !advice || budget === null ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          Informe quanto você pode pagar por mês para ver o plano de quitação.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <AdviceBox
            advice={advice}
            budget={budget}
            totalMinimum={totalMinimum}
            monthlyInterest={monthlyInterest}
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {(['avalanche', 'snowball'] as PayoffStrategy[]).map((s) => (
              <StrategyCard
                key={s}
                plan={comparison[s]}
                recommended={comparison.recommended === s && !(advice.kind === 'empate' && advice.singleDebt)}
                today={today}
              />
            ))}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Saldo total ao longo do tempo
            </h3>
            <PayoffChart rows={rows} hideValues={hideValues} />
          </div>
        </div>
      )}
    </Card>
  );
}
