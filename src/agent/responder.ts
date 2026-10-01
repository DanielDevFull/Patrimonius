import { monthKey } from '@/domain/dates';
import type { FinanceData, ISODate } from '@/domain/types';
import { firstName, uniqueSuggestions } from './format';
import { extractGoalTiming, parseMessage } from './nlu';
import { budgetStatusReply, setBudgetReply } from './responder/budgets';
import { affordabilityReply, balanceQuery, billsReply, forecastReply } from './responder/cash';
import {
  buildGreeting,
  greetingReply,
  helpReply,
  reportReply,
  thanksReply,
  tipsReply,
  unknownReply,
} from './responder/coach';
import { findCategory, type Handler, type TurnContext } from './responder/context';
import { debtPlanReply, debtsStatusReply } from './responder/debts';
import { contributeGoalReply, createGoalReply, goalsStatusReply } from './responder/goals';
import { subscriptionsReply } from './responder/recurring';
import { amountKindReply, registerFlow, transferFlow } from './responder/register';
import { compareMonths, incomeQuery, monthSummaryReply, spendingQuery, topSpending } from './responder/spending';
import { emergencyReply, healthReply, netWorthReply } from './responder/wealth';
import type {
  AgentReply,
  ConversationState,
  IntentName,
  ParsedEntities,
  ParsedIntent,
} from './types';

/** Um handler por intenção (todas as intenções do contrato são tratadas). */
const HANDLERS: Record<IntentName, Handler> = {
  registrar_despesa: registerFlow,
  registrar_receita: registerFlow,
  registrar_transferencia: transferFlow,
  consultar_saldo: balanceQuery,
  consultar_gastos: spendingQuery,
  consultar_receitas: incomeQuery,
  resumo_mes: monthSummaryReply,
  comparar_meses: compareMonths,
  maiores_gastos: topSpending,
  status_orcamento: budgetStatusReply,
  definir_orcamento: setBudgetReply,
  criar_meta: createGoalReply,
  status_metas: goalsStatusReply,
  aportar_meta: contributeGoalReply,
  status_dividas: debtsStatusReply,
  plano_dividas: debtPlanReply,
  patrimonio: netWorthReply,
  reserva_emergencia: emergencyReply,
  saude_financeira: healthReply,
  previsao: forecastReply,
  posso_gastar: affordabilityReply,
  contas_a_pagar: billsReply,
  assinaturas: subscriptionsReply,
  dicas: tipsReply,
  relatorio: reportReply,
  ajuda: helpReply,
  saudacao: greetingReply,
  agradecimento: thanksReply,
  desconhecido: unknownReply,
};

/** Intenções que podem ser repetidas com novas entidades ("e no mês passado?", "e com lazer?", "e 200?"). */
const CONTINUABLE = new Set<IntentName>([
  'consultar_gastos',
  'consultar_receitas',
  'resumo_mes',
  'comparar_meses',
  'maiores_gastos',
  'status_orcamento',
  'consultar_saldo',
  'previsao',
  'contas_a_pagar',
  'relatorio',
  'status_metas',
  'posso_gastar',
]);

const REGISTER_INTENTS = new Set<IntentName>(['registrar_despesa', 'registrar_receita']);

/** Pedidos que o Pat pode deixar à espera do valor ("Qual foi o valor?", "Quanto você quer juntar?"...). */
const AWAITING_INTENTS = new Set<IntentName>([
  'registrar_despesa',
  'registrar_receita',
  'registrar_transferencia',
  'criar_meta',
  'aportar_meta',
  'definir_orcamento',
]);

function hasEntities(e: ParsedEntities): boolean {
  return Boolean(
    e.period ||
      e.categoryId ||
      e.accountId ||
      e.goalId ||
      e.date ||
      (e.amount !== undefined && e.amount > 0) ||
      (e.installments !== undefined && e.installments > 0),
  );
}

/** Mensagem que é só um valor ("45", "R$ 45,90"): resposta à pergunta "Qual foi o valor?". */
function isBareAmount(parsed: ParsedIntent): boolean {
  const e = parsed.entities;
  return (
    e.amount !== undefined &&
    !e.description &&
    !e.categoryId &&
    !e.habitual &&
    (REGISTER_INTENTS.has(parsed.intent) || parsed.intent === 'desconhecido')
  );
}

/**
 * A mensagem traz um valor e não é um pedido próprio: responde a "Quanto você quer juntar?" ("10 mil",
 * "10 mil em 12 meses"). Um lançamento com verbo ("gastei 50 no mercado", confiança 0,9) é outro pedido.
 */
function answersAmount(parsed: ParsedIntent): boolean {
  const e = parsed.entities;
  if (e.amount === undefined || e.amount <= 0 || e.habitual) return false;
  return parsed.intent === 'desconhecido' || (REGISTER_INTENTS.has(parsed.intent) && parsed.confidence < 0.9);
}

/** Copia só as chaves definidas (mantém o estado serializável e comparável). */
function defined(e: ParsedEntities): ParsedEntities {
  const out: ParsedEntities = {};
  for (const [k, v] of Object.entries(e) as [keyof ParsedEntities, unknown][]) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

interface ResolvedTurn {
  intent: IntentName;
  entities: ParsedEntities;
  /** Resposta especial (ex.: valor solto depois de uma consulta: "é um gasto ou uma entrada?"). */
  handler?: Handler;
}

/**
 * Decide qual intenção tratar e com quais entidades, usando o estado da conversa para continuações:
 * - valor depois de uma pergunta do Pat ("Qual foi o valor?", "Quanto você quer juntar?") completa o pedido anterior
 *   (lançamento, transferência, meta, aporte ou orçamento) com o que já tinha sido dito;
 * - "foi ontem", "no cartão" logo depois de um rascunho de lançamento refazem o rascunho com a correção;
 * - mensagem curta só com entidades ("e no mês passado?", "e em 10x?") repete a última consulta com as novas entidades;
 * - valor solto depois de uma consulta pergunta se é gasto ou entrada (não vira despesa direto).
 */
function resolveTurn(
  parsed: ParsedIntent,
  state: ConversationState,
  data: FinanceData,
  today: ISODate,
): ResolvedTurn {
  const e = parsed.entities;
  const last = state.lastIntent;
  const pending = state.lastEntities ?? {};

  if (last && state.awaitingAmount && AWAITING_INTENTS.has(last)) {
    // O mesmo pedido repetido com o valor ("transferi 500", "gastei 50"): o que foi dito antes completa o que faltar.
    if ((REGISTER_INTENTS.has(last) && isBareAmount(parsed)) || (parsed.intent === last && e.amount)) {
      return { intent: last, entities: { ...pending, ...defined(e) } };
    }
    if (!REGISTER_INTENTS.has(last) && answersAmount(parsed)) {
      // Só o valor (e, conforme o pedido, prazo, data ou conta) vem da resposta; o resto já tinha sido dito.
      const timing = last === 'criar_meta' ? extractGoalTiming(parsed.raw, today) : {};
      const usesAccount = last === 'registrar_transferencia' || last === 'aportar_meta';
      return {
        intent: last,
        entities: defined({
          ...pending,
          ...timing,
          amount: e.amount,
          date: e.date ?? pending.date,
          accountId: usesAccount ? (e.accountId ?? pending.accountId) : pending.accountId,
        }),
      };
    }
  }
  if (last && REGISTER_INTENTS.has(last) && isBareAmount(parsed)) {
    return {
      intent: last,
      entities: {
        ...e,
        ...(state.lastCategoryId ? { categoryId: e.categoryId ?? state.lastCategoryId } : {}),
        ...(state.lastAccountId ? { accountId: e.accountId ?? state.lastAccountId } : {}),
      },
    };
  }
  // Correção do rascunho anterior: "foi ontem", "no cartão".
  if (
    last &&
    REGISTER_INTENTS.has(last) &&
    pending.amount !== undefined &&
    parsed.intent === 'desconhecido' &&
    parsed.confidence >= 0.2 &&
    e.amount === undefined &&
    !e.categoryId &&
    (e.date || e.accountId)
  ) {
    const fix: ParsedEntities = defined({ date: e.date, accountId: e.accountId });
    return { intent: last, entities: { ...pending, ...fix, ...(e.date ? { dateApprox: undefined } : {}) } };
  }
  if (
    parsed.intent === 'desconhecido' &&
    parsed.confidence >= 0.2 &&
    !e.habitual &&
    last &&
    CONTINUABLE.has(last) &&
    hasEntities(e)
  ) {
    let intent = last;
    const kind = findCategory(data, e.categoryId)?.kind;
    if (intent === 'consultar_gastos' && kind === 'receita') intent = 'consultar_receitas';
    else if (intent === 'consultar_receitas' && kind === 'despesa') intent = 'consultar_gastos';
    const inherited: ParsedEntities = {};
    if (state.lastPeriod) inherited.period = state.lastPeriod;
    if (state.lastCategoryId && intent === last) inherited.categoryId = state.lastCategoryId;
    if (state.lastAccountId) inherited.accountId = state.lastAccountId;
    if (intent === last && !e.categoryId) {
      // Compra simulada ("e em 10x?") e termo da consulta ("ifood") continuam valendo.
      if (last === 'posso_gastar') Object.assign(inherited, defined({ ...pending, period: inherited.period }));
      else if (pending.term) inherited.term = pending.term;
    }
    return { intent, entities: { ...inherited, ...e } };
  }
  // Valor solto ("45") depois de uma consulta: não dá para saber se é gasto ou entrada.
  if (
    last &&
    !REGISTER_INTENTS.has(last) &&
    parsed.intent === 'registrar_despesa' &&
    parsed.confidence <= 0.55 &&
    isBareAmount(parsed) &&
    !e.accountId &&
    !e.date
  ) {
    if (last === 'posso_gastar') {
      return { intent: last, entities: { ...defined({ ...pending, period: state.lastPeriod }), ...e } };
    }
    return { intent: 'desconhecido', entities: e, handler: amountKindReply };
  }
  return { intent: parsed.intent, entities: e };
}

function cleanEntities(e: ParsedEntities | undefined): ParsedEntities | undefined {
  if (!e) return undefined;
  const out = defined(e);
  return Object.keys(out).length ? out : undefined;
}

/** Remove chaves undefined do estado (mantém o objeto serializável e comparável). */
function compactState(state: ConversationState): ConversationState {
  const out: ConversationState = {};
  if (state.lastIntent !== undefined) out.lastIntent = state.lastIntent;
  if (state.lastPeriod !== undefined) out.lastPeriod = state.lastPeriod;
  if (state.lastCategoryId !== undefined) out.lastCategoryId = state.lastCategoryId;
  if (state.lastAccountId !== undefined) out.lastAccountId = state.lastAccountId;
  const entities = cleanEntities(state.lastEntities);
  if (entities) out.lastEntities = entities;
  if (state.awaitingAmount) out.awaitingAmount = true;
  return out;
}

/**
 * Responde a uma mensagem do usuário. Função pura e determinística (dado data/today/state).
 * Retorna a resposta e o novo estado da conversa.
 *
 * Fluxo: parseMessage (NLU local) → resolução de continuações com o estado → handler da intenção
 * (src/agent/responder/*). Registros, orçamentos e metas voltam como AÇÕES PROPOSTAS (o usuário confirma).
 * Mensagens de cortesia (saudação, ajuda, agradecimento) e as não entendidas preservam o estado anterior,
 * para que a conversa possa continuar de onde parou.
 */
export function respond(
  text: string,
  data: FinanceData,
  today: ISODate,
  state: ConversationState,
): { reply: AgentReply; state: ConversationState } {
  const parsed = parseMessage(text, {
    today,
    categories: data.categories,
    accounts: data.accounts,
    goals: data.goals,
    transactions: data.transactions,
  });
  const { intent, entities, handler } = resolveTurn(parsed, state ?? {}, data, today);
  const ctx: TurnContext = {
    data,
    today,
    month: monthKey(today),
    name: firstName(data.settings),
    intent,
    parsed,
    entities,
    state: state ?? {},
  };
  const out = (handler ?? HANDLERS[intent])(ctx);
  const reply: AgentReply = {
    intent,
    text: out.text,
    cards: out.cards ?? [],
    actions: out.actions ?? [],
    suggestions: uniqueSuggestions(out.suggestions ?? []),
  };
  const nextState =
    out.memory === 'keep' ? compactState(state ?? {}) : compactState({ lastIntent: intent, ...(out.memory ?? {}) });
  return { reply, state: nextState };
}

/** Mensagem de boas-vindas/abertura com resumo rápido e principais insights do dia. */
export function greeting(data: FinanceData, today: ISODate): AgentReply {
  return buildGreeting(data, today);
}
