import type { FinanceData, ISODate } from '@/domain/types';
import type { EmergencyFundStatus, HealthReport } from './types';

/**
 * Situação da reserva de emergência (ver EmergencyFundStatus).
 * monthlyEssential: média mensal de despesas em categorias do grupo 'necessidades' nos 3 meses completos anteriores
 * ao mês de today; se 0 => 60% da média de despesas totais; se 0 => 50% de settings.monthlyIncomeEstimate; senão 0.
 * level: sem_dados (monthlyEssential = 0), critica (< 1 mês), baixa (< 3), parcial (< target), completa.
 */
export function emergencyFund(data: FinanceData, today: ISODate): EmergencyFundStatus {
  void data;
  void today;
  throw new Error('não implementado');
}

/**
 * Score de saúde financeira 0..100 (pesos: poupanca 25, reserva 25, dividas 20, orcamento 15, metas 10, fluxo 5).
 * Ver HealthReport/HealthComponent. Sempre retorna os 6 componentes, com dicas em pt-BR.
 * dataQuality: 'insuficiente' (< 1 mês com lançamentos), 'parcial' (1-2), 'boa' (>= 3) nos últimos 3 meses completos + atual.
 */
export function financialHealth(data: FinanceData, today: ISODate): HealthReport {
  void data;
  void today;
  throw new Error('não implementado');
}
