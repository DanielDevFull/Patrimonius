import type { FinanceData, ISODate } from '@/domain/types';
import type { CashflowForecast } from './types';

/**
 * Previsão de fluxo de caixa de `today` até `until` (padrão: último dia do mês de today).
 * Considera as "contas de caixa": contas NÃO arquivadas cujo tipo NÃO é 'investimento'
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
 */
export function cashflowForecast(data: FinanceData, today: ISODate, until?: ISODate): CashflowForecast {
  void data;
  void today;
  void until;
  throw new Error('não implementado');
}
