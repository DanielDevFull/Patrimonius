/** Patrimônio, reserva de emergência e saúde financeira. */
import {
  emergencyFund,
  financialHealth,
  netWorth,
  netWorthHistory,
  type HealthComponent,
  type HealthGrade,
} from '@/analytics';
import { ROUTES } from '@/app/navigation';
import { addMonths, formatMonthLong, formatMonthShort } from '@/domain/dates';
import { formatBRL, formatSignedBRL } from '@/domain/money';
import { normalizeText } from '@/domain/text';
import { bold, formatMonthsCount, money, paragraphs, sentences, toneOfAmount } from '../format';
import type { AgentAction, AgentCard, CardTone } from '../types';
import { nextGoalColor } from './goals';
import type { Handler } from './context';

/** patrimonio */
export const netWorthReply: Handler = (ctx) => {
  const { data, today, month } = ctx;
  const nw = netWorth(data, today);
  if (nw.totalAssets === 0 && nw.totalLiabilities === 0) {
    return {
      text: 'Ainda não tenho dados para calcular seu patrimônio. Cadastre suas contas com os saldos, seus bens (imóvel, carro, investimentos) e suas dívidas — aí eu mostro quanto você tem de verdade.',
      actions: [{ type: 'navigate', label: 'Ver patrimônio', to: ROUTES.netWorth }],
      suggestions: ['O que você sabe fazer?'],
    };
  }
  const history = netWorthHistory(data, month, 6, today);
  const previous = history[history.length - 2];
  const first = history[0];
  const diffMonth = nw.netWorth - previous.netWorth;
  const diff6 = nw.netWorth - first.netWorth;
  const text = paragraphs([
    sentences([
      `Seu patrimônio líquido é ${money(nw.netWorth)}: ${formatBRL(nw.totalAssets)} em contas e bens, menos ${formatBRL(nw.totalLiabilities)} em dívidas e faturas.`,
      diffMonth !== 0
        ? `Desde o fim de ${formatMonthLong(previous.month)}, ${diffMonth > 0 ? 'cresceu' : 'caiu'} ${formatBRL(Math.abs(diffMonth))}.`
        : null,
      diff6 !== 0 && diff6 !== diffMonth ? `Em 6 meses, a variação foi de ${formatSignedBRL(diff6)}.` : null,
    ]),
    'Patrimônio líquido = tudo o que você tem − tudo o que deve. Acompanhar a evolução mês a mês é o melhor termômetro do seu progresso.',
  ]);
  const composition = [
    { label: 'Contas', value: formatBRL(nw.accountsPositive) },
    ...nw.byAssetType.map((t) => ({ label: t.label, value: formatBRL(t.total) })),
    ...(nw.accountsNegative > 0 ? [{ label: 'Faturas e saldos negativos', value: formatBRL(-nw.accountsNegative), tone: 'negative' as CardTone }] : []),
    ...(nw.debtsTotal > 0 ? [{ label: 'Dívidas', value: formatBRL(-nw.debtsTotal), tone: 'negative' as CardTone }] : []),
  ];
  const cards: AgentCard[] = [
    { type: 'stat', title: 'Patrimônio líquido', value: formatBRL(nw.netWorth), tone: toneOfAmount(nw.netWorth) },
    { type: 'list', title: 'Composição', items: composition },
    {
      type: 'chart',
      title: 'Evolução do patrimônio',
      chart: 'bar',
      data: history.map((p) => ({ label: formatMonthShort(p.month), value: p.netWorth })),
    },
  ];
  return {
    text,
    cards,
    actions: [{ type: 'navigate', label: 'Ver patrimônio', to: ROUTES.netWorth }],
    suggestions: ['Minhas dívidas', 'Reserva de emergência', 'Minha saúde financeira'],
  };
};

/** reserva_emergencia */
export const emergencyReply: Handler = (ctx) => {
  const { data, today } = ctx;
  const fund = emergencyFund(data, today);
  if (fund.monthsCovered === null) {
    return {
      text: 'Para calcular sua reserva ideal, preciso conhecer seu custo de vida: registre suas despesas essenciais (moradia, contas, mercado) ou informe sua renda mensal em Configurações.',
      actions: [{ type: 'navigate', label: 'Abrir configurações', to: ROUTES.settings }],
      suggestions: ['O que você sabe fazer?'],
    };
  }
  const covered = formatMonthsCount(fund.monthsCovered);
  const parts: string[] = [
    `Sua reserva de emergência é ${money(fund.reserve)} e cobre ${bold(covered)} do seu custo essencial (${formatBRL(fund.monthlyEssential)} por mês).`,
  ];
  if (fund.level === 'completa') {
    parts.push(
      `✅ Está completa: a meta é ${formatMonthsCount(fund.targetMonths)} (${formatBRL(fund.target)}). Novos aportes podem ir para as suas outras metas.`,
    );
  } else {
    parts.push(
      `A meta é ${formatMonthsCount(fund.targetMonths)} (${formatBRL(fund.target)}): faltam ${money(fund.gap)}. Guardando ${formatBRL(Math.ceil(fund.gap / 12))} por mês, você completa em 1 ano.`,
    );
    if (fund.level === 'critica')
      parts.push('⚠️ Hoje ela é crítica: um imprevisto pode virar dívida. Comece pelo objetivo de 1 mês de custos.');
  }
  const text = paragraphs([
    sentences(parts),
    'A reserva serve para imprevistos (saúde, perda de renda, consertos). O ideal é mantê-la em uma aplicação de liquidez diária e baixo risco — é uma orientação geral, não uma recomendação de investimento.',
  ]);
  const hasReserveGoal = data.goals.some((g) => /reserva|emergencia/.test(normalizeText(g.name)));
  const actions: AgentAction[] =
    fund.gap > 0 && !hasReserveGoal
      ? [
          {
            type: 'create_goal',
            label: 'Criar meta de reserva',
            draft: {
              name: 'Reserva de emergência',
              targetAmount: fund.target,
              targetDate: addMonths(today, 12),
              icon: '🛟',
              color: nextGoalColor(data),
              priority: 'alta',
              status: 'ativa',
            },
          },
        ]
      : [];
  return {
    text,
    cards: [
      {
        type: 'progress',
        title: 'Reserva de emergência',
        items: [
          {
            label: `Meta: ${formatMonthsCount(fund.targetMonths)}`,
            current: fund.reserve,
            target: fund.target,
            hint: `${covered} cobertos`,
            tone: fund.level === 'completa' ? 'positive' : fund.level === 'parcial' ? 'neutral' : 'warning',
          },
        ],
      },
    ],
    actions,
    suggestions: ['Como economizar?', 'Minha saúde financeira', 'Vou fechar o mês no azul?'],
  };
};

const GRADE_LABEL: Record<HealthGrade, string> = {
  excelente: 'excelente 🌟',
  boa: 'boa 👍',
  regular: 'regular',
  atencao: 'pede atenção ⚠️',
  critica: 'crítica 🚨',
};

const GRADE_TONE: Record<HealthGrade, CardTone> = {
  excelente: 'positive',
  boa: 'positive',
  regular: 'neutral',
  atencao: 'warning',
  critica: 'negative',
};

const COMPONENT_SUGGESTION: Record<HealthComponent['key'], string> = {
  poupanca: 'Dicas para economizar',
  reserva: 'Reserva de emergência',
  dividas: 'Como quitar minhas dívidas?',
  orcamento: 'Como está meu orçamento?',
  metas: 'Como estão minhas metas?',
  fluxo: 'Vou fechar o mês no azul?',
};

function scoreTone(score: number): CardTone {
  if (score >= 70) return 'positive';
  if (score >= 40) return 'warning';
  return 'negative';
}

/** saude_financeira */
export const healthReply: Handler = (ctx) => {
  const report = financialHealth(ctx.data, ctx.today);
  const byScore = [...report.components].sort((a, b) => a.score - b.score || b.weight - a.weight);
  const weakest = byScore[0];
  const strongest = [...report.components].sort((a, b) => b.score - a.score || b.weight - a.weight)[0];
  const text = paragraphs([
    sentences([
      `Sua nota de saúde financeira é ${bold(`${report.score}/100`)} — ${GRADE_LABEL[report.grade]}.`,
      report.dataQuality === 'insuficiente'
        ? 'Ainda tenho poucos dados, então a nota é só um ponto de partida.'
        : report.dataQuality === 'parcial'
          ? 'Com mais meses registrados, a nota fica mais precisa.'
          : null,
    ]),
    sentences([
      strongest && strongest.score >= 70 ? `Ponto forte: ${strongest.label.toLowerCase()} (${strongest.value}).` : null,
      `Onde melhorar primeiro: ${weakest.label.toLowerCase()} (${weakest.value}). ${weakest.tip}`,
    ]),
  ]);
  return {
    text,
    cards: [
      {
        type: 'stat',
        title: 'Saúde financeira',
        value: `${report.score}/100`,
        hint: GRADE_LABEL[report.grade],
        tone: GRADE_TONE[report.grade],
      },
      {
        type: 'list',
        title: 'Como a nota é formada',
        items: report.components.map((c) => ({
          label: `${c.label} (peso ${c.weight})`,
          value: `${c.score}/100`,
          hint: c.value,
          tone: scoreTone(c.score),
        })),
      },
    ],
    suggestions: [COMPONENT_SUGGESTION[weakest.key], 'Dicas para economizar', 'Resumo do mês'],
  };
};
