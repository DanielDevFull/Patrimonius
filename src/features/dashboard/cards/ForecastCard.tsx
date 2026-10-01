import { ChartArea, TriangleAlert, Wallet } from 'lucide-react';
import type { CashflowForecast } from '@/analytics';
import { ROUTES } from '@/app/navigation';
import { Card, CardHeader, cn, EmptyState, Money } from '@/components/ui';
import { formatDateBR } from '@/domain/dates';
import { ForecastChart } from '../charts/ForecastChart';
import { whenPhrase } from '../dashboard-utils';
import { LinkButton } from './shared';

export interface ForecastCardProps {
  forecast: CashflowForecast;
  hasAccounts: boolean;
  className?: string;
}

function Line({ label, value, sign }: { label: string; value: number; sign?: '+' | '-' }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-800 dark:text-slate-100">
        {sign && <span aria-hidden>{sign} </span>}
        <Money value={value} />
      </dd>
    </div>
  );
}

/** Previsão do mês corrente: saldo diário projetado, saldo no fim do mês e alerta de saldo negativo. */
export function ForecastCard({ forecast, hasAccounts, className }: ForecastCardProps) {
  const { lowestPoint } = forecast;
  return (
    <Card className={className}>
      <section id="previsao" aria-labelledby="dashboard-forecast-title" className="scroll-mt-20">
        <CardHeader
          icon={<ChartArea size={18} aria-hidden />}
          title={<span id="dashboard-forecast-title">Previsão do mês</span>}
          subtitle={`Saldo em caixa projetado até ${formatDateBR(forecast.until)}`}
        />
        {!hasAccounts ? (
          <EmptyState
            icon={<Wallet size={36} aria-hidden />}
            title="Cadastre suas contas para ver a previsão"
            description="Com o saldo das contas e os lançamentos previstos, mostramos como seu dinheiro deve terminar o mês."
            action={<LinkButton to={ROUTES.accounts}>Cadastrar contas</LinkButton>}
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Saldo previsto no fim do mês
                </p>
                <p
                  className={cn(
                    'mt-1 text-3xl font-bold',
                    forecast.projectedEndBalance < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-slate-900 dark:text-white',
                  )}
                >
                  <Money value={forecast.projectedEndBalance} />
                </p>
              </div>
              <dl className="text-sm">
                <Line label="Saldo em caixa hoje" value={forecast.currentBalance} />
                <Line label="Receitas previstas" value={forecast.expectedIncome} sign="+" />
                <Line label="Despesas previstas" value={forecast.expectedExpense} sign="-" />
                <Line label="Gastos do dia a dia (estimativa)" value={forecast.projectedVariableSpending} sign="-" />
              </dl>
            </div>
            {forecast.willGoNegative && (
              <div
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/60 dark:text-rose-200"
              >
                <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
                <p>
                  <strong>Atenção:</strong> seu saldo pode ficar negativo {whenPhrase(lowestPoint.date, forecast.today)},
                  chegando a <Money value={lowestPoint.balance} />. Reveja as despesas previstas ou reforce o saldo da
                  conta antes disso.
                </p>
              </div>
            )}
            <figure className="mt-4" aria-label="Gráfico do saldo diário projetado até o fim do mês">
              <ForecastChart points={forecast.points} />
            </figure>
          </>
        )}
      </section>
    </Card>
  );
}
