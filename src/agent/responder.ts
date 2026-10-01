import { monthKey } from '@/domain/dates';
import type { FinanceData, ISODate } from '@/domain/types';
import { firstName, uniqueSuggestions } from './format';
import { parseMessage } from './nlu';
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
import { registerFlow, transferFlow } from './responder/register';
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
  'assinaturas',
  'status_metas',
  'posso_gastar',
]);

const REGISTER_INTENTS = new Set<IntentName>(['registrar_despesa', 'registrar_receita']);

function hasEntities(e: ParsedEntities): boolean {
  return Boolean(
    e.period || e.categoryId || e.accountId || e.goalId || e.date || (e.amount !== undefined && e.amount > 0),
  );
}

/** Mensagem que é só um valor ("45", "R$ 45,90"): resposta à pergunta "Qual foi o valor?". */
function isBareAmount(parsed: ParsedIntent): boolean {
  const e = parsed.entities;
  return (
    e.amount !== undefined &&
    !e.description &&
    !e.categoryId &&
    (REGISTER_INTENTS.has(parsed.intent) || parsed.intent === 'desconhecido')
  );
}

/**
 * Decide qual intenção tratar e com quais entidades, usando o estado da conversa para continuações:
 * - valor solto depois de um registro ("Qual foi o valor?" → "45") completa o registro anterior;
 * - mensagem curta só com entidades ("e no mês passado?") repete a última consulta com as novas entidades.
 */
function resolveTurn(
  parsed: ParsedIntent,
  state: ConversationState,
  data: FinanceData,
): { intent: IntentName; entities: ParsedEntities } {
  const e = parsed.entities;
  const last = state.lastIntent;
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
  if (parsed.intent === 'desconhecido' && last && CONTINUABLE.has(last) && hasEntities(e)) {
    let intent = last;
    const kind = findCategory(data, e.categoryId)?.kind;
    if (intent === 'consultar_gastos' && kind === 'receita') intent = 'consultar_receitas';
    else if (intent === 'consultar_receitas' && kind === 'despesa') intent = 'consultar_gastos';
    const inherited: ParsedEntities = {};
    if (state.lastPeriod) inherited.period = state.lastPeriod;
    if (state.lastCategoryId && intent === last) inherited.categoryId = state.lastCategoryId;
    if (state.lastAccountId) inherited.accountId = state.lastAccountId;
    return { intent, entities: { ...inherited, ...e } };
  }
  return { intent: parsed.intent, entities: e };
}

/** Remove chaves undefined do estado (mantém o objeto serializável e comparável). */
function compactState(state: ConversationState): ConversationState {
  const out: ConversationState = {};
  if (state.lastIntent !== undefined) out.lastIntent = state.lastIntent;
  if (state.lastPeriod !== undefined) out.lastPeriod = state.lastPeriod;
  if (state.lastCategoryId !== undefined) out.lastCategoryId = state.lastCategoryId;
  if (state.lastAccountId !== undefined) out.lastAccountId = state.lastAccountId;
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
  const { intent, entities } = resolveTurn(parsed, state ?? {}, data);
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
  const out = HANDLERS[intent](ctx);
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
