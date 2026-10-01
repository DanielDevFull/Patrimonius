import type { FinanceData, ISODate } from '@/domain/types';
import type { CashflowForecast } from './types';

/**
 * Previsão de fluxo de caixa de `today` até `until` (padrão: último dia do mês de today).
 * - currentBalance: totalBalance (contas não arquivadas, só 'pago', date <= today).
 * - Entram como esperados: lançamentos 'pendente' com date <= until (vencidos contam como se fossem hoje)
 *   e lançamentos 'pago' com date > today e <= until; mais ocorrências de recorrências ativas ainda não materializadas
 *   (>= nextDate) entre today e until. Transferências não alteram o total.
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
