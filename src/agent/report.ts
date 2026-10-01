import type { FinanceData, ISODate, MonthKey } from '@/domain/types';
import type { MonthlyReport } from './types';

/** Relatório narrativo do mês (o "fechamento do mês" escrito pelo agente). */
export function monthlyReport(data: FinanceData, month: MonthKey, today: ISODate): MonthlyReport {
  void data;
  void month;
  void today;
  throw new Error('não implementado');
}
