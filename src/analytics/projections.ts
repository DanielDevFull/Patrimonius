import type { Cents, FinanceData, ISODate } from '@/domain/types';
import type { AffordabilityResult, GrowthPoint } from './types';

/** Converte taxa anual (%) em mensal equivalente (%): ((1 + a/100)^(1/12) - 1) * 100. */
export function annualToMonthlyRate(annualPct: number): number {
  void annualPct;
  throw new Error('não implementado');
}

/** Converte taxa mensal (%) em anual equivalente (%). */
export function monthlyToAnnualRate(monthlyPct: number): number {
  void monthlyPct;
  throw new Error('não implementado');
}

/**
 * Juros compostos com aportes mensais ao FIM de cada mês. Retorna months + 1 pontos (month 0 = inicial).
 * total(m) = round(total(m-1) * (1 + r)) + aporte; contributed = initial + aportes; interest = total - contributed.
 */
export function compoundGrowth(
  initial: Cents,
  monthlyContribution: Cents,
  monthlyRatePct: number,
  months: number,
): GrowthPoint[] {
  void initial;
  void monthlyContribution;
  void monthlyRatePct;
  void months;
  throw new Error('não implementado');
}

/** Meses necessários para atingir `target` (0 se já atingido; null se impossível em maxMonths, padrão 1200). */
export function monthsToReach(
  target: Cents,
  initial: Cents,
  monthlyContribution: Cents,
  monthlyRatePct: number,
  maxMonths?: number,
): number | null {
  void target;
  void initial;
  void monthlyContribution;
  void monthlyRatePct;
  void maxMonths;
  throw new Error('não implementado');
}

/**
 * "Posso gastar X?" — avalia o impacto de uma compra (à vista ou parcelada) usando a previsão de caixa do mês,
 * a sobra mensal média, os orçamentos e a reserva de emergência. Veredito:
 * - 'nao' se o saldo projetado no fim do mês ficar negativo após a 1ª parcela, ou a parcela > sobra média mensal (quando há histórico);
 * - 'com_cautela' se ficar positivo mas consumir > 50% da folga projetada, ou a reserva de emergência estiver abaixo da meta;
 * - 'sim' caso contrário. `reasons` explica em pt-BR (2-4 frases).
 */
export function affordability(
  data: FinanceData,
  today: ISODate,
  amount: Cents,
  installments?: number,
): AffordabilityResult {
  void data;
  void today;
  void amount;
  void installments;
  throw new Error('não implementado');
}
