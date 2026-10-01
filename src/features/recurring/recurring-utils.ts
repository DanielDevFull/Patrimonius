/**
 * Regras puras da tela de recorrências: equivalente mensal, próxima data, edição de agenda e validação.
 */
import { nextOccurrence } from '@/analytics/recurring';
import { isISODate, isPlausibleDate, monthKey, parseISO, startOfMonth } from '@/domain/dates';
import type { Cents, Frequency, ID, ISODate, RecurringRule, Transaction } from '@/domain/types';

/** Quantas ocorrências por mês, em média, cada frequência tem. */
export const MONTHLY_FACTOR: Record<Frequency, number> = {
  semanal: 52 / 12,
  quinzenal: 2, // duas vezes por mês (ver nextOccurrence)
  mensal: 1,
  bimestral: 1 / 2,
  trimestral: 1 / 3,
  semestral: 1 / 6,
  anual: 1 / 12,
};

/** Valor mensal equivalente (ex.: R$ 120/ano => R$ 10/mês), arredondado ao centavo. */
export function monthlyEquivalent(amount: Cents, frequency: Frequency): Cents {
  return Math.round(amount * MONTHLY_FACTOR[frequency]);
}

/** true se a regra já passou da data final (não terá novas ocorrências). */
export function isEnded(rule: RecurringRule): boolean {
  return rule.endDate !== null && rule.nextDate > rule.endDate;
}

export interface RecurringTotals {
  /** Receitas recorrentes (equivalente mensal) das regras ativas e não encerradas. */
  income: Cents;
  /** Despesas recorrentes = "custo fixo mensal". */
  expense: Cents;
  net: Cents;
  activeCount: number;
  pausedCount: number;
}

export function recurringTotals(rules: RecurringRule[]): RecurringTotals {
  let income = 0;
  let expense = 0;
  let activeCount = 0;
  let pausedCount = 0;
  for (const rule of rules) {
    if (!rule.active) {
      pausedCount += 1;
      continue;
    }
    if (isEnded(rule)) continue;
    activeCount += 1;
    const monthly = monthlyEquivalent(rule.amount, rule.frequency);
    if (rule.type === 'receita') income += monthly;
    else expense += monthly;
  }
  return { income, expense, net: income - expense, activeCount, pausedCount };
}

export interface NextDue {
  date: ISODate;
  /** Lançamento pendente já gerado (true) ou ocorrência ainda não gerada (false). */
  generated: boolean;
  overdue: boolean;
}

/**
 * Próximo compromisso da regra: o lançamento pendente mais antigo gerado por ela (inclusive atrasado)
 * ou, se não houver, a próxima ocorrência ainda não gerada (null se a regra terminou).
 */
export function ruleNextDue(
  rule: RecurringRule,
  pendingByRule: Map<ID, Transaction[]>,
  today: ISODate,
): NextDue | null {
  const pending = pendingByRule.get(rule.id);
  if (pending && pending.length) {
    let first = pending[0];
    for (const t of pending) if (t.date < first.date) first = t;
    return { date: first.date, generated: true, overdue: first.date < today };
  }
  if (isEnded(rule) || !isISODate(rule.nextDate)) return null;
  return { date: rule.nextDate, generated: false, overdue: false };
}

/** Lançamentos pendentes agrupados pela regra que os gerou. */
export function pendingByRule(transactions: Transaction[]): Map<ID, Transaction[]> {
  const map = new Map<ID, Transaction[]>();
  for (const t of transactions) {
    if (t.recurringId === null || t.status !== 'pendente') continue;
    const list = map.get(t.recurringId);
    if (list) list.push(t);
    else map.set(t.recurringId, [t]);
  }
  return map;
}

const SAFETY = 2000;

/** Frequências com no máximo uma ocorrência por mês (comparadas por mês ao reagendar). */
function isMonthlyOrLonger(frequency: Frequency): boolean {
  return frequency !== 'semanal' && frequency !== 'quinzenal';
}

/**
 * Próxima data a materializar depois de uma mudança de agenda (início/frequência):
 * a primeira ocorrência da nova agenda posterior ao último lançamento já gerado (ou o próprio início, se nada foi gerado).
 * Em frequências mensais ou maiores a comparação é por MÊS: se já existe lançamento no mês (ex.: a conta de outubro
 * já paga no dia 10 e o vencimento mudou para o dia 15), a nova agenda começa no período seguinte, sem repetir o mês.
 */
export function recomputeNextDate(
  startDate: ISODate,
  frequency: Frequency,
  lastGenerated: ISODate | null,
): ISODate {
  if (lastGenerated === null) return startDate;
  const lastMonth = monthKey(lastGenerated);
  const covered = isMonthlyOrLonger(frequency)
    ? (date: ISODate) => monthKey(date) <= lastMonth
    : (date: ISODate) => date <= lastGenerated;
  const anchor = parseISO(startDate).day;
  let date = startDate;
  for (let i = 0; i < SAFETY && covered(date); i++) date = nextOccurrence(date, frequency, anchor);
  return date;
}

/**
 * nextDate ao reagendar uma regra que já gerou lançamentos: recomputeNextDate a partir do último lançamento que
 * sobrou (os pendentes do mês corrente em diante são removidos antes) e sem gerar ocorrências de meses passados.
 */
export function rescheduleNextDate(
  startDate: ISODate,
  frequency: Frequency,
  lastRemaining: ISODate | null,
  today: ISODate,
): ISODate {
  const next = recomputeNextDate(startDate, frequency, lastRemaining);
  return skipToCurrentMonth(next, frequency, parseISO(startDate).day, today);
}

/**
 * Avança `date` pela frequência até chegar ao mês corrente (ocorrências de meses anteriores são puladas).
 * `anchorDay` é o dia preferido para frequências mensais.
 */
export function skipToCurrentMonth(
  date: ISODate,
  frequency: Frequency,
  anchorDay: number,
  today: ISODate,
): ISODate {
  const monthStart = startOfMonth(monthKey(today));
  let next = date;
  for (let i = 0; i < SAFETY && next < monthStart; i++) next = nextOccurrence(next, frequency, anchorDay);
  return next;
}

/**
 * Ocorrências de uma regra NOVA anteriores ao mês corrente: de `startDate` até o fim do mês passado, respeitando
 * `endDate`. Ao cadastrar uma recorrência que começou no passado (ex.: aluguel desde janeiro), gerá-las cria
 * pendentes vencidos que em geral já foram pagos ou lançados — por isso o formulário só as gera se o usuário pedir.
 */
export function pastOccurrences(
  startDate: string,
  frequency: Frequency,
  endDate: ISODate | null,
  today: ISODate,
): ISODate[] {
  if (!isISODate(startDate)) return [];
  const monthStart = startOfMonth(monthKey(today));
  const anchor = parseISO(startDate).day;
  const dates: ISODate[] = [];
  let date = startDate;
  while (dates.length < SAFETY && date < monthStart && (endDate === null || date <= endDate)) {
    dates.push(date);
    date = nextOccurrence(date, frequency, anchor);
  }
  return dates;
}

/**
 * Ao reativar uma regra pausada, pula as ocorrências de meses anteriores ao mês corrente
 * (evita gerar de uma vez todas as pendências do período em que ficou pausada).
 */
export function resumeNextDate(rule: RecurringRule, today: ISODate): ISODate {
  if (!isISODate(rule.nextDate)) return rule.startDate;
  const anchor = parseISO(isISODate(rule.startDate) ? rule.startDate : rule.nextDate).day;
  return skipToCurrentMonth(rule.nextDate, rule.frequency, anchor, today);
}

export type RecurringFormField = 'amount' | 'categoryId' | 'accountId' | 'startDate' | 'endDate';

export interface RecurringFormCheck {
  amount: Cents | null;
  categoryId: ID | null;
  accountId: ID | null;
  startDate: string;
  endDate: string;
  /** Hoje: as datas precisam ser plausíveis (ano de 1900 até o ano corrente + 10). */
  today: ISODate;
}

export function validateRecurringForm(v: RecurringFormCheck): Partial<Record<RecurringFormField, string>> {
  const errors: Partial<Record<RecurringFormField, string>> = {};
  if (v.amount === null || !Number.isInteger(v.amount) || v.amount <= 0)
    errors.amount = 'Informe um valor maior que zero.';
  if (!v.categoryId) errors.categoryId = 'Escolha uma categoria.';
  if (!v.accountId) errors.accountId = 'Escolha uma conta.';
  if (!isISODate(v.startDate)) errors.startDate = 'Informe a data de início.';
  else if (!isPlausibleDate(v.startDate, v.today)) errors.startDate = 'Confira o ano da data.';
  if (v.endDate) {
    if (!isISODate(v.endDate)) errors.endDate = 'Informe uma data válida ou deixe em branco.';
    else if (isISODate(v.startDate) && v.endDate < v.startDate)
      errors.endDate = 'O término deve ser depois do início.';
    else if (!isPlausibleDate(v.endDate, v.today)) errors.endDate = 'Confira o ano da data.';
  }
  return errors;
}
