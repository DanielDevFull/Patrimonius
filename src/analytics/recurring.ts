import { addDays, addMonths, isISODate, lastMonths, monthKey, parseISO } from '@/domain/dates';
import { normalizeText } from '@/domain/text';
import type { Frequency, ID, ISODate, MonthKey, RecurringRule, Timestamp, Transaction } from '@/domain/types';
import type { FinanceData } from '@/domain/types';
import {
  compareRaw,
  compareText,
  isFlow,
  materializedKeys,
  medianCents,
  occurrenceKey,
  type FlowTransaction,
} from './internal/common';
import type { RecurringCandidate, UpcomingItem } from './types';

/** Passo de cada frequência: em dias (semanal/quinzenal) ou em meses (demais). */
const FREQUENCY_STEP: Record<Frequency, { days: number } | { months: number }> = {
  semanal: { days: 7 },
  quinzenal: { days: 14 },
  mensal: { months: 1 },
  bimestral: { months: 2 },
  trimestral: { months: 3 },
  semestral: { months: 6 },
  anual: { months: 12 },
};

/** Limite de datas devolvidas por occurrencesBetween e de ocorrências geradas por regra em cada materialização. */
const MAX_OCCURRENCES = 500;

/**
 * Próxima data após `date` segundo a frequência.
 * semanal: +7 dias; quinzenal: +14 dias; mensal/bimestral/trimestral/semestral/anual: +1/2/3/6/12 meses
 * preservando `anchorDay` (dia preferido; limitado ao último dia do mês). Se anchorDay omitido usa o dia de `date`.
 * Um anchorDay fora de 1..31 é limitado a esse intervalo.
 */
export function nextOccurrence(date: ISODate, frequency: Frequency, anchorDay?: number): ISODate {
  const step = FREQUENCY_STEP[frequency];
  if ('days' in step) return addDays(date, step.days);
  const anchor =
    anchorDay === undefined ? parseISO(date).day : Math.min(31, Math.max(1, Math.floor(anchorDay)));
  return addMonths(date, step.months, anchor);
}

/** Dia âncora da regra (dia de startDate; se startDate for inválida, o dia de nextDate). */
function anchorOf(rule: RecurringRule): number {
  return parseISO(isISODate(rule.startDate) ? rule.startDate : rule.nextDate).day;
}

/** Última data (inclusive) a considerar: min(limit, endDate). */
function lastDateOf(rule: RecurringRule, limit: ISODate): ISODate {
  return rule.endDate !== null && rule.endDate < limit ? rule.endDate : limit;
}

/**
 * Datas de ocorrência de uma regra no intervalo [from, to] (inclusive), começando em rule.nextDate,
 * respeitando rule.endDate. O dia âncora para frequências mensais é o dia de rule.startDate.
 * Limite de segurança: no máximo 500 datas. Não olha `active` (quem chama filtra).
 */
export function occurrencesBetween(rule: RecurringRule, from: ISODate, to: ISODate): ISODate[] {
  if (!isISODate(rule.nextDate)) return [];
  const last = lastDateOf(rule, to);
  const anchor = anchorOf(rule);
  const dates: ISODate[] = [];
  let date = rule.nextDate;
  while (date <= last && dates.length < MAX_OCCURRENCES) {
    if (date >= from) dates.push(date);
    date = nextOccurrence(date, rule.frequency, anchor);
  }
  return dates;
}

/**
 * Materializa lançamentos 'pendente' das regras ativas com autoGenerate=true para todas as ocorrências
 * com date <= until (a partir de rule.nextDate). Não duplica: se já existir lançamento com o mesmo
 * recurringId e a mesma date, apenas avança a regra. Retorna os novos lançamentos e SOMENTE as regras alteradas
 * (com nextDate avançado para a primeira ocorrência > until; se passar de endDate, nextDate fica além e active permanece).
 * `makeId` gera ids; `now` é usado em createdAt/updatedAt.
 *
 * Segurança: no máximo 500 ocorrências por regra em cada chamada (a regra fica com nextDate na próxima ocorrência
 * não processada e o restante é gerado na chamada seguinte). Regras com nextDate inválida ou valor <= 0 são ignoradas.
 */
export function materializeRecurring(
  rules: RecurringRule[],
  transactions: Transaction[],
  until: ISODate,
  now: Timestamp,
  makeId: () => ID,
): { newTransactions: Transaction[]; updatedRules: RecurringRule[] } {
  const existing = materializedKeys(transactions);
  const newTransactions: Transaction[] = [];
  const updatedRules: RecurringRule[] = [];
  for (const rule of rules) {
    if (!rule.active || !rule.autoGenerate) continue;
    if (!isISODate(rule.nextDate) || !(rule.amount > 0)) continue;
    const last = lastDateOf(rule, until);
    const anchor = anchorOf(rule);
    let date = rule.nextDate;
    let processed = 0;
    while (date <= last && processed < MAX_OCCURRENCES) {
      const key = occurrenceKey(rule.id, date);
      if (!existing.has(key)) {
        existing.add(key);
        newTransactions.push({
          id: makeId(),
          type: rule.type,
          amount: rule.amount,
          date,
          description: rule.description,
          categoryId: rule.categoryId,
          accountId: rule.accountId,
          toAccountId: null,
          status: 'pendente',
          notes: '',
          tags: [],
          recurringId: rule.id,
          installment: null,
          createdAt: now,
          updatedAt: now,
        });
      }
      processed += 1;
      date = nextOccurrence(date, rule.frequency, anchor);
    }
    if (date !== rule.nextDate) updatedRules.push({ ...rule, nextDate: date, updatedAt: now });
  }
  return { newTransactions, updatedRules };
}

/**
 * Próximos compromissos: lançamentos pendentes (receitas/despesas) com date <= today + days (inclusive os vencidos)
 * + ocorrências de regras ativas (ainda não materializadas, i.e. >= nextDate) entre today e today + days.
 * Ocorrências que já têm lançamento com o mesmo recurringId e data não são repetidas.
 * Ordenado por data asc (empate: despesas antes de receitas, depois descrição).
 */
export function upcomingItems(data: FinanceData, today: ISODate, days: number): UpcomingItem[] {
  const horizon = addDays(today, Math.max(0, Math.floor(days)));
  const items: UpcomingItem[] = [];
  for (const tx of data.transactions) {
    if (tx.status !== 'pendente' || !isFlow(tx) || tx.date > horizon) continue;
    items.push({
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      type: tx.type,
      source: 'pendente',
      transactionId: tx.id,
      recurringId: tx.recurringId,
      overdue: tx.date < today,
    });
  }
  const existing = materializedKeys(data.transactions);
  for (const rule of data.recurring) {
    if (!rule.active) continue;
    for (const date of occurrencesBetween(rule, today, horizon)) {
      if (existing.has(occurrenceKey(rule.id, date))) continue;
      items.push({
        date,
        description: rule.description,
        amount: rule.amount,
        type: rule.type,
        source: 'recorrencia',
        transactionId: null,
        recurringId: rule.id,
        overdue: false,
      });
    }
  }
  const typeOrder = (t: UpcomingItem['type']) => (t === 'despesa' ? 0 : 1);
  return items.sort(
    (a, b) =>
      compareRaw(a.date, b.date) ||
      typeOrder(a.type) - typeOrder(b.type) ||
      compareText(a.description, b.description) ||
      b.amount - a.amount,
  );
}

/** Tolerância de variação dos valores em torno da mediana. */
const AMOUNT_TOLERANCE = 0.15;
/** Meses distintos mínimos para considerar recorrente. */
const MIN_DISTINCT_MONTHS = 3;
/** Janela de análise (meses, incluindo o mês de today). */
const DETECTION_WINDOW_MONTHS = 6;

function candidateKey(normalizedDescription: string, type: string): string {
  return `${normalizedDescription}|${type}`;
}

/**
 * Detecta prováveis gastos/receitas recorrentes ainda não cadastrados como recorrência:
 * lançamentos (despesa/receita, sem recurringId, sem installment) agrupados por descrição normalizada + tipo,
 * com ocorrências em pelo menos 3 meses distintos nos últimos 6 meses até `today`, e valores dentro de ±15% da mediana.
 * Ignora grupos já cobertos por uma regra ativa com descrição normalizada igual.
 *
 * Detalhes:
 * - Janela = os 6 meses-calendário terminando no mês de `today`, só lançamentos com date <= today.
 * - TODOS os valores do grupo precisam estar a ±15% da mediana (gastos variáveis como mercado não entram).
 * - Como a frequência sugerida é 'mensal', grupos com 2 ou mais ocorrências por mês em média (ex.: padaria diária)
 *   são descartados.
 * - Uma regra ativa cobre o grupo quando tem o mesmo tipo e a mesma descrição normalizada.
 * - description/categoryId/accountId vêm do lançamento mais recente; amount = mediana;
 *   nextExpectedDate = lastDate + 1 mês.
 * Ordenado: despesas primeiro, depois por valor desc e chave.
 */
export function detectRecurringCandidates(data: FinanceData, today: ISODate): RecurringCandidate[] {
  const window = new Set<MonthKey>(lastMonths(monthKey(today), DETECTION_WINDOW_MONTHS));
  const groups = new Map<string, FlowTransaction[]>();
  for (const tx of data.transactions) {
    if (!isFlow(tx) || tx.recurringId !== null || tx.installment !== null) continue;
    if (tx.date > today || !window.has(monthKey(tx.date))) continue;
    const normalized = normalizeText(tx.description);
    if (!normalized) continue;
    const key = candidateKey(normalized, tx.type);
    const list = groups.get(key);
    if (list) list.push(tx);
    else groups.set(key, [tx]);
  }

  const covered = new Set<string>();
  for (const rule of data.recurring) {
    if (rule.active) covered.add(candidateKey(normalizeText(rule.description), rule.type));
  }

  const candidates: RecurringCandidate[] = [];
  for (const [key, txs] of groups) {
    if (covered.has(key)) continue;
    const distinctMonths = new Set(txs.map((t) => monthKey(t.date))).size;
    if (distinctMonths < MIN_DISTINCT_MONTHS || txs.length >= 2 * distinctMonths) continue;
    const median = medianCents(txs.map((t) => t.amount));
    if (median <= 0) continue;
    if (txs.some((t) => Math.abs(t.amount - median) > median * AMOUNT_TOLERANCE)) continue;
    let latest = txs[0];
    for (const t of txs) {
      if (t.date > latest.date || (t.date === latest.date && t.createdAt > latest.createdAt)) latest = t;
    }
    candidates.push({
      key,
      description: latest.description,
      type: latest.type,
      amount: median,
      categoryId: latest.categoryId,
      accountId: latest.accountId,
      frequency: 'mensal',
      occurrences: txs.length,
      lastDate: latest.date,
      nextExpectedDate: addMonths(latest.date, 1),
    });
  }
  const typeOrder = (t: RecurringCandidate['type']) => (t === 'despesa' ? 0 : 1);
  return candidates.sort(
    (a, b) => typeOrder(a.type) - typeOrder(b.type) || b.amount - a.amount || compareRaw(a.key, b.key),
  );
}
