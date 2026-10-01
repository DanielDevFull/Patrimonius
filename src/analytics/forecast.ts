import {
  addDays,
  addMonthsToKey,
  daysInMonthKey,
  diffDays,
  endOfMonth,
  lastMonths,
  monthKey,
} from '@/domain/dates';
import type { AccountType, Cents, FinanceData, ID, ISODate, MonthKey, Transaction } from '@/domain/types';
import { occurrencesBetween } from './recurring';
import { addTo, isFlow, materializedKeys, occurrenceKey } from './internal/common';
import { expenseTrackingStart, monthCoverage } from './summary';
import type { CashflowForecast, ForecastPoint } from './types';

/** Meses completos usados para estimar o gasto variável diário. */
const VARIABLE_HISTORY_MONTHS = 3;

type Movement = Pick<Transaction, 'type' | 'amount' | 'accountId' | 'toAccountId'>;

/**
 * Previsão de fluxo de caixa de `today` até `until` (padrão: último dia do mês de today).
 * Considera as "contas de caixa": contas NÃO arquivadas, incluídas no patrimônio (includeInNetWorth — dinheiro de
 * terceiros, como a conta da empresa, não é do usuário) e cujo tipo NÃO é 'investimento'
 * (corrente, poupança, carteira, outro e cartão de crédito — cujo saldo negativo é dinheiro a pagar).
 * - currentBalance: soma dos saldos das contas de caixa (só 'pago', date <= today).
 * - Entram como esperados: lançamentos 'pendente' com date <= until (vencidos contam como se fossem hoje)
 *   e lançamentos 'pago' com date > today e <= until; mais ocorrências de recorrências ativas ainda não materializadas
 *   (>= nextDate) entre today e until. O efeito de cada lançamento é a soma dos efeitos nas contas de caixa
 *   (transferência entre contas de caixa = 0; transferência para conta de investimento = saída).
 *   expectedIncome/expectedExpense somam os efeitos positivos/negativos (em módulo).
 * - projectedVariableSpending: média diária das despesas sem recurringId e sem installment dos últimos 3 meses completos
 *   × dias restantes após today (exclusive) até until; 0 se não houver histórico.
 * - points: saldo dia a dia (gasto variável distribuído uniformemente), começando em today.
 *
 * Detalhes de implementação:
 * - `until` anterior a `today` é tratado como `today` (um único ponto).
 * - Ocorrências de recorrência que já têm lançamento (mesmo recurringId e data) não são contadas de novo.
 * - Média diária do gasto variável = total desses gastos ÷ dias dos meses (entre os 3 completos) que tiveram
 *   algum lançamento — quem começou a usar o app há 1 mês não tem a média diluída por meses vazios. No mês em que o
 *   registro de despesas começou (expenseTrackingStart), contam só os dias cobertos (monthCoverage: começo até o
 *   dia 7 conta como mês cheio; mínimo de 7 dias): quem começou no dia 20 não tem o gasto diário diluído pelos 19
 *   dias sem registro.
 *   Despesas lançadas em contas de investimento ou fora das contas de caixa não entram (não saem do caixa).
 * - O ponto de `today` já inclui os pendentes vencidos/de hoje e as ocorrências de hoje; o gasto variável acumulado
 *   no dia i (1..N) é round(total × i / N), então o último ponto é exatamente projectedEndBalance.
 * - lowestPoint é o primeiro dia com o menor saldo; willGoNegative = lowestPoint.balance < 0.
 */
export function cashflowForecast(data: FinanceData, today: ISODate, until?: ISODate): CashflowForecast {
  const requestedEnd = until ?? endOfMonth(monthKey(today));
  const end = requestedEnd < today ? today : requestedEnd;

  const cashIds = new Set<ID>();
  const accountTypes = new Map<ID, AccountType>();
  let currentBalance: Cents = 0;
  for (const account of data.accounts) {
    accountTypes.set(account.id, account.type);
    if (account.archived || account.type === 'investimento' || !account.includeInNetWorth) continue;
    cashIds.add(account.id);
    currentBalance += account.initialBalance;
  }

  const cashEffect = (m: Movement): Cents => {
    let effect = 0;
    if (m.type === 'receita') {
      if (cashIds.has(m.accountId)) effect += m.amount;
    } else if (m.type === 'despesa') {
      if (cashIds.has(m.accountId)) effect -= m.amount;
    } else {
      if (cashIds.has(m.accountId)) effect -= m.amount;
      if (m.toAccountId !== null && cashIds.has(m.toAccountId)) effect += m.amount;
    }
    return effect;
  };

  const deltas = new Map<ISODate, Cents>();
  let expectedIncome: Cents = 0;
  let expectedExpense: Cents = 0;
  const expect = (date: ISODate, effect: Cents) => {
    if (effect === 0) return;
    if (effect > 0) expectedIncome += effect;
    else expectedExpense -= effect;
    addTo(deltas, date, effect);
  };

  for (const tx of data.transactions) {
    if (tx.status === 'pago') {
      if (tx.date <= today) currentBalance += cashEffect(tx);
      else if (tx.date <= end) expect(tx.date, cashEffect(tx));
    } else if (tx.status === 'pendente' && tx.date <= end) {
      expect(tx.date < today ? today : tx.date, cashEffect(tx));
    }
  }

  const materialized = materializedKeys(data.transactions);
  for (const rule of data.recurring) {
    if (!rule.active) continue;
    for (const date of occurrencesBetween(rule, today, end)) {
      if (materialized.has(occurrenceKey(rule.id, date))) continue;
      expect(
        date,
        cashEffect({ type: rule.type, amount: rule.amount, accountId: rule.accountId, toAccountId: null }),
      );
    }
  }

  // Gasto variável: média diária dos últimos meses completos que tiveram lançamentos.
  const history = new Set<MonthKey>(lastMonths(addMonthsToKey(monthKey(today), -1), VARIABLE_HISTORY_MONTHS));
  const activeMonths = new Set<MonthKey>();
  let variableTotal: Cents = 0;
  for (const tx of data.transactions) {
    if (!isFlow(tx)) continue;
    const key = monthKey(tx.date);
    if (!history.has(key)) continue;
    activeMonths.add(key);
    if (tx.type !== 'despesa' || tx.recurringId !== null || tx.installment !== null) continue;
    if (accountTypes.get(tx.accountId) === 'investimento' || !cashIds.has(tx.accountId)) continue;
    variableTotal += tx.amount;
  }
  const trackingStart = expenseTrackingStart(data);
  let historyDays = 0;
  for (const m of activeMonths) historyDays += Math.round(daysInMonthKey(m) * monthCoverage(m, trackingStart));
  const remainingDays = diffDays(today, end);
  const projectedVariableSpending =
    historyDays > 0 && remainingDays > 0 ? Math.round((variableTotal / historyDays) * remainingDays) : 0;

  const points: ForecastPoint[] = [];
  let running = currentBalance;
  for (let i = 0; i <= remainingDays; i++) {
    const date = addDays(today, i);
    running += deltas.get(date) ?? 0;
    const variableSoFar = remainingDays > 0 ? Math.round((projectedVariableSpending * i) / remainingDays) : 0;
    points.push({ date, balance: running - variableSoFar });
  }

  let lowestPoint = points[0];
  for (const p of points) if (p.balance < lowestPoint.balance) lowestPoint = p;

  return {
    today,
    until: end,
    currentBalance,
    expectedIncome,
    expectedExpense,
    projectedVariableSpending,
    projectedEndBalance: currentBalance + expectedIncome - expectedExpense - projectedVariableSpending,
    lowestPoint: { ...lowestPoint },
    points,
    willGoNegative: lowestPoint.balance < 0,
  };
}
