/** Dívidas: situação atual e plano de quitação (avalanche x bola de neve). */
import {
  averageMonthlyIncome,
  compareStrategies,
  debtsOverview,
  monthlyToAnnualRate,
  toPayoffInputs,
  type PayoffPlan,
} from '@/analytics';
import { ROUTES } from '@/app/navigation';
import { addMonthsToKey, formatMonthLong } from '@/domain/dates';
import { formatBRL, formatDecimal, formatPercent } from '@/domain/money';
import { plural } from '@/domain/text';
import { bullets, formatNumber, joinList, money, paragraphs, sentences } from '../format';
import type { AgentCard } from '../types';
import { sum, type Handler, type HandlerOutput } from './context';

const STRATEGY_LABEL = {
  avalanche: 'avalanche (maior juros primeiro)',
  snowball: 'bola de neve (menor saldo primeiro)',
} as const;

function noDebtsReply(hasHistory: boolean): HandlerOutput {
  return {
    text: hasHistory
      ? 'Você não tem dívidas ativas — todas as registradas estão quitadas. 👏 Continue usando o cartão só para o que cabe no orçamento do mês.'
      : 'Você não tem dívidas registradas. 👏 Se tiver algum empréstimo, financiamento ou parcelamento, cadastre em Dívidas para eu ajudar a planejar a quitação.',
    actions: [{ type: 'navigate', label: 'Ver dívidas', to: ROUTES.debts }],
    suggestions: ['Reserva de emergência', 'Como estão minhas metas?', 'Minha saúde financeira'],
  };
}

/** '18 meses (1,5 ano)' */
function monthsLabel(months: number): string {
  const base = plural(months, 'mês', 'meses');
  if (months < 12) return base;
  const years = months / 12;
  return `${base} (${formatNumber(years)} ${years < 2 ? 'ano' : 'anos'})`;
}

/** Múltiplo de R$ 50 acima de `cents`. */
function roundUp50(cents: number): number {
  return Math.ceil(cents / 5000) * 5000;
}

/** status_dividas */
export const debtsStatusReply: Handler = (ctx) => {
  const { data } = ctx;
  const overview = debtsOverview(data.debts, data.debtPayments);
  const active = overview.items.filter((i) => i.debt.status === 'ativa' && i.currentBalance > 0);
  if (active.length === 0) return noDebtsReply(data.debts.length > 0);
  const worst = active[0];
  const recorded = averageMonthlyIncome(data.transactions, ctx.month, 3);
  const income = recorded > 0 ? recorded : (data.settings.monthlyIncomeEstimate ?? 0);
  const ratio = income > 0 ? overview.totalMinimum / income : null;
  const text = sentences([
    `Você deve ${money(overview.totalBalance)} em ${plural(active.length, 'dívida', 'dívidas')}.`,
    `Os juros estimados somam ${money(overview.monthlyInterest)} por mês, e as parcelas mínimas, ${formatBRL(overview.totalMinimum)}.`,
    worst.debt.interestRate > 0
      ? `A mais cara é ${worst.debt.name}, com ${formatNumber(worst.debt.interestRate)}% ao mês (cerca de ${formatNumber(monthlyToAnnualRate(worst.debt.interestRate))}% ao ano). Priorize quitá-la: cada real pago nela economiza juros altos.`
      : null,
    ratio !== null
      ? `As parcelas comprometem ${formatPercent(ratio)} da sua renda${ratio > 0.3 ? ' — acima dos 30% recomendados. Evite novas dívidas por enquanto.' : '.'}`
      : null,
  ]);
  const cards: AgentCard[] = [
    { type: 'stat', title: 'Total em dívidas', value: formatBRL(overview.totalBalance), tone: 'negative' },
    {
      type: 'list',
      title: 'Suas dívidas',
      items: active.map((i) => ({
        label: i.debt.name,
        value: formatBRL(i.currentBalance),
        hint: `${formatNumber(i.debt.interestRate)}% a.m. · mínimo ${formatBRL(i.debt.minimumPayment)}`,
        tone: i.debt.interestRate >= 4 ? 'negative' : 'neutral',
      })),
    },
  ];
  return {
    text,
    cards,
    actions: [{ type: 'navigate', label: 'Ver dívidas', to: ROUTES.debts }],
    suggestions: [
      'Como quitar minhas dívidas?',
      `Tenho ${formatDecimal(roundUp50(overview.totalMinimum * 1.3))} por mês para quitar as dívidas`,
      'Vou fechar o mês no azul?',
    ],
  };
};

function timelineChart(plan: PayoffPlan): AgentCard {
  const points = plan.timeline;
  const step = Math.max(1, Math.ceil(points.length / 12));
  const sampled = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  return {
    type: 'chart',
    title: 'Saldo devedor mês a mês',
    chart: 'bar',
    data: sampled.map((p) => ({ label: p.month === 0 ? 'Hoje' : `Mês ${p.month}`, value: p.totalBalance })),
  };
}

/** plano_dividas */
export const debtPlanReply: Handler = (ctx) => {
  const { data, entities: e } = ctx;
  const inputs = toPayoffInputs(data.debts, data.debtPayments);
  if (inputs.length === 0) return noDebtsReply(data.debts.length > 0);
  const minimums = sum(inputs.map((d) => d.minimumPayment));
  const userBudget = e.amount !== undefined && e.amount > 0;
  const budget = userBudget ? (e.amount as number) : Math.round(minimums * 1.1);
  const higher = roundUp50(Math.max(budget * 1.3, minimums * 1.3));
  const suggestions = [
    `Tenho ${formatDecimal(higher)} por mês para quitar as dívidas`,
    'Minhas dívidas',
    'Dicas para economizar',
  ];
  if (budget < minimums) {
    return {
      text: `Com ${money(budget)} por mês não dá para cobrir nem os pagamentos mínimos (${formatBRL(minimums)}). Nesse cenário a dívida cresce. Tente aumentar o valor mensal ou renegociar as taxas e prazos com os credores.`,
      suggestions,
    };
  }
  const cmp = compareStrategies(inputs, budget);
  const rec = cmp[cmp.recommended];
  const other = cmp.recommended === 'avalanche' ? cmp.snowball : cmp.avalanche;
  if (!rec.feasible) {
    return {
      text: `Com ${money(budget)} por mês, os juros consomem quase todo o pagamento e as dívidas não acabam em um prazo razoável. Aumente o valor mensal ou renegocie as taxas — juros menores fazem toda a diferença.`,
      suggestions,
    };
  }
  const intro = userBudget
    ? `Com ${money(budget)} por mês para as dívidas:`
    : `Com ${money(budget)} por mês para as dívidas (os mínimos + 10%):`;
  const lines = [
    `Avalanche (maior juros primeiro): quita tudo em ${monthsLabel(cmp.avalanche.months)} e paga ${formatBRL(cmp.avalanche.totalInterest)} de juros.`,
    `Bola de neve (menor saldo primeiro): quita em ${monthsLabel(cmp.snowball.months)} e paga ${formatBRL(cmp.snowball.totalInterest)} de juros.`,
  ];
  const savings = Math.abs(other.totalInterest - rec.totalInterest);
  const recommendation =
    cmp.recommended === 'avalanche'
      ? other.feasible
        ? `Recomendo o método ${STRATEGY_LABEL.avalanche}: economiza ${money(savings)} em juros.`
        : `Recomendo o método ${STRATEGY_LABEL.avalanche}: é a opção viável com esse valor.`
      : !other.feasible
        ? `Recomendo a ${STRATEGY_LABEL.snowball}: é a opção viável com esse valor.`
        : savings === 0
          ? `Recomendo a ${STRATEGY_LABEL.snowball}: o custo de juros é o mesmo e você ganha motivação quitando as menores logo.`
          : `Recomendo a ${STRATEGY_LABEL.snowball}: além de motivadora, sai ${money(savings)} mais barata em juros.`;
  const order = `Ordem de quitação: ${joinList(rec.payoffOrder.map((p) => `${p.name} (mês ${p.month})`))}.`;
  const howTo =
    'Como fazer: pague o mínimo de todas e coloque todo o dinheiro extra na primeira da lista. Quando ela acabar, some a parcela dela ao ataque da próxima.';
  const freeAt = formatMonthLong(addMonthsToKey(ctx.month, rec.months));
  return {
    text: paragraphs([`${intro}\n${bullets(lines)}`, sentences([recommendation, order]), howTo]),
    cards: [
      { type: 'stat', title: 'Livre das dívidas em', value: monthsLabel(rec.months), hint: freeAt, tone: 'positive' },
      {
        type: 'list',
        title: 'Ordem de quitação',
        items: rec.payoffOrder.map((p, i) => ({ label: `${i + 1}. ${p.name}`, value: `mês ${p.month}` })),
      },
      timelineChart(rec),
    ],
    actions: [{ type: 'navigate', label: 'Ver dívidas', to: ROUTES.debts }],
    suggestions,
  };
};
