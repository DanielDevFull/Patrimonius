import type { FinanceData, ISODate, MonthKey } from '@/domain/types';
import type { NetWorthBreakdown, NetWorthPoint } from './types';

/**
 * Patrimônio líquido em `asOf`:
 * - contas com includeInNetWorth (arquivadas só se saldo != 0): saldo pago até asOf; positivos somam ativos, negativos passivos;
 * - bens não arquivados: valor da avaliação mais recente com date <= asOf; sem avaliação até asOf:
 *   se acquisitionDate > asOf => 0; senão acquisitionValue ?? value;
 * - dívidas ativas: debtCurrentBalance(debt, payments, asOf).
 */
export function netWorth(data: FinanceData, asOf: ISODate): NetWorthBreakdown {
  void data;
  void asOf;
  throw new Error('não implementado');
}

/**
 * Evolução do patrimônio: um ponto por mês (count meses até endMonth, cronológico), calculado no último dia do mês
 * (ou em `today` para o mês corrente, se today for informado e cair dentro de endMonth).
 */
export function netWorthHistory(
  data: FinanceData,
  endMonth: MonthKey,
  count: number,
  today?: ISODate,
): NetWorthPoint[] {
  void data;
  void endMonth;
  void count;
  void today;
  throw new Error('não implementado');
}
