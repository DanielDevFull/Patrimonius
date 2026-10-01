import { addMonthsToKey, lastMonths, monthKey } from '@/domain/dates';
import { formatBRL, splitCents } from '@/domain/money';
import type { Cents, FinanceData, ISODate } from '@/domain/types';
import { cashflowForecast } from './forecast';
import { emergencyFund } from './health';
import { isFlow } from './internal/common';
import { averageMonthlyExpense, averageMonthlyIncome } from './summary';
import type { AffordabilityResult, AffordabilityVerdict, GrowthPoint } from './types';

/** Limite padrão de meses para monthsToReach (100 anos). */
const DEFAULT_MAX_MONTHS = 1200;
/** Meses completos usados para medir a sobra mensal média. */
const SURPLUS_HISTORY_MONTHS = 3;
/** Fração da folga projetada do mês acima da qual a compra pede cautela. */
const CAUTION_SHARE_OF_SLACK = 0.5;
const MAX_REASONS = 4;

/** Converte taxa anual (%) em mensal equivalente (%): ((1 + a/100)^(1/12) - 1) * 100. Taxas <= -100% => -100. */
export function annualToMonthlyRate(annualPct: number): number {
  const base = 1 + annualPct / 100;
  if (base <= 0) return -100;
  return (Math.pow(base, 1 / 12) - 1) * 100;
}

/** Converte taxa mensal (%) em anual equivalente (%): ((1 + m/100)^12 - 1) * 100. Taxas <= -100% => -100. */
export function monthlyToAnnualRate(monthlyPct: number): number {
  const base = 1 + monthlyPct / 100;
  if (base <= 0) return -100;
  return (Math.pow(base, 12) - 1) * 100;
}

/**
 * Juros compostos com aportes mensais ao FIM de cada mês. Retorna months + 1 pontos (month 0 = inicial).
 * total(m) = round(total(m-1) * (1 + r)) + aporte; contributed = initial + aportes; interest = total - contributed.
 * `months` não inteiro é truncado; months <= 0 devolve só o ponto inicial.
 */
export function compoundGrowth(
  initial: Cents,
  monthlyContribution: Cents,
  monthlyRatePct: number,
  months: number,
): GrowthPoint[] {
  const r = monthlyRatePct / 100;
  const count = Number.isFinite(months) ? Math.max(0, Math.floor(months)) : 0;
  const points: GrowthPoint[] = [{ month: 0, contributed: initial, interest: 0, total: initial }];
  let total = initial;
  let contributed = initial;
  for (let m = 1; m <= count; m++) {
    total = Math.round(total * (1 + r)) + monthlyContribution;
    contributed += monthlyContribution;
    points.push({ month: m, contributed, interest: total - contributed, total });
  }
  return points;
}

/**
 * Meses necessários para atingir `target` (0 se já atingido; null se impossível em maxMonths, padrão 1200).
 * Usa a mesma regra de compoundGrowth (juros arredondados ao centavo, aporte no fim do mês).
 */
export function monthsToReach(
  target: Cents,
  initial: Cents,
  monthlyContribution: Cents,
  monthlyRatePct: number,
  maxMonths: number = DEFAULT_MAX_MONTHS,
): number | null {
  if (initial >= target) return 0;
  const r = monthlyRatePct / 100;
  // Sem aporte positivo, o saldo só cresce se houver juros positivos sobre um saldo positivo: alvo inalcançável.
  if (target > 0 && monthlyContribution <= 0 && (r <= 0 || initial <= 0)) return null;
  const limit = Number.isFinite(maxMonths) ? Math.max(0, Math.floor(maxMonths)) : DEFAULT_MAX_MONTHS;
  let total = initial;
  for (let m = 1; m <= limit; m++) {
    total = Math.round(total * (1 + r)) + monthlyContribution;
    if (total >= target) return m;
  }
  return null;
}

/** true se algum dos 3 meses completos anteriores ao mês de today tem receita ou despesa registrada. */
function hasRecentHistory(data: FinanceData, today: ISODate): boolean {
  const window = new Set(lastMonths(addMonthsToKey(monthKey(today), -1), SURPLUS_HISTORY_MONTHS));
  return data.transactions.some((tx) => isFlow(tx) && window.has(monthKey(tx.date)));
}

/**
 * "Posso gastar X?" — avalia o impacto de uma compra (à vista ou parcelada) usando a previsão de caixa do mês,
 * a sobra mensal média, os orçamentos e a reserva de emergência. Veredito:
 * - 'nao' se o saldo projetado no fim do mês ficar negativo após a 1ª parcela, ou a parcela > sobra média mensal (quando há histórico);
 * - 'com_cautela' se ficar positivo mas consumir > 50% da folga projetada, ou a reserva de emergência estiver abaixo da meta;
 * - 'sim' caso contrário. `reasons` explica em pt-BR (2-4 frases).
 *
 * Detalhes de implementação:
 * - As parcelas seguem splitCents (centavos extras nas primeiras), como o repositório cria compras parceladas;
 *   valores negativos contam como 0 e `installments` é truncado para um inteiro >= 1.
 * - A comparação com a sobra média só vale para compras parceladas (installments > 1): à vista, o que importa é o
 *   saldo do mês. Sobra média = renda média - despesa média dos 3 meses completos (meses vazios ignorados).
 * - "Reserva abaixo da meta" = gap da reserva de emergência > 0 (sem dados de gastos, não pesa).
 */
export function affordability(
  data: FinanceData,
  today: ISODate,
  amount: Cents,
  installments: number = 1,
): AffordabilityResult {
  const total = Math.max(0, Math.round(amount));
  const n = Number.isFinite(installments) ? Math.max(1, Math.floor(installments)) : 1;
  const firstPayment = splitCents(total, n)[0];
  const parcelado = n > 1;

  const forecast = cashflowForecast(data, today);
  const projectedEndBalance = forecast.projectedEndBalance;
  const balanceAfter = projectedEndBalance - firstPayment;

  const month = monthKey(today);
  const hasHistory = hasRecentHistory(data, today);
  const averageMonthlySurplus =
    averageMonthlyIncome(data.transactions, month, SURPLUS_HISTORY_MONTHS) -
    averageMonthlyExpense(data.transactions, month, SURPLUS_HISTORY_MONTHS);
  const fund = emergencyFund(data, today);

  const goesNegative = balanceAfter < 0;
  const exceedsSurplus = parcelado && hasHistory && firstPayment > averageMonthlySurplus;
  const slackShare = projectedEndBalance > 0 ? firstPayment / projectedEndBalance : null;
  const eatsSlack = slackShare !== null && slackShare > CAUTION_SHARE_OF_SLACK;
  const reserveBelowTarget = fund.gap > 0;

  let verdict: AffordabilityVerdict;
  if (goesNegative || exceedsSurplus) verdict = 'nao';
  else if (eatsSlack || reserveBelowTarget) verdict = 'com_cautela';
  else verdict = 'sim';

  const reasons: string[] = [];
  const paymentLabel = parcelado
    ? `a 1ª parcela (${formatBRL(firstPayment)} de ${n}x)`
    : `a compra de ${formatBRL(firstPayment)}`;

  if (goesNegative) {
    reasons.push(
      `Seu saldo previsto para o fim do mês é ${formatBRL(projectedEndBalance)}; com ${paymentLabel}, ficaria negativo em ${formatBRL(-balanceAfter)}.`,
    );
  } else {
    reasons.push(
      `Seu saldo previsto para o fim do mês é ${formatBRL(projectedEndBalance)}; depois ${parcelado ? 'da 1ª parcela' : 'da compra'}, ficaria em ${formatBRL(balanceAfter)}.`,
    );
  }

  if (!hasHistory) {
    reasons.push('Ainda não há meses completos registrados para avaliar sua sobra mensal média.');
  } else if (averageMonthlySurplus <= 0) {
    reasons.push(
      `Nos últimos meses suas despesas ${averageMonthlySurplus === 0 ? 'igualaram' : 'superaram'} suas receitas${averageMonthlySurplus < 0 ? ` em ${formatBRL(-averageMonthlySurplus)} por mês, em média` : ''}.`,
    );
  } else if (parcelado) {
    reasons.push(
      exceedsSurplus
        ? `A parcela de ${formatBRL(firstPayment)} é maior que sua sobra média de ${formatBRL(averageMonthlySurplus)} por mês.`
        : `A parcela de ${formatBRL(firstPayment)} cabe na sua sobra média de ${formatBRL(averageMonthlySurplus)} por mês.`,
    );
  } else {
    reasons.push(`Sua sobra média nos últimos meses é de ${formatBRL(averageMonthlySurplus)} por mês.`);
  }

  if (!goesNegative && eatsSlack && slackShare !== null)
    reasons.push(`Isso consome ${Math.round(slackShare * 100)}% da folga prevista para o mês.`);

  if (reserveBelowTarget)
    reasons.push(`Sua reserva de emergência está abaixo da meta: faltam ${formatBRL(fund.gap)}.`);
  else if (fund.level === 'completa' && verdict === 'sim')
    reasons.push('Sua reserva de emergência está completa.');

  return {
    amount: total,
    installments: n,
    firstPayment,
    verdict,
    projectedEndBalance,
    balanceAfter,
    averageMonthlySurplus,
    reasons: reasons.slice(0, MAX_REASONS),
  };
}
