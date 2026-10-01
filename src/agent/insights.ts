import type { FinanceData, ISODate } from '@/domain/types';
import type { Insight } from './types';

/**
 * Gera insights proativos (alertas, conquistas e recomendações) a partir dos dados, ordenados por prioridade desc.
 * Remove os dispensados em settings.dismissedInsights para o mês corrente. Determinístico para (data, today).
 */
export function generateInsights(data: FinanceData, today: ISODate): Insight[] {
  void data;
  void today;
  throw new Error('não implementado');
}
