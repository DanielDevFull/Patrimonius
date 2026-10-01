/** Saudação, ajuda, agradecimento, dicas personalizadas, relatório e mensagens não entendidas. */
import {
  averageMonthlyExpense,
  cashflowForecast,
  categoryBreakdown,
  liquidBalance,
} from '@/analytics';
import { ROUTES } from '@/app/navigation';
import { MONTH_NAMES, addMonthsToKey, isInMonth, monthKey, parseISO } from '@/domain/dates';
import { formatBRL, formatDecimal } from '@/domain/money';
import type { FinanceData, ISODate } from '@/domain/types';
import {
  SEVERITY_LABEL,
  SEVERITY_TONE,
  bold,
  bullets,
  firstName,
  formatDayLong,
  hello,
  money,
  monthPeriod,
  paragraphs,
  sentences,
  uniqueSuggestions,
  withVocative,
} from '../format';
import { generateInsights } from '../insights';
import { monthlyReport } from '../report';
import type { AgentAction, AgentCard, AgentReply, Insight, InsightArea } from '../types';
import { findCategory, referenceMonth, sum, type Handler } from './context';

const AREA_SUGGESTION: Record<InsightArea, string> = {
  orcamento: 'Como está meu orçamento?',
  gastos: 'Onde estou gastando mais?',
  economia: 'Dicas para economizar',
  dividas: 'Como quitar minhas dívidas?',
  metas: 'Como estão minhas metas?',
  reserva: 'Reserva de emergência',
  fluxo: 'Vou fechar o mês no azul?',
  recorrencia: 'Minhas assinaturas',
  patrimonio: 'Meu patrimônio',
  dados: 'O que você sabe fazer?',
};

function agentName(data: FinanceData): string {
  return data.settings.agentName?.trim() || 'Pat';
}

function insightsCard(title: string, insights: Insight[]): AgentCard {
  return {
    type: 'list',
    title,
    items: insights.map((i) => ({
      label: i.title,
      value: SEVERITY_LABEL[i.severity],
      hint: i.message,
      tone: SEVERITY_TONE[i.severity],
    })),
  };
}

function hasStarted(data: FinanceData): boolean {
  return data.accounts.some((a) => !a.archived) || data.transactions.length > 0;
}

/** Mensagem de abertura: saudação, 1-2 frases de situação, até 3 insights e sugestões. */
export function buildGreeting(data: FinanceData, today: ISODate): AgentReply {
  const name = firstName(data.settings);
  const agent = agentName(data);
  const insights = generateInsights(data, today);
  if (!hasStarted(data)) {
    const cards = insights.length ? [insightsCard('Para começar', insights.slice(0, 3))] : [];
    return {
      intent: 'saudacao',
      text: paragraphs([
        `${hello(name)} Eu sou o ${agent}, seu assistente financeiro pessoal. 👋`,
        'Tudo funciona aqui no seu aparelho, sem conexão com bancos: você me conta e eu organizo, analiso e aviso o que merece atenção.',
        'Para começar, cadastre suas contas (corrente, carteira, cartão). Depois é só me dizer seus gastos, como “gastei 30 no almoço”.',
      ]),
      cards,
      actions: [{ type: 'navigate', label: 'Cadastrar conta', to: ROUTES.accounts }],
      suggestions: ['O que você sabe fazer?', 'Dicas para economizar'],
    };
  }
  const month = monthKey(today);
  const liquid = liquidBalance(data.accounts, data.transactions, { asOf: today });
  const spent = sum(
    data.transactions
      .filter((t) => t.type === 'despesa' && isInMonth(t.date, month) && t.date <= today)
      .map((t) => t.amount),
  );
  let forecastLine: string | null = null;
  if (data.accounts.some((a) => !a.archived && a.type !== 'investimento')) {
    const end = cashflowForecast(data, today).projectedEndBalance;
    forecastLine =
      end >= 0
        ? `A previsão é fechar o mês com ${formatBRL(end)} em caixa.`
        : `⚠️ A previsão é fechar o mês em ${formatBRL(end)} — vamos ajustar?`;
  }
  const top = insights.slice(0, 3);
  const text = paragraphs([
    `${hello(name)} Hoje é ${formatDayLong(today)}.`,
    sentences([
      `Você tem ${money(liquid)} disponíveis nas contas e já gastou ${money(spent)} em ${MONTH_NAMES[parseISO(today).month - 1]}.`,
      forecastLine,
    ]),
    top.length
      ? `Separei ${top.length === 1 ? 'um ponto' : `${top.length} pontos`} para você:`
      : 'Tudo em ordem por aqui. 👌 Quer registrar algo ou ver um resumo?',
  ]);
  const firstAction = top.find((i) => i.action)?.action;
  const actions: AgentAction[] = firstAction ? [{ type: 'navigate', label: firstAction.label, to: firstAction.to }] : [];
  return {
    intent: 'saudacao',
    text,
    cards: top.length ? [insightsCard('Destaques de hoje', top)] : [],
    actions,
    suggestions: uniqueSuggestions([
      ...top.map((i) => AREA_SUGGESTION[i.area]),
      'Resumo do mês',
      'Vou fechar o mês no azul?',
      'Onde estou gastando mais?',
    ]),
  };
}

/** saudacao */
export const greetingReply: Handler = (ctx) => {
  const reply = buildGreeting(ctx.data, ctx.today);
  return { text: reply.text, cards: reply.cards, actions: reply.actions, suggestions: reply.suggestions, memory: 'keep' };
};

/** agradecimento */
export const thanksReply: Handler = (ctx) => {
  const strong = ctx.parsed.confidence >= 0.9;
  const text = strong
    ? `${ctx.name ? `Por nada, ${ctx.name}!` : 'Por nada!'} 😊 Estou por aqui sempre que precisar.`
    : 'Combinado! 👍 Se precisar de algo, é só chamar.';
  return {
    text,
    suggestions: ['Resumo do mês', 'Contas a pagar', 'Dicas para economizar'],
    memory: 'keep',
  };
};

/** ajuda */
export const helpReply: Handler = (ctx) => {
  const agent = agentName(ctx.data);
  const text = paragraphs([
    `Eu sou o ${agent}, seu assistente financeiro. 🤖 Funciono 100% no seu aparelho: seus dados não saem daqui. Veja o que eu sei fazer:`,
    bullets([
      `${bold('Registrar')} gastos e receitas: “gastei 45,90 no ifood ontem”, “recebi 5000 de salário”`,
      `${bold('Transferências')}: “transferi 500 da corrente para a poupança”, “paguei a fatura de 1.200”`,
      `${bold('Consultas')}: “quanto gastei com mercado este mês?”, “qual meu saldo?”, “onde estou gastando mais?”`,
      `${bold('Orçamentos')}: “orçamento de 800 para mercado”, “como está meu orçamento?”`,
      `${bold('Metas')}: “criar meta viagem de 10 mil até dezembro”, “guardei 300 na meta viagem”`,
      `${bold('Dívidas')}: “minhas dívidas”, “como quitar minhas dívidas?”`,
      `${bold('Planejamento')}: “vou fechar o mês no azul?”, “posso gastar 300 num tênis?”, “contas a pagar”`,
      `${bold('Diagnóstico')}: “minha saúde financeira”, “reserva de emergência”, “meu patrimônio”, “relatório do mês”`,
    ]),
    'Dá para continuar a conversa: depois de “quanto gastei com mercado?”, pergunte “e no mês passado?”. Minhas recomendações são orientativas e não substituem uma consultoria profissional.',
  ]);
  return {
    text,
    suggestions: ['Quanto gastei este mês?', 'Vou fechar o mês no azul?', 'Dicas para economizar', 'Minha saúde financeira'],
    memory: 'keep',
  };
};

/** desconhecido (sem contexto para completar) */
export const unknownReply: Handler = (ctx) => {
  const e = ctx.entities;
  // "recebo 9650 dia 5", "pago 2200 de aluguel todo mês": hábito, não lançamento — sugere cadastrar a recorrência.
  if (e.habitual && e.amount) {
    const income = /^\s*(?:eu\s+)?(?:recebo|ganho|faturo)\b/.test(ctx.parsed.normalized);
    const day = e.date ? ` (dia ${Number(e.date.slice(8, 10))})` : '';
    const value = formatDecimal(e.amount);
    return {
      text: `Entendi que ${income ? 'você recebe' : 'esse gasto é de'} ${formatBRL(e.amount)} todo mês${day}. Para eu prever ${income ? 'essa entrada' : 'essa conta'} nos próximos meses, cadastre em Recorrências. Se quiser registrar o ${income ? 'recebimento' : 'pagamento'} deste mês, diga, por exemplo, “${income ? `recebi ${value} de salário` : `paguei ${value}`}”.`,
      actions: [{ type: 'navigate', label: 'Cadastrar recorrência', to: ROUTES.recurring }],
      suggestions: [income ? `Recebi ${value} de salário` : `Paguei ${value}`, 'Minhas assinaturas'],
      memory: 'keep',
    };
  }
  return genericUnknown(ctx);
};

const genericUnknown: Handler = (ctx) => ({
  text: `${withVocative(ctx.name, 'não entendi bem. 🤔 Pode reformular?')} Alguns exemplos do que eu sei fazer:\n${bullets([
    '“gastei 50 no mercado”',
    '“quanto gastei este mês?”',
    '“como está meu orçamento?”',
    '“vou fechar o mês no azul?”',
  ])}`,
  suggestions: ['O que você sabe fazer?', 'Quanto gastei este mês?', 'Resumo do mês'],
  memory: 'keep',
});

const GENERAL_TIPS = [
  `${bold('Pague-se primeiro')}: assim que receber, separe o valor da poupança. O que não fica à vista é mais fácil de não gastar.`,
  `${bold('Regra 50/30/20')}: até 50% da renda para necessidades, 30% para desejos e pelo menos 20% para objetivos (reserva, metas e dívidas).`,
  `${bold('Regra das 24 horas')}: em compras por impulso, espere um dia antes de decidir. Muitas vezes a vontade passa.`,
  `${bold('Reserva de emergência')}: antes de investir em algo arriscado, junte de 3 a 6 meses do seu custo de vida em uma aplicação de liquidez diária.`,
];

/** dicas */
export const tipsReply: Handler = (ctx) => {
  const { data, today, month } = ctx;
  const insights = generateInsights(data, today).filter((i) => i.severity !== 'positivo');
  const tips = insights.slice(0, 3).map((i) => `${bold(i.title)}: ${i.message}`);
  // Dica sob medida: o maior gasto com desejos do último mês completo.
  const lastMonth = addMonthsToKey(month, -1);
  const want = categoryBreakdown(data.transactions, data.categories, lastMonth, 'despesa').find(
    (r) => r.categoryId !== null && findCategory(data, r.categoryId)?.group === 'desejos',
  );
  if (want && want.categoryId !== null && tips.length < 4) {
    const average = averageMonthlyExpense(data.transactions, month, 3, [want.categoryId]);
    const base = average > 0 ? average : want.total;
    const cut = Math.round(base * 0.2);
    if (cut >= 1000)
      tips.push(
        `${bold(`Corte 20% em ${want.name}`)}: é o seu maior gasto com desejos (cerca de ${formatBRL(base)} por mês). Reduzir 20% libera ${formatBRL(cut)} por mês — ${formatBRL(cut * 12)} por ano.`,
      );
  }
  for (const tip of GENERAL_TIPS) {
    if (tips.length >= 4) break;
    tips.push(tip);
  }
  const personal = insights.some((i) => i.area !== 'dados') || Boolean(want);
  const text = paragraphs([
    personal
      ? withVocative(ctx.name, 'aqui vão minhas dicas, com base nos seus números:')
      : 'Aqui vão algumas dicas para começar com o pé direito:',
    bullets(tips),
  ]);
  const firstAction = insights.find((i) => i.action)?.action;
  const actions: AgentAction[] = firstAction ? [{ type: 'navigate', label: firstAction.label, to: firstAction.to }] : [];
  return {
    text,
    actions,
    suggestions: uniqueSuggestions([
      ...insights.slice(0, 2).map((i) => AREA_SUGGESTION[i.area]),
      'Onde estou gastando mais?',
      'Minha saúde financeira',
    ]),
  };
};

/** relatorio */
export const reportReply: Handler = (ctx) => {
  const month = referenceMonth(ctx);
  const report = monthlyReport(ctx.data, month, ctx.today);
  const summary =
    report.paragraphs.length > 4
      ? [...report.paragraphs.slice(0, 3), report.paragraphs[report.paragraphs.length - 1]]
      : report.paragraphs;
  return {
    text: paragraphs([bold(report.title), ...summary]),
    cards: report.cards,
    actions: [{ type: 'navigate', label: 'Ver relatórios', to: ROUTES.reports }],
    suggestions: ['Compara com o mês passado', 'Onde estou gastando mais?', 'Dicas para economizar'],
    memory: { lastPeriod: monthPeriod(month, ctx.today) },
  };
};
