import type { Frequency, ID, ISODate, RecurringRule, Timestamp, Transaction } from '@/domain/types';
import type { FinanceData } from '@/domain/types';
import type { RecurringCandidate, UpcomingItem } from './types';

/**
 * Próxima data após `date` segundo a frequência.
 * semanal: +7 dias; quinzenal: +14 dias; mensal/bimestral/trimestral/semestral/anual: +1/2/3/6/12 meses
 * preservando `anchorDay` (dia preferido; limitado ao último dia do mês). Se anchorDay omitido usa o dia de `date`.
 */
export function nextOccurrence(date: ISODate, frequency: Frequency, anchorDay?: number): ISODate {
  void date;
  void frequency;
  void anchorDay;
  throw new Error('não implementado');
}

/**
 * Datas de ocorrência de uma regra no intervalo [from, to] (inclusive), começando em rule.nextDate,
 * respeitando rule.endDate. O dia âncora para frequências mensais é o dia de rule.startDate.
 * Limite de segurança: no máximo 500 datas.
 */
export function occurrencesBetween(rule: RecurringRule, from: ISODate, to: ISODate): ISODate[] {
  void rule;
  void from;
  void to;
  throw new Error('não implementado');
}

/**
 * Materializa lançamentos 'pendente' das regras ativas com autoGenerate=true para todas as ocorrências
 * com date <= until (a partir de rule.nextDate). Não duplica: se já existir lançamento com o mesmo
 * recurringId e a mesma date, apenas avança a regra. Retorna os novos lançamentos e SOMENTE as regras alteradas
 * (com nextDate avançado para a primeira ocorrência > until; se passar de endDate, nextDate fica além e active permanece).
 * `makeId` gera ids; `now` é usado em createdAt/updatedAt.
 */
export function materializeRecurring(
  rules: RecurringRule[],
  transactions: Transaction[],
  until: ISODate,
  now: Timestamp,
  makeId: () => ID,
): { newTransactions: Transaction[]; updatedRules: RecurringRule[] } {
  void rules;
  void transactions;
  void until;
  void now;
  void makeId;
  throw new Error('não implementado');
}

/**
 * Próximos compromissos: lançamentos pendentes com date <= today + days (inclusive os vencidos)
 * + ocorrências de regras ativas (ainda não materializadas, i.e. >= nextDate) entre today e today + days.
 * Ordenado por data asc.
 */
export function upcomingItems(data: FinanceData, today: ISODate, days: number): UpcomingItem[] {
  void data;
  void today;
  void days;
  throw new Error('não implementado');
}

/**
 * Detecta prováveis gastos/receitas recorrentes ainda não cadastrados como recorrência:
 * lançamentos (despesa/receita, sem recurringId, sem installment) agrupados por descrição normalizada + tipo,
 * com ocorrências em pelo menos 3 meses distintos nos últimos 6 meses até `today`, e valores dentro de ±15% da mediana.
 * Ignora grupos já cobertos por uma regra ativa com descrição normalizada igual.
 */
export function detectRecurringCandidates(data: FinanceData, today: ISODate): RecurringCandidate[] {
  void data;
  void today;
  throw new Error('não implementado');
}
