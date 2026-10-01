import { addMonths, formatDateBR } from '@/domain/dates';
import { normalizeText } from '@/domain/text';
import type { Account, Category, Goal, ISODate, Transaction } from '@/domain/types';
import { suggestCategory } from '../categorizer';
import type { IntentName, ParsedEntities, ParsedIntent, Period } from '../types';
import { findAmounts, findInstallments, pickAmount } from './amount';
import { findDates } from './dates';
import { buildDescription, VERB_NOUN } from './description';
import { matchGoal, rankAccounts, scoreCategories, type CategoryHit } from './entities';
import { classify, correctTypos, INTERROGATIVE } from './intents';
import { bestMentionAccount, defaultSource, findAccountMentions } from './mentions';
import { findPeriod } from './period';
import { budgetMonth, goalMonths, goalName, goalTargetDate } from './planning';
import { CATEGORY_SYNONYMS } from './synonyms';
import { expandSlang, fold, maskSpans, words, type Span } from './text';

export { extractAmount } from './amount';
export { extractDate } from './dates';
export { extractPeriod } from './period';
export { matchAccount, matchCategory, matchGoal } from './entities';

export interface NluContext {
  today: ISODate;
  categories: Category[];
  accounts: Account[];
  goals: Goal[];
  /** Histórico para melhorar a categorização (opcional). */
  transactions?: Transaction[];
}

/* ------------------------------------------------------------------ */
/* parseMessage                                                        */
/* ------------------------------------------------------------------ */

function knownWords(ctx: NluContext): Set<string> {
  const set = new Set<string>();
  for (const c of ctx.categories) {
    for (const w of words(fold(c.name))) set.add(w);
    for (const k of c.keywords) for (const w of words(fold(k))) set.add(w);
    for (const s of CATEGORY_SYNONYMS[c.id] ?? []) for (const w of words(s)) set.add(w);
  }
  for (const a of ctx.accounts) for (const w of words(fold(a.name))) set.add(w);
  for (const g of ctx.goals) for (const w of words(fold(g.name))) set.add(w);
  return set;
}

function hitToEntity(
  hit: CategoryHit | undefined,
): Pick<ParsedEntities, 'categoryId' | 'categoryConfidence'> {
  return hit ? { categoryId: hit.categoryId, categoryConfidence: hit.score } : {};
}

function clean(entities: ParsedEntities): ParsedEntities {
  const out: ParsedEntities = {};
  for (const [k, v] of Object.entries(entities) as [keyof ParsedEntities, unknown][]) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

const QUERY_PERIOD_INTENTS = new Set<IntentName>([
  'consultar_gastos',
  'consultar_receitas',
  'resumo_mes',
  'comparar_meses',
  'maiores_gastos',
  'status_orcamento',
  'previsao',
  'contas_a_pagar',
  'relatorio',
  'assinaturas',
  'saude_financeira',
  'desconhecido',
]);

const LEADING_GREETING =
  /^\s*(?:oi+e?|ola+|opa|eai|e ai|eae|hey|bom dia|boa tarde|boa noite|fala|salve)\b[\s,.!;:-]*(?:pat\b[\s,.!;:-]*)?(?=\S)/;

function parse(raw: string, ctx: NluContext): ParsedIntent {
  const normalized = normalizeText(raw);
  const { today } = ctx;
  const folded = fold(raw);
  const tc = correctTypos(expandSlang(folded), knownWords(ctx));
  // Cumprimento no início ("oi pat, quanto gastei?") não deve virar entidade (ex.: "oi" é palavra-chave de operadora).
  const greeting = LEADING_GREETING.exec(folded);
  const t = greeting ? maskSpans(folded, [{ start: 0, end: greeting[0].length }]) : folded;

  // 1) Parcelas, datas e valores (cada um mascarado antes do próximo para não se confundirem).
  const inst = findInstallments(t);
  const instSpans = inst ? [inst] : [];
  const t1 = maskSpans(t, instSpans);
  const dates = findDates(t1, today);
  const t2 = maskSpans(t1, dates);
  const amounts = findAmounts(t2);
  const amount = pickAmount(amounts);
  // Só o valor principal é mascarado: números soltos podem ser entidades ("99" = app de transporte).
  const t3 = maskSpans(t2, amount ? [amount] : []);

  // 2) Contas citadas ("no cartão nubank", "da corrente para a poupança").
  const mentions = findAccountMentions(t3, ctx.accounts);
  const t4 = maskSpans(
    t3,
    mentions.map((m) => m.span),
  );
  const periodInT = findPeriod(t2, today);
  const descMasks: Span[] = [...instSpans, ...dates, ...amounts, ...mentions.map((m) => m.span)];
  if (periodInT) descMasks.push(periodInT);
  const desc = buildDescription(raw, t, descMasks);

  const expenseHit = scoreCategories(t4, ctx.categories, 'despesa')[0];
  const incomeHit = scoreCategories(t4, ctx.categories, 'receita')[0];
  const goalHit = ctx.goals.length ? matchGoal(t3, ctx.goals) : null;
  const periodMatch = findPeriod(tc, today);
  const interrogative = INTERROGATIVE.test(tc.trim());

  const { intent, confidence } = classify({
    tc,
    hasAmount: amount !== null,
    question: raw.includes('?') || interrogative,
    interrogative,
    hasDestinationAccount: mentions.some((m) => m.role === 'destino' && m.account),
    hasAnyAccount: mentions.some((m) => m.account),
    hasGoal: Boolean(goalHit && goalHit.confidence >= 0.75),
    hasPeriod: periodMatch !== null,
    contentWords: desc.tokens.length,
    incomeLikely: Boolean(incomeHit && (!expenseHit || incomeHit.score > expenseHit.score)),
  });

  const e: ParsedEntities = {};
  const mentionAccount = bestMentionAccount(mentions);
  const firstDate = dates[0]?.date;
  let finalConfidence = confidence;

  const periodOrDate = (): Period | undefined => {
    if (periodMatch) return periodMatch.period;
    if (firstDate) return { start: firstDate, end: firstDate, label: formatDateBR(firstDate) };
    return undefined;
  };

  switch (intent) {
    case 'registrar_despesa':
    case 'registrar_receita': {
      const kind = intent === 'registrar_despesa' ? 'despesa' : 'receita';
      e.amount = amount?.amount;
      e.date = firstDate;
      if (kind === 'despesa' && inst && inst.count >= 2) e.installments = inst.count;
      e.accountId =
        mentionAccount?.accountId ??
        rankAccounts(t4, ctx.accounts).find((r) => r.confidence >= 0.85)?.accountId;
      let description = desc.text;
      if (!description) {
        const verb = words(t).find((w) => w in VERB_NOUN);
        if (verb) description = VERB_NOUN[verb];
      }
      const hit = kind === 'despesa' ? expenseHit : incomeHit;
      const history =
        description && ctx.transactions?.length
          ? suggestCategory(description, kind, ctx.categories, ctx.transactions)
          : null;
      if (history && history.reason === 'historico' && history.confidence >= 0.75) {
        e.categoryId = history.categoryId;
        e.categoryConfidence = history.confidence;
      } else if (hit) {
        Object.assign(e, hitToEntity(hit));
      } else if (history) {
        e.categoryId = history.categoryId;
        e.categoryConfidence = history.confidence;
      }
      if (!description && e.categoryId) description = ctx.categories.find((c) => c.id === e.categoryId)?.name;
      e.description = description;
      break;
    }
    case 'registrar_transferencia': {
      e.amount = amount?.amount;
      e.date = firstDate;
      const resolved = mentions.filter((m) => m.account);
      let origin = resolved.find((m) => m.role === 'origem')?.account?.accountId;
      let dest = resolved.find((m) => m.role === 'destino' && m.account?.accountId !== origin)?.account
        ?.accountId;
      const isInvoice = /\bfatura\b/.test(t);
      const isWithdrawal = /\b(saquei|sacar|saque)\b/.test(t);
      const isRedeem = /\b(resgatei|resgatar|resgate)\b/.test(t);
      if (isInvoice) {
        const card =
          resolved.find(
            (m) => ctx.accounts.find((a) => a.id === m.account?.accountId)?.type === 'cartao_credito',
          )?.account?.accountId ?? ctx.accounts.find((a) => !a.archived && a.type === 'cartao_credito')?.id;
        dest = card;
        origin = resolved.map((m) => m.account?.accountId).find((id) => id && id !== card);
      } else if (isWithdrawal) {
        dest ??= ctx.accounts.find((a) => !a.archived && a.type === 'carteira')?.id;
        origin ??= resolved.map((m) => m.account?.accountId).find((id) => id && id !== dest);
      } else if (isRedeem && !dest) {
        origin ??= resolved[0]?.account?.accountId;
        dest = defaultSource(ctx.accounts, origin);
      }
      const neutrals = resolved
        .filter((m) => m.role === 'neutro')
        .map((m) => m.account?.accountId)
        .filter((id): id is string => Boolean(id) && id !== origin && id !== dest);
      if (!origin && !dest && neutrals.length >= 2) {
        origin = neutrals[0];
        dest = neutrals[1];
      } else if (!dest && neutrals.length) dest = neutrals[0];
      if (dest && !origin) origin = defaultSource(ctx.accounts, dest);
      e.accountId = origin;
      e.toAccountId = dest !== origin ? dest : undefined;
      break;
    }
    case 'definir_orcamento':
      e.amount = amount?.amount;
      Object.assign(e, hitToEntity(expenseHit));
      e.budgetMonth = budgetMonth(tc, today);
      break;
    case 'criar_meta': {
      e.amount = amount?.amount;
      const months = goalMonths(t);
      const masked = maskSpans(
        t,
        [...amounts, ...dates, ...instSpans, ...(months ? [months.span] : [])],
        '#',
      );
      e.name = goalName(raw, masked);
      e.targetDate = goalTargetDate(t, today);
      if (months) {
        e.months = months.months;
        e.targetDate ??= addMonths(today, months.months);
      }
      break;
    }
    case 'aportar_meta':
      e.amount = amount?.amount;
      e.date = firstDate;
      e.goalId = goalHit?.goalId;
      e.accountId = mentionAccount?.accountId;
      break;
    case 'status_metas':
      if (goalHit && goalHit.confidence >= 0.75) e.goalId = goalHit.goalId;
      break;
    case 'posso_gastar': {
      e.amount = amount?.amount;
      if (inst && inst.count >= 1) e.installments = inst.count;
      e.description = desc.text;
      Object.assign(e, hitToEntity(expenseHit));
      e.accountId = mentionAccount?.accountId;
      break;
    }
    case 'consultar_saldo':
      e.accountId =
        mentionAccount?.accountId ??
        rankAccounts(t3, ctx.accounts).find((r) => r.confidence >= 0.7)?.accountId;
      break;
    case 'status_dividas':
    case 'plano_dividas':
      e.amount = amount?.amount;
      break;
    default:
      break;
  }

  if (QUERY_PERIOD_INTENTS.has(intent)) {
    e.period = periodOrDate();
    if (intent === 'consultar_gastos' || intent === 'status_orcamento' || intent === 'comparar_meses') {
      Object.assign(e, hitToEntity(expenseHit));
    }
    if (intent === 'consultar_receitas') Object.assign(e, hitToEntity(incomeHit));
    if (intent === 'consultar_gastos' || intent === 'consultar_receitas')
      e.accountId = mentionAccount?.accountId;
  }

  if (intent === 'desconhecido') {
    // Continuação curta ("e no mês passado?", "e com lazer?"): sem intenção própria, mas com entidades
    // que o respondedor completa usando o estado da conversa (ConversationState).
    const best = expenseHit && (!incomeHit || expenseHit.score >= incomeHit.score) ? expenseHit : incomeHit;
    Object.assign(e, hitToEntity(best));
    e.accountId = mentionAccount?.accountId;
    if (goalHit && goalHit.confidence >= 0.75) e.goalId = goalHit.goalId;
    e.amount = amount?.amount;
    e.date = firstDate;
    const hasEntity = Boolean(e.period || e.categoryId || e.accountId || e.goalId || e.amount);
    finalConfidence = hasEntity ? (/^\s*e\b/.test(tc) ? 0.3 : 0.2) : Math.min(confidence, 0.05);
  }

  return { intent, confidence: finalConfidence, entities: clean(e), raw, normalized };
}

/**
 * Interpreta uma mensagem em pt-BR: intenção + entidades. Nunca lança exceção. 100% local e determinística
 * (datas relativas usam `ctx.today`).
 *
 * Desambiguação: valor + verbo no passado (gastei, paguei, comprei, recebi, caiu...) => registrar;
 * palavras interrogativas (quanto, qual, como, onde, '?') => consultar; frase curta "uber 23,50" => despesa
 * (ou receita, se a descrição casar melhor com uma categoria de receita: "salário 5000").
 *
 * Continuações: mensagens curtas sem intenção própria — "e no mês passado?", "e com lazer?" — retornam
 * intent 'desconhecido' com confidence <= 0,3, MAS com as entidades preenchidas (period, categoryId, accountId,
 * goalId). O respondedor deve combiná-las com o `ConversationState` (ex.: repetir `lastIntent` com o novo período).
 * Texto sem sentido retorna 'desconhecido' com confiança <= 0,05 e sem entidades.
 *
 * Contas em transferências: "da X" = origem, "para/pra/na X" = destino; sem origem citada, usa-se a primeira
 * conta corrente (ou a primeira conta que não é cartão). "Saquei" => destino carteira; "paguei a fatura" =>
 * destino cartão de crédito. Em metas, um prazo em meses ("em 8 meses") também preenche targetDate = hoje + N meses.
 */
export function parseMessage(text: string, ctx: NluContext): ParsedIntent {
  const raw = typeof text === 'string' ? text : '';
  try {
    return parse(raw, ctx);
  } catch {
    return { intent: 'desconhecido', confidence: 0, entities: {}, raw, normalized: normalizeText(raw) };
  }
}
