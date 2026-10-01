import { CalendarDays, PiggyBank, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { generateInsights } from '@/agent';
import {
  budgetOverview,
  cashflowForecast,
  categoryBreakdown,
  financialHealth,
  goalsOverview,
  monthlySeries,
  monthSummary,
  totalBalance,
  upcomingItems,
} from '@/analytics';
import { Button, Money, MonthPicker, PageHeader, Spinner, StatCard } from '@/components/ui';
import { useChatMessages, useFinanceData, useToday } from '@/db/hooks';
import { formatMonthLong, monthKey } from '@/domain/dates';
import { formatPercent } from '@/domain/money';
import { capitalize, plural } from '@/domain/text';
import type { MonthKey } from '@/domain/types';
import { BudgetsCard } from './cards/BudgetsCard';
import { CategoriesCard } from './cards/CategoriesCard';
import { FirstStepsCard } from './cards/FirstStepsCard';
import { ForecastCard } from './cards/ForecastCard';
import { GoalsCard } from './cards/GoalsCard';
import { HealthCard } from './cards/HealthCard';
import { IncomeExpenseCard } from './cards/IncomeExpenseCard';
import { InsightsCard } from './cards/InsightsCard';
import { MeetAgentCard } from './cards/MeetAgentCard';
import { RecentCard } from './cards/RecentCard';
import { UPCOMING_DAYS, UpcomingCard } from './cards/UpcomingCard';
import { firstSteps, greetingLine, recentTransactions } from './dashboard-utils';

/** Meses no gráfico de receitas x despesas. */
const FLOW_MONTHS = 6;
const RECENT_COUNT = 5;

export default function DashboardPage() {
  const data = useFinanceData();
  const chat = useChatMessages();
  const today = useToday();
  const currentMonth = monthKey(today);
  const [month, setMonth] = useState<MonthKey>(currentMonth);
  const [hour] = useState(() => new Date().getHours());

  /** Indicadores que dependem do mês escolhido no seletor. */
  const monthly = useMemo(() => {
    if (!data) return null;
    return {
      summary: monthSummary(data.transactions, month),
      categories: categoryBreakdown(data.transactions, data.categories, month, 'despesa'),
      series: monthlySeries(data.transactions, month, FLOW_MONTHS),
      budgets: budgetOverview(data.budgets, data.transactions, data.categories, month, today),
    };
  }, [data, month, today]);

  /** Indicadores sempre "de hoje" (saldo, previsão do mês corrente, agente, compromissos, metas). */
  const current = useMemo(() => {
    if (!data) return null;
    return {
      // Como o "Total em contas": contas fora do patrimônio (ex.: conta da empresa) não são dinheiro do usuário.
      balance: totalBalance(
        data.accounts.filter((a) => a.includeInNetWorth),
        data.transactions,
        { asOf: today },
      ),
      insights: generateInsights(data, today),
      health: financialHealth(data, today),
      forecast: cashflowForecast(data, today),
      upcoming: upcomingItems(data, today, UPCOMING_DAYS),
      goals: goalsOverview(data.goals, data.goalContributions, today),
      recent: recentTransactions(data.transactions, today, RECENT_COUNT),
    };
  }, [data, today]);

  if (!data || !monthly || !current) return <Spinner />;

  const greeting = greetingLine(hour, data.settings.userName);
  const agentName = data.settings.agentName?.trim() || 'Pat';
  const activeAccounts = data.accounts.filter((a) => !a.archived).length;
  // O "Saldo atual" soma só as contas do patrimônio; as demais (ex.: conta conjunta que o usuário só administra)
  // ficam de fora e o rótulo diz isso, para bater com "Total em contas" na tela de Contas.
  const outsideNetWorth = data.accounts.filter((a) => !a.archived && !a.includeInNetWorth).length;
  const balanceHint = `${plural(activeAccounts - outsideNetWorth, 'conta', 'contas')} · até hoje${
    outsideNetWorth > 0 ? ` · ${outsideNetWorth} fora do patrimônio não ${outsideNetWorth === 1 ? 'entra' : 'entram'}` : ''
  }`;
  const monthLabel = capitalize(formatMonthLong(month));

  if (data.transactions.length === 0) {
    const hasChatted = (chat ?? []).some((m) => m.role === 'user');
    // As orientações de "dados" (cadastrar contas, primeiro lançamento) já estão no checklist.
    const otherInsights = current.insights.filter((i) => i.area !== 'dados');
    return (
      <div>
        <PageHeader
          title={greeting}
          subtitle="Bem-vindo ao Patrimonius. Vamos organizar suas finanças em poucos passos."
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <FirstStepsCard steps={firstSteps(data, hasChatted)} className="lg:col-span-2" />
          <div className="space-y-4">
            {activeAccounts > 0 && (
              <StatCard
                label="Saldo atual"
                value={<Money value={current.balance} />}
                hint={balanceHint}
                icon={<Wallet size={20} aria-hidden />}
                tone="brand"
              />
            )}
            {otherInsights.length > 0 ? (
              <InsightsCard insights={otherInsights} agentName={agentName} currentMonth={currentMonth} />
            ) : (
              <MeetAgentCard agentName={agentName} />
            )}
          </div>
        </div>
      </div>
    );
  }

  const { summary } = monthly;

  return (
    <div>
      <PageHeader
        title={greeting}
        subtitle={`Resumo de ${formatMonthLong(month)}`}
        actions={
          <>
            {month !== currentMonth && (
              <Button
                variant="ghost"
                size="sm"
                icon={<CalendarDays size={16} aria-hidden />}
                onClick={() => setMonth(currentMonth)}
              >
                Mês atual
              </Button>
            )}
            <MonthPicker value={month} onChange={setMonth} />
          </>
        }
      />

      <section aria-label="Indicadores" className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Saldo atual"
          value={<Money value={current.balance} />}
          hint={balanceHint}
          icon={<Wallet size={20} aria-hidden />}
          tone="brand"
        />
        <StatCard
          label="Receitas do mês"
          value={<Money value={summary.income} />}
          hint={
            summary.pendingIncome > 0 ? (
              <>
                <Money value={summary.pendingIncome} /> a receber
              </>
            ) : summary.income > 0 ? (
              'Tudo recebido'
            ) : (
              'Nenhuma receita no mês'
            )
          }
          icon={<TrendingUp size={20} aria-hidden />}
          tone="positive"
        />
        <StatCard
          label="Despesas do mês"
          value={<Money value={summary.expense} />}
          hint={
            summary.pendingExpense > 0 ? (
              <>
                <Money value={summary.pendingExpense} /> a pagar
              </>
            ) : summary.expense > 0 ? (
              'Tudo pago'
            ) : (
              'Nenhuma despesa no mês'
            )
          }
          icon={<TrendingDown size={20} aria-hidden />}
          tone="negative"
        />
        <StatCard
          label="Sobra do mês"
          value={<Money value={summary.net} colored={summary.net < 0} />}
          hint={
            summary.savingsRate !== null
              ? `Taxa de poupança: ${formatPercent(summary.savingsRate)}`
              : 'Sem receitas para calcular a taxa'
          }
          icon={<PiggyBank size={20} aria-hidden />}
          tone={summary.net >= 0 ? 'positive' : 'warning'}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <InsightsCard
          insights={current.insights}
          agentName={agentName}
          currentMonth={currentMonth}
          className="lg:col-span-2"
        />
        <HealthCard report={current.health} />

        <ForecastCard forecast={current.forecast} hasAccounts={activeAccounts > 0} className="lg:col-span-2" />
        <CategoriesCard rows={monthly.categories} monthLabel={monthLabel} />

        <IncomeExpenseCard series={monthly.series} className="lg:col-span-2" />
        <BudgetsCard overview={monthly.budgets} monthLabel={monthLabel} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <UpcomingCard items={current.upcoming} today={today} />
        <GoalsCard items={current.goals.items} />
        <RecentCard
          transactions={current.recent}
          categories={data.categories}
          accounts={data.accounts}
          today={today}
          className="md:col-span-2 lg:col-span-1"
        />
      </div>
    </div>
  );
}
