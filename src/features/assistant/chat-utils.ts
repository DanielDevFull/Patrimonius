/**
 * Utilitários puros da tela do assistente: formato do payload das mensagens do agente, validação de
 * payloads vindos do banco (inclusive de backups antigos), respostas de confirmação ("Pronto! …") e exemplos.
 */
import type {
  AgentAction,
  AgentCard,
  AgentReply,
  CardTone,
  GoalDraft,
  InsightArea,
  IntentName,
  TransactionDraft,
} from '@/agent';
import { findAmounts } from '@/agent/nlu/amount';
import { fold } from '@/agent/nlu/text';
import { ROUTES } from '@/app/navigation';
import {
  addDays,
  formatDateBR,
  formatDateRelative,
  formatMonthLong,
  isISODate,
  isMonthKey,
  parseISO,
  todayISO,
} from '@/domain/dates';
import type { NewTransactionInput } from '@/db/repo';
import { formatBRL, splitMoneyText, type TextPart } from '@/domain/money';
import { normalizeText } from '@/domain/text';
import type {
  Account,
  Category,
  FinanceData,
  GoalStatus,
  ID,
  ISODate,
  MonthKey,
  Priority,
  Transaction,
  TransactionStatus,
  TransactionType,
} from '@/domain/types';
import type { TransactionFormInitial } from '@/features/transactions/TransactionForm';

/** Tempo do indicador "Pat está digitando…" antes de gravar a resposta. */
export const TYPING_DELAY_MS = 400;
/** Tamanho máximo de uma mensagem do usuário. */
export const MAX_MESSAGE_LENGTH = 500;

/** Payload gravado nas mensagens do agente (ChatMessage.payload). */
export interface AgentMessagePayload {
  reply: AgentReply;
  /** Índices de `reply.actions` já executadas (confirmadas pelo usuário). */
  done: number[];
  /** Índices de `reply.actions` recusadas pelo usuário ("Cancelar"). */
  canceled: number[];
}

export type ActionState = 'pending' | 'done' | 'canceled';

export function makePayload(reply: AgentReply): AgentMessagePayload {
  return { reply, done: [], canceled: [] };
}

export function actionState(payload: AgentMessagePayload, index: number): ActionState {
  if (payload.done.includes(index)) return 'done';
  if (payload.canceled.includes(index)) return 'canceled';
  return 'pending';
}

/** Novo payload com a ação marcada como feita/cancelada (idempotente; 'done' prevalece sobre 'canceled'). */
export function withActionState(
  payload: AgentMessagePayload,
  index: number,
  state: Exclude<ActionState, 'pending'>,
): AgentMessagePayload {
  const sortedAdd = (list: number[]) => (list.includes(index) ? list : [...list, index].sort((a, b) => a - b));
  if (state === 'done') {
    return { ...payload, done: sortedAdd(payload.done), canceled: payload.canceled.filter((i) => i !== index) };
  }
  if (payload.done.includes(index)) return payload;
  return { ...payload, canceled: sortedAdd(payload.canceled) };
}

/**
 * Novo payload com o rascunho da ação de lançamento `index` substituído (ex.: pelos valores efetivamente salvos),
 * para o card "Registrado" da conversa refletir o lançamento gravado. Outras ações não são alteradas.
 */
export function withTransactionDraft(payload: AgentMessagePayload, index: number, draft: TransactionDraft): AgentMessagePayload {
  const action = payload.reply.actions[index];
  if (action?.type !== 'create_transaction') return payload;
  const actions = payload.reply.actions.map((a, i) => (i === index ? { ...action, draft } : a));
  return { ...payload, reply: { ...payload.reply, actions } };
}

/* ------------------------------------------------------------------ */
/* Validação do payload (dados do banco são `unknown`)                 */
/* ------------------------------------------------------------------ */

const INTENTS: Record<IntentName, true> = {
  registrar_despesa: true,
  registrar_receita: true,
  registrar_transferencia: true,
  consultar_saldo: true,
  consultar_gastos: true,
  consultar_receitas: true,
  resumo_mes: true,
  comparar_meses: true,
  maiores_gastos: true,
  status_orcamento: true,
  definir_orcamento: true,
  criar_meta: true,
  status_metas: true,
  aportar_meta: true,
  status_dividas: true,
  plano_dividas: true,
  patrimonio: true,
  reserva_emergencia: true,
  saude_financeira: true,
  previsao: true,
  posso_gastar: true,
  contas_a_pagar: true,
  assinaturas: true,
  dicas: true,
  relatorio: true,
  ajuda: true,
  saudacao: true,
  agradecimento: true,
  desconhecido: true,
};
const TONES: Record<CardTone, true> = { positive: true, negative: true, neutral: true, warning: true };
const TX_TYPES: Record<TransactionType, true> = { despesa: true, receita: true, transferencia: true };
const TX_STATUSES: Record<TransactionStatus, true> = { pago: true, pendente: true };
const PRIORITIES: Record<Priority, true> = { alta: true, media: true, baixa: true };
const GOAL_STATUSES: Record<GoalStatus, true> = { ativa: true, concluida: true, pausada: true };

type Rec = Record<string, unknown>;

function isRecord(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isStr(v: unknown): v is string {
  return typeof v === 'string';
}
function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}
function isKey<T extends string>(table: Record<T, true>, v: unknown): v is T {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(table, v);
}
function optStr(v: unknown): string | undefined {
  return isStr(v) ? v : undefined;
}
function optTone(v: unknown): CardTone | undefined {
  return isKey(TONES, v) ? v : undefined;
}
function idOrNull(v: unknown): ID | null | undefined {
  if (v === null) return null;
  return isStr(v) && v ? v : undefined;
}
/** Só rotas internas do app (evita navegar para endereços externos vindos de um backup adulterado). */
export function isInternalPath(to: unknown): to is string {
  return isStr(to) && to.startsWith('/') && !to.startsWith('//') && !to.includes('\\');
}

function parseCard(v: unknown): AgentCard | null {
  if (!isRecord(v) || !isStr(v.title) || !isStr(v.type)) return null;
  const title = v.title;
  if (v.type === 'stat') {
    if (!isStr(v.value)) return null;
    return { type: 'stat', title, value: v.value, hint: optStr(v.hint), tone: optTone(v.tone) };
  }
  if (v.type === 'list') {
    if (!Array.isArray(v.items)) return null;
    const items = v.items.flatMap((it) =>
      isRecord(it) && isStr(it.label) && isStr(it.value)
        ? [{ label: it.label, value: it.value, hint: optStr(it.hint), tone: optTone(it.tone) }]
        : [],
    );
    return items.length ? { type: 'list', title, items } : null;
  }
  if (v.type === 'progress') {
    if (!Array.isArray(v.items)) return null;
    const items = v.items.flatMap((it) =>
      isRecord(it) && isStr(it.label) && isNum(it.current) && isNum(it.target)
        ? [{ label: it.label, current: it.current, target: it.target, hint: optStr(it.hint), tone: optTone(it.tone) }]
        : [],
    );
    return items.length ? { type: 'progress', title, items } : null;
  }
  if (v.type === 'chart') {
    if ((v.chart !== 'bar' && v.chart !== 'pie') || !Array.isArray(v.data)) return null;
    const data = v.data.flatMap((d) =>
      isRecord(d) && isStr(d.label) && isNum(d.value)
        ? [{ label: d.label, value: d.value, color: optStr(d.color) }]
        : [],
    );
    return data.length ? { type: 'chart', title, chart: v.chart, data } : null;
  }
  return null;
}

function parseTransactionDraft(v: unknown): TransactionDraft | null {
  if (!isRecord(v)) return null;
  const categoryId = idOrNull(v.categoryId);
  const accountId = idOrNull(v.accountId);
  const toAccountId = idOrNull(v.toAccountId);
  if (
    !isKey(TX_TYPES, v.type) ||
    !isInt(v.amount) ||
    v.amount <= 0 ||
    !isISODate(v.date) ||
    !isStr(v.description) ||
    categoryId === undefined ||
    accountId === undefined ||
    toAccountId === undefined ||
    !isKey(TX_STATUSES, v.status)
  ) {
    return null;
  }
  const installments = isInt(v.installments) && v.installments >= 1 ? v.installments : 1;
  return {
    type: v.type,
    amount: v.amount,
    date: v.date,
    description: v.description,
    categoryId,
    accountId,
    toAccountId,
    status: v.status,
    installments,
  };
}

function parseGoalDraft(v: unknown): GoalDraft | null {
  if (!isRecord(v)) return null;
  if (
    !isStr(v.name) ||
    !isInt(v.targetAmount) ||
    v.targetAmount <= 0 ||
    !(v.targetDate === null || isISODate(v.targetDate)) ||
    !isStr(v.icon) ||
    !isStr(v.color) ||
    !isKey(PRIORITIES, v.priority) ||
    !isKey(GOAL_STATUSES, v.status)
  ) {
    return null;
  }
  return {
    name: v.name,
    targetAmount: v.targetAmount,
    targetDate: v.targetDate,
    icon: v.icon,
    color: v.color,
    priority: v.priority,
    status: v.status,
  };
}

function parseAction(v: unknown): AgentAction | null {
  if (!isRecord(v) || !isStr(v.label)) return null;
  const label = v.label;
  switch (v.type) {
    case 'create_transaction': {
      const draft = parseTransactionDraft(v.draft);
      return draft ? { type: 'create_transaction', label, draft } : null;
    }
    case 'set_budget':
      if (!isStr(v.categoryId) || !v.categoryId || !isInt(v.amount) || v.amount < 0) return null;
      if (!(v.month === null || isMonthKey(v.month))) return null;
      return { type: 'set_budget', label, categoryId: v.categoryId, amount: v.amount, month: v.month };
    case 'create_goal': {
      const draft = parseGoalDraft(v.draft);
      return draft ? { type: 'create_goal', label, draft } : null;
    }
    case 'contribute_goal':
      if (!isStr(v.goalId) || !v.goalId || !isInt(v.amount) || v.amount === 0 || !isISODate(v.date)) return null;
      return { type: 'contribute_goal', label, goalId: v.goalId, amount: v.amount, date: v.date };
    case 'navigate':
      return isInternalPath(v.to) ? { type: 'navigate', label, to: v.to } : null;
    default:
      return null;
  }
}

function parseReply(v: unknown): AgentReply | null {
  if (!isRecord(v) || !isStr(v.text)) return null;
  return {
    intent: isKey(INTENTS, v.intent) ? v.intent : 'desconhecido',
    text: v.text,
    cards: Array.isArray(v.cards) ? v.cards.map(parseCard).filter((c): c is AgentCard => c !== null) : [],
    // Ações inválidas são descartadas (ver readAgentPayload sobre os índices de done/canceled).
    actions: Array.isArray(v.actions) ? v.actions.map(parseAction).filter((a): a is AgentAction => a !== null) : [],
    suggestions: Array.isArray(v.suggestions)
      ? v.suggestions.filter((s): s is string => isStr(s) && s.trim() !== '').slice(0, 4)
      : [],
  };
}

function indexList(v: unknown, max: number): number[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((i): i is number => isInt(i) && i >= 0 && i < max))].sort((a, b) => a - b);
}

/**
 * Lê o payload de uma mensagem do agente de forma tolerante: aceita `{ reply, done, canceled }` e também um
 * `AgentReply` puro (formato antigo). Cards/ações malformados são descartados; retorna null se não houver resposta.
 * Observação: se alguma ação inválida for descartada, os índices de done/canceled deixam de ser confiáveis —
 * nesse caso todas as ações ficam marcadas como canceladas (nunca reexecuta algo por engano).
 */
export function readAgentPayload(payload: unknown): AgentMessagePayload | null {
  if (!isRecord(payload)) return null;
  const wrapped = isRecord(payload.reply);
  const rawReply = wrapped ? payload.reply : payload;
  const reply = parseReply(rawReply);
  if (!reply) return null;
  const rawActions = isRecord(rawReply) && Array.isArray(rawReply.actions) ? rawReply.actions.length : 0;
  const max = reply.actions.length;
  if (rawActions !== max) {
    return { reply, done: [], canceled: reply.actions.map((_, i) => i) };
  }
  const done = wrapped ? indexList(payload.done, max) : [];
  const canceled = wrapped ? indexList(payload.canceled, max).filter((i) => !done.includes(i)) : [];
  return { reply, done, canceled };
}

/* ------------------------------------------------------------------ */
/* Rascunho de lançamento → gravação / formulário                      */
/* ------------------------------------------------------------------ */

/** Entrada de `addTransaction` a partir do rascunho do agente e das contas escolhidas no card. */
export function draftToInput(
  draft: TransactionDraft,
  accounts: { accountId: ID; toAccountId: ID | null },
): NewTransactionInput {
  const transfer = draft.type === 'transferencia';
  return {
    type: draft.type,
    amount: draft.amount,
    date: draft.date,
    description: draft.description.trim(),
    categoryId: transfer ? null : draft.categoryId,
    accountId: accounts.accountId,
    toAccountId: transfer ? accounts.toAccountId : null,
    status: draft.status,
    installments: draft.type === 'despesa' ? Math.max(1, Math.floor(draft.installments)) : 1,
  };
}

/** Pré-preenchimento do formulário de lançamento ("Editar") a partir do rascunho e das contas já escolhidas. */
export function draftToInitial(
  draft: TransactionDraft,
  accounts: { accountId?: ID; toAccountId?: ID } = {},
): TransactionFormInitial {
  return {
    type: draft.type,
    amount: draft.amount,
    date: draft.date,
    description: draft.description,
    categoryId: draft.type === 'transferencia' ? null : draft.categoryId,
    accountId: accounts.accountId ?? draft.accountId,
    toAccountId: draft.type === 'transferencia' ? (accounts.toAccountId ?? draft.toAccountId) : null,
    status: draft.status,
    installments: draft.installments,
  };
}

function byDateThenInstallment(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return (a.installment?.number ?? 0) - (b.installment?.number ?? 0);
}

/**
 * Rascunho com os valores efetivamente gravados (pela confirmação no card ou pelo formulário "Editar"), para o card
 * da conversa mostrar o que foi registrado — e não a proposta original. Parcelado: valor TOTAL do grupo e o número
 * de parcelas; a descrição perde o sufixo ' (1/N)'. null se nada foi gravado (ex.: recorrência sem lançamento ainda).
 */
export function draftFromSaved(txs: Transaction[]): TransactionDraft | null {
  const first = [...txs].sort(byDateThenInstallment)[0];
  if (!first) return null;
  const groupId = first.installment?.groupId;
  const group = groupId ? txs.filter((t) => t.installment?.groupId === groupId) : [first];
  const transfer = first.type === 'transferencia';
  return {
    type: first.type,
    amount: group.reduce((s, t) => s + t.amount, 0),
    date: first.date,
    description: first.installment ? baseDescription(first.description) : first.description,
    categoryId: transfer ? null : first.categoryId,
    accountId: first.accountId,
    toAccountId: transfer ? first.toAccountId : null,
    status: first.status,
    installments: first.installment ? Math.max(1, first.installment.total) : 1,
  };
}

/* ------------------------------------------------------------------ */
/* Respostas de confirmação ("Pronto! …")                              */
/* ------------------------------------------------------------------ */

function categoryText(category: Pick<Category, 'icon' | 'name'>): string {
  return `${category.icon ? `${category.icon} ` : ''}${category.name}`;
}

function accountText(account: Pick<Account, 'icon' | 'name'>): string {
  return `${account.icon ? `${account.icon} ` : ''}${account.name}`;
}

/** 'hoje' / 'ontem' / 'amanhã' / 'em 05/10/2026'. */
function whenText(date: ISODate, today: ISODate): string {
  const rel = formatDateRelative(date, today);
  return /^\d/.test(rel) ? `em ${rel}` : rel;
}

/** Descrição sem o sufixo de parcela ' (1/3)'. */
function baseDescription(description: string): string {
  return description.replace(/\s*\(\d+\/\d+\)$/, '').trim();
}

function reply(intent: IntentName, text: string, suggestions: string[], actions: AgentAction[] = []): AgentReply {
  return { intent, text, cards: [], actions, suggestions };
}

/** Resposta do Pat depois de salvar um lançamento proposto (pela confirmação ou pelo formulário de edição). */
export function transactionDoneReply(txs: Transaction[], data: FinanceData, today: ISODate): AgentReply {
  const first = [...txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0];
  const seeTransactions: AgentAction[] = [{ type: 'navigate', label: 'Ver lançamentos', to: ROUTES.transactions }];
  if (!first) return reply('desconhecido', 'Pronto! Lançamento salvo. ✅', ['Qual meu saldo?'], seeTransactions);

  const total = txs.reduce((s, t) => s + t.amount, 0);
  const account = data.accounts.find((a) => a.id === first.accountId);
  const intent: IntentName =
    first.type === 'despesa' ? 'registrar_despesa' : first.type === 'receita' ? 'registrar_receita' : 'registrar_transferencia';

  if (first.type === 'transferencia') {
    const to = data.accounts.find((a) => a.id === first.toAccountId);
    const route = `${account ? ` de ${accountText(account)}` : ''}${to ? ` para ${accountText(to)}` : ''}`;
    const text = [
      `Pronto! Registrei a transferência de **${formatBRL(total)}**${route}, ${whenText(first.date, today)}. ✅`,
      first.status === 'pendente' ? 'Ela ficou como pendente até a data chegar.' : null,
    ]
      .filter(Boolean)
      .join(' ');
    return reply(intent, text, ['Qual meu saldo?', 'Contas a pagar'], seeTransactions);
  }

  const category = data.categories.find((c) => c.id === first.categoryId);
  const description = baseDescription(first.description);
  const showCategory = category && normalizeText(category.name) !== normalizeText(description);
  const what = `${description ? `: ${description}` : ''}${showCategory ? ` (${categoryText(category)})` : ''}`;
  const where = account ? `, em ${accountText(account)}` : '';
  const count = first.installment?.total ?? txs.length;
  const parts: (string | null)[] = [];
  if (count > 1) {
    parts.push(
      `Pronto! Registrei a compra parcelada de **${formatBRL(total)}** em ${count}x${what}, 1ª parcela ${whenText(first.date, today)}${where}. ✅`,
    );
    if (txs.some((t) => t.status === 'pendente')) parts.push('As próximas parcelas ficaram pendentes, uma por mês.');
  } else {
    const kind = first.type === 'despesa' ? 'a despesa' : 'a receita';
    parts.push(`Pronto! Registrei ${kind} de **${formatBRL(total)}**${what}, ${whenText(first.date, today)}${where}. ✅`);
    if (first.status === 'pendente') parts.push('Ficou como pendente: ela só entra no saldo quando você confirmar.');
  }
  const suggestions =
    first.type === 'despesa'
      ? [category ? `Quanto gastei com ${category.name} este mês?` : 'Quanto gastei este mês?', 'Como está meu orçamento?', 'Qual meu saldo?']
      : ['Quanto ganhei este mês?', 'Qual meu saldo?', 'Resumo do mês'];
  return reply(intent, parts.filter(Boolean).join(' '), suggestions, seeTransactions);
}

/** Resposta depois de definir um orçamento. */
export function budgetDoneReply(categoryId: ID, amount: number, month: MonthKey | null, data: FinanceData): AgentReply {
  const category = data.categories.find((c) => c.id === categoryId);
  const name = category ? categoryText(category) : 'da categoria';
  const period = month ? `em ${formatMonthLong(month)}` : 'por mês (vale para todos os meses)';
  return reply(
    'definir_orcamento',
    `Pronto! Defini o orçamento de **${name}** em **${formatBRL(amount)}** ${period}. ✅ Eu aviso quando os gastos chegarem perto do limite.`,
    ['Como está meu orçamento?', category ? `Quanto gastei com ${category.name} este mês?` : 'Quanto gastei este mês?'],
    [{ type: 'navigate', label: 'Ver orçamentos', to: ROUTES.budgets }],
  );
}

/** Resposta depois de criar uma meta. */
export function goalDoneReply(draft: GoalDraft): AgentReply {
  const deadline = draft.targetDate ? ` até ${formatDateBR(draft.targetDate)}` : '';
  return reply(
    'criar_meta',
    `Pronto! Criei a meta ${draft.icon} **${draft.name}**: ${formatBRL(draft.targetAmount)}${deadline}. 🎯 Quando guardar dinheiro para ela, é só me contar — por exemplo, “guardei 200 na meta ${draft.name}”.`,
    ['Como estão minhas metas?', `Guardei 200 na meta ${draft.name}`],
    [{ type: 'navigate', label: 'Ver metas', to: ROUTES.goals }],
  );
}

/** Resposta depois de registrar um aporte (ou resgate) em uma meta. */
export function contributionDoneReply(goalId: ID, amount: number, data: FinanceData): AgentReply {
  const goal = data.goals.find((g) => g.id === goalId);
  const label = goal ? `${goal.icon ? `${goal.icon} ` : ''}${goal.name}` : 'sua meta';
  const saved = data.goalContributions.filter((c) => c.goalId === goalId).reduce((s, c) => s + c.amount, 0) + amount;
  const parts: string[] = [
    amount > 0
      ? `Pronto! Registrei o aporte de **${formatBRL(amount)}** na meta ${label}. ✅`
      : `Pronto! Registrei o resgate de **${formatBRL(-amount)}** da meta ${label}. ✅`,
  ];
  if (goal) {
    parts.push(
      saved >= goal.targetAmount
        ? `Meta concluída: ${formatBRL(saved)} de ${formatBRL(goal.targetAmount)}! 🎉`
        : `Agora são ${formatBRL(Math.max(0, saved))} de ${formatBRL(goal.targetAmount)}.`,
    );
  }
  return reply('aportar_meta', parts.join(' '), ['Como estão minhas metas?', 'Qual meu saldo?'], [
    { type: 'navigate', label: 'Ver metas', to: ROUTES.goals },
  ]);
}

/** Resposta quando o usuário cancela um lançamento proposto. */
export function canceledReply(): AgentReply {
  return reply('agradecimento', 'Tudo bem, não registrei nada. 👍 Se quiser, me diga de novo com os dados certos.', [
    'O que você sabe fazer?',
  ]);
}

/* ------------------------------------------------------------------ */
/* Valores em texto livre (modo "ocultar valores")                     */
/* ------------------------------------------------------------------ */

/**
 * Separa os valores de um texto livre — mensagem digitada pelo usuário ou sugestão de pergunta — para o modo
 * "ocultar valores" (trechos `money` recebem a classe `.money`). Além de 'R$ 1.234,56', marca os valores que o
 * Pat reconhece sem o símbolo: '1.250', '9650', '6 mil', '2k', '50 reais', 'cem reais'. Datas, parcelas ('10x'),
 * prazos ('12 meses') e percentuais continuam visíveis. Juntar os trechos devolve o texto original.
 */
export function splitUserMoneyText(text: string): TextPart[] {
  const ranges: { start: number; end: number }[] = findAmounts(fold(text)).map(({ start, end }) => ({ start, end }));
  let pos = 0;
  for (const part of splitMoneyText(text)) {
    if (part.money) ranges.push({ start: pos, end: pos + part.text.length });
    pos += part.text.length;
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const parts: TextPart[] = [];
  let last = 0;
  for (const { start, end } of ranges) {
    if (end <= last) continue;
    const from = Math.max(start, last);
    if (from > last) parts.push({ text: text.slice(last, from), money: false });
    const prev = parts.at(-1);
    if (prev?.money && from === last) prev.text += text.slice(from, end);
    else parts.push({ text: text.slice(from, end), money: true });
    last = end;
  }
  if (last < text.length) parts.push({ text: text.slice(last), money: false });
  return parts;
}

/* ------------------------------------------------------------------ */
/* Horário das mensagens                                               */
/* ------------------------------------------------------------------ */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Horário de uma mensagem: '14:05' (hoje), 'ontem, 14:05' ou '05/10, 14:05' ('' se o carimbo for inválido). */
export function formatMessageTime(createdAt: string, today: ISODate): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return '';
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const day = todayISO(d);
  if (day === today) return time;
  if (day === addDays(today, -1)) return `ontem, ${time}`;
  const { year, month, day: dd } = parseISO(day);
  const sameYear = year === parseISO(today).year;
  return `${pad2(dd)}/${pad2(month)}${sameYear ? '' : `/${year}`}, ${time}`;
}

/* ------------------------------------------------------------------ */
/* Exemplos e perguntas sobre insights                                 */
/* ------------------------------------------------------------------ */

export interface ExampleGroup {
  id: 'registrar' | 'consultar' | 'planejar';
  title: string;
  examples: string[];
}

/** Exemplos clicáveis do painel "Pergunte ao Pat". */
export const EXAMPLE_GROUPS: ExampleGroup[] = [
  {
    id: 'registrar',
    title: 'Registrar',
    examples: [
      'Gastei 45,90 no iFood ontem',
      'Recebi 5000 de salário',
      'Paguei 120 de conta de luz',
      'Transferi 500 da corrente para a poupança',
    ],
  },
  {
    id: 'consultar',
    title: 'Consultar',
    examples: ['Qual meu saldo?', 'Quanto gastei este mês?', 'Onde estou gastando mais?', 'Como está meu orçamento?'],
  },
  {
    id: 'planejar',
    title: 'Planejar',
    examples: [
      'Vou fechar o mês no azul?',
      'Posso gastar 300 num tênis?',
      'Criar meta viagem de 10 mil em 12 meses',
      'Dicas para economizar',
    ],
  },
];

/** Pergunta para "conversar sobre" um insight, por área. */
export const INSIGHT_AREA_QUESTION: Record<InsightArea, string> = {
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

/** Nome do agente configurado (padrão 'Pat'). */
export function agentNameOf(data: Pick<FinanceData, 'settings'>): string {
  return data.settings.agentName?.trim() || 'Pat';
}
