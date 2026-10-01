import type { Goal, GoalContribution, ISODate } from '@/domain/types';
import type { GoalProgress, GoalsOverview } from './types';

/**
 * Progresso de uma meta (ver GoalProgress).
 * - saved = soma dos aportes (negativos = resgates), mínimo 0.
 * - monthsLeft = diferença em meses entre o mês de today e o mês do prazo (mínimo 1 se prazo >= today; 0 se prazo < today).
 * - requiredMonthly = ceil(remaining / monthsLeft) (remaining se monthsLeft = 0; 0 se concluída).
 * - averageMonthlyContribution = soma dos aportes dos 3 últimos meses (incluindo o atual) / 3, arredondado.
 * - track: 'pausada' se status pausada; 'concluida' se saved >= target ou status concluida; 'sem_prazo' sem data;
 *   'vencida' se prazo < today; 'no_ritmo' se média >= requiredMonthly; senão 'atrasada'.
 */
export function goalProgress(goal: Goal, contributions: GoalContribution[], today: ISODate): GoalProgress {
  void goal;
  void contributions;
  void today;
  throw new Error('não implementado');
}

/** Visão consolidada; itens ordenados: ativas (prioridade alta→baixa, depois prazo asc), pausadas, concluídas. */
export function goalsOverview(goals: Goal[], contributions: GoalContribution[], today: ISODate): GoalsOverview {
  void goals;
  void contributions;
  void today;
  throw new Error('não implementado');
}
