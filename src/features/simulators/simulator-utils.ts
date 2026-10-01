/**
 * Cálculos puros dos simuladores (sobre as funções de @/analytics).
 */
import {
  annualToMonthlyRate,
  compoundGrowth,
  monthlyToAnnualRate,
  monthsToReach,
  type AffordabilityVerdict,
  type GrowthPoint,
} from '@/analytics';
import type { Cents } from '@/domain/types';

export type SimulatorTab = 'juros' | 'tempo' | 'comprar' | 'reserva' | 'quitar';

export const SIMULATOR_TABS: { value: SimulatorTab; label: string }[] = [
  { value: 'juros', label: 'Juros compostos' },
  { value: 'tempo', label: 'Quanto tempo até…' },
  { value: 'comprar', label: 'Posso comprar?' },
  { value: 'reserva', label: 'Reserva de emergência' },
  { value: 'quitar', label: 'Quitar ou investir?' },
];

export function parseTab(value: string | null): SimulatorTab {
  return SIMULATOR_TABS.find((t) => t.value === value)?.value ?? 'juros';
}

/** Prazo máximo aceito nos simuladores (anos). */
export const MAX_YEARS = 100;

/* ------------------------------------------------------------------ */
/* Juros compostos                                                     */
/* ------------------------------------------------------------------ */

export interface CompoundResult {
  points: GrowthPoint[];
  /** Taxa mensal equivalente (% a.m.). */
  monthlyRate: number;
  final: Cents;
  contributed: Cents;
  interest: Cents;
}

/** Juros compostos com taxa ANUAL convertida para a mensal equivalente e prazo em anos inteiros. */
export function compoundSimulation(
  initial: Cents,
  monthlyContribution: Cents,
  annualRatePct: number,
  years: number,
): CompoundResult {
  const monthlyRate = annualToMonthlyRate(annualRatePct);
  const points = compoundGrowth(initial, monthlyContribution, monthlyRate, Math.round(years * 12));
  const last = points[points.length - 1];
  return { points, monthlyRate, final: last.total, contributed: last.contributed, interest: last.interest };
}

/** Pontos de fim de cada ano (mais o último, se o prazo não fechar o ano). */
export function yearlyPoints(points: GrowthPoint[]): GrowthPoint[] {
  return points.filter((p, i) => p.month % 12 === 0 || i === points.length - 1);
}

/** Marcas do eixo X (em meses) para um prazo: anuais até 10 anos, a cada 5 até 30, depois a cada 10. */
export function yearTicks(totalMonths: number): number[] {
  const years = Math.floor(totalMonths / 12);
  if (years < 1) return Array.from({ length: totalMonths + 1 }, (_, i) => i);
  const step = years <= 10 ? 1 : years <= 30 ? 5 : 10;
  const ticks: number[] = [];
  for (let y = 0; y <= years; y += step) ticks.push(y * 12);
  return ticks;
}

/* ------------------------------------------------------------------ */
/* Quanto tempo até…                                                   */
/* ------------------------------------------------------------------ */

export interface GoalTimeResult {
  /** null = não chega em 100 anos. */
  months: number | null;
  /** Total aportado até lá (inicial + aportes). */
  contributed: Cents | null;
  /** Saldo no mês em que atinge o objetivo. */
  finalBalance: Cents | null;
}

export function goalTime(
  target: Cents,
  initial: Cents,
  monthly: Cents,
  annualRatePct: number,
): GoalTimeResult {
  const monthlyRate = annualToMonthlyRate(annualRatePct);
  const months = monthsToReach(target, initial, monthly, monthlyRate);
  if (months === null) return { months: null, contributed: null, finalBalance: null };
  const last = compoundGrowth(initial, monthly, monthlyRate, months)[months];
  return { months, contributed: last.contributed, finalBalance: last.total };
}

/* ------------------------------------------------------------------ */
/* Quitar ou investir                                                  */
/* ------------------------------------------------------------------ */

export interface PayOrInvestResult {
  debtMonthly: number;
  debtAnnual: number;
  /** Rendimento líquido de imposto (% a.a.). */
  investNetAnnual: number;
  investNetMonthly: number;
  winner: 'quitar' | 'investir' | 'empate';
  /** Juros evitados em 12 meses ao quitar `amount` da dívida. */
  savedIn12: Cents;
  /** Rendimento líquido de `amount` em 12 meses. */
  earnedIn12: Cents;
}

/** Diferença mínima de taxa (% a.m.) para não considerar empate. */
const RATE_TOLERANCE = 0.005;

/**
 * Compara a taxa da dívida (% a.m.) com o rendimento LÍQUIDO do investimento (% a.a. bruto, imposto em % do rendimento).
 * Simplificação: imposto aplicado sobre a taxa (alíquota fixa), sem come-cotas nem IOF.
 */
export function payOrInvest(
  debtMonthlyPct: number,
  investAnnualPct: number,
  taxPct: number,
  amount: Cents,
): PayOrInvestResult {
  const tax = Math.min(100, Math.max(0, taxPct));
  const investNetAnnual = investAnnualPct * (1 - tax / 100);
  const investNetMonthly = annualToMonthlyRate(investNetAnnual);
  const debtAnnual = monthlyToAnnualRate(debtMonthlyPct);
  const base = Math.max(0, amount);
  const savedIn12 = compoundGrowth(base, 0, debtMonthlyPct, 12)[12].total - base;
  const earnedIn12 = compoundGrowth(base, 0, investNetMonthly, 12)[12].total - base;
  const delta = debtMonthlyPct - investNetMonthly;
  const winner = Math.abs(delta) < RATE_TOLERANCE ? 'empate' : delta > 0 ? 'quitar' : 'investir';
  return {
    debtMonthly: debtMonthlyPct,
    debtAnnual,
    investNetAnnual,
    investNetMonthly,
    winner,
    savedIn12,
    earnedIn12,
  };
}

/* ------------------------------------------------------------------ */
/* Reserva de emergência                                               */
/* ------------------------------------------------------------------ */

export interface ReservePlan {
  target: Cents;
  gap: Cents;
  /** reserve / essential (null sem custo essencial). */
  monthsCovered: number | null;
  /** Meses até completar com o aporte informado (0 = já completa; null = não completa em 100 anos). */
  monthsToComplete: number | null;
}

export function reservePlan(
  reserve: Cents,
  essential: Cents,
  targetMonths: number,
  monthly: Cents,
  annualYieldPct: number,
): ReservePlan {
  const target = Math.round(Math.max(0, essential) * Math.max(0, targetMonths));
  const gap = Math.max(0, target - reserve);
  return {
    target,
    gap,
    monthsCovered: essential > 0 ? reserve / essential : null,
    monthsToComplete: monthsToReach(target, reserve, monthly, annualToMonthlyRate(annualYieldPct)),
  };
}

/** Aporte mensal (arredondado para cima em R$ 10) que completa a reserva em `months` meses, sem rendimento. */
export function monthlyToCompleteIn(gap: Cents, months: number): Cents {
  if (gap <= 0 || months <= 0) return 0;
  return Math.ceil(gap / months / 1000) * 1000;
}

/* ------------------------------------------------------------------ */
/* Posso comprar?                                                      */
/* ------------------------------------------------------------------ */

export const VERDICT_META: Record<
  AffordabilityVerdict,
  { emoji: string; title: string; tone: 'positive' | 'warning' | 'negative' }
> = {
  sim: { emoji: '✅', title: 'Pode comprar', tone: 'positive' },
  com_cautela: { emoji: '⚠️', title: 'Com cautela', tone: 'warning' },
  nao: { emoji: '⛔', title: 'Melhor não agora', tone: 'negative' },
};
