import { addMonths, diffMonths, lastMonths, monthKey } from '@/domain/dates';
import type { Cents, Goal, GoalContribution, ISODate, Priority } from '@/domain/types';
import { compareRaw, compareText } from './internal/common';
import type { GoalProgress, GoalsOverview, GoalTrack } from './types';

/** Janela (em meses, incluindo o atual) usada para medir o ritmo de aportes. */
const PACE_MONTHS = 3;

const PRIORITY_RANK: Record<Priority, number> = { alta: 0, media: 1, baixa: 2 };

/** Arredonda ao centavo sem produzir -0. */
function roundCents(value: number): Cents {
  const r = Math.round(value);
  return r === 0 ? 0 : r;
}

/** Aportes da meta em ordem cronológica (data, depois criação e id) — determinístico. */
function sortedContributions(goalId: string, contributions: GoalContribution[]): GoalContribution[] {
  return contributions
    .filter((c) => c.goalId === goalId)
    .sort(
      (a, b) => compareRaw(a.date, b.date) || compareRaw(a.createdAt, b.createdAt) || compareRaw(a.id, b.id),
    );
}

/**
 * Data em que a meta foi concluída: o primeiro aporte em que o acumulado atingiu o alvo; se a meta foi marcada como
 * concluída sem atingir o alvo, a data do último aporte; sem aportes, `today`.
 */
function completionDate(own: GoalContribution[], target: Cents, today: ISODate): ISODate {
  let running = 0;
  for (const c of own) {
    running += c.amount;
    if (running >= target) return c.date;
  }
  return own.length > 0 ? own[own.length - 1].date : today;
}

/**
 * Progresso de uma meta (ver GoalProgress).
 * - saved = soma dos aportes (negativos = resgates), mínimo 0.
 * - monthsLeft = diferença em meses entre o mês de today e o mês do prazo (mínimo 1 se prazo >= today; 0 se prazo < today).
 * - requiredMonthly = ceil(remaining / monthsLeft) (remaining se monthsLeft = 0; 0 se concluída).
 * - averageMonthlyContribution = soma dos aportes dos 3 últimos meses (incluindo o atual) / 3, arredondado.
 * - track: 'pausada' se status pausada; 'concluida' se saved >= target ou status concluida; 'sem_prazo' sem data;
 *   'vencida' se prazo < today; 'no_ritmo' se média >= requiredMonthly; senão 'atrasada'.
 *
 * Detalhes: projectedCompletionDate = today + ceil(remaining / média) meses quando a média > 0; para metas concluídas
 * é a data em que o alvo foi atingido (ou a do último aporte / today, se marcada manualmente). Meta com alvo <= 0
 * conta como concluída (percent = 1).
 */
export function goalProgress(goal: Goal, contributions: GoalContribution[], today: ISODate): GoalProgress {
  const own = sortedContributions(goal.id, contributions);
  const target = goal.targetAmount;
  const saved = Math.max(
    0,
    own.reduce((s, c) => s + c.amount, 0),
  );
  const remaining = Math.max(0, target - saved);
  const percent = target > 0 ? Math.min(1, saved / target) : 1;
  const completed = goal.status === 'concluida' || saved >= target;

  let monthsLeft: number | null = null;
  let requiredMonthly: Cents | null = null;
  if (goal.targetDate !== null) {
    monthsLeft =
      goal.targetDate < today ? 0 : Math.max(1, diffMonths(monthKey(today), monthKey(goal.targetDate)));
    if (completed) requiredMonthly = 0;
    else requiredMonthly = monthsLeft === 0 ? remaining : Math.ceil(remaining / monthsLeft);
  }

  const window = new Set(lastMonths(monthKey(today), PACE_MONTHS));
  let recent = 0;
  for (const c of own) if (window.has(monthKey(c.date))) recent += c.amount;
  const averageMonthlyContribution = roundCents(recent / PACE_MONTHS);

  let projectedCompletionDate: ISODate | null = null;
  if (completed) projectedCompletionDate = completionDate(own, target, today);
  else if (averageMonthlyContribution > 0)
    projectedCompletionDate = addMonths(today, Math.ceil(remaining / averageMonthlyContribution));

  let track: GoalTrack;
  if (goal.status === 'pausada') track = 'pausada';
  else if (completed) track = 'concluida';
  else if (goal.targetDate === null) track = 'sem_prazo';
  else if (goal.targetDate < today) track = 'vencida';
  else track = averageMonthlyContribution >= (requiredMonthly ?? 0) ? 'no_ritmo' : 'atrasada';

  return {
    goalId: goal.id,
    name: goal.name,
    icon: goal.icon,
    color: goal.color,
    targetAmount: target,
    targetDate: goal.targetDate,
    saved,
    remaining,
    percent,
    monthsLeft,
    requiredMonthly,
    averageMonthlyContribution,
    projectedCompletionDate,
    track,
  };
}

/** Grupo de ordenação: 0 = em andamento, 1 = pausada, 2 = concluída. */
function trackGroup(track: GoalTrack): number {
  if (track === 'pausada') return 1;
  if (track === 'concluida') return 2;
  return 0;
}

/**
 * Visão consolidada; itens ordenados: ativas (prioridade alta→baixa, depois prazo asc), pausadas, concluídas.
 * - "Ativas" são as metas em andamento (status 'ativa' que ainda não atingiram o alvo); metas sem prazo vêm depois
 *   das com prazo dentro da mesma prioridade; desempate final por nome.
 * - totalTarget/totalSaved somam todas as metas; totalRequiredMonthly soma só as em andamento.
 */
export function goalsOverview(
  goals: Goal[],
  contributions: GoalContribution[],
  today: ISODate,
): GoalsOverview {
  const goalById = new Map(goals.map((g) => [g.id, g]));
  const items = goals.map((g) => goalProgress(g, contributions, today));
  const priorityOf = (p: GoalProgress) => PRIORITY_RANK[goalById.get(p.goalId)?.priority ?? 'media'];

  items.sort(
    (a, b) =>
      trackGroup(a.track) - trackGroup(b.track) ||
      priorityOf(a) - priorityOf(b) ||
      compareRaw(a.targetDate ?? '9999-12-31', b.targetDate ?? '9999-12-31') ||
      compareText(a.name, b.name) ||
      compareRaw(a.goalId, b.goalId),
  );

  let totalTarget = 0;
  let totalSaved = 0;
  let activeCount = 0;
  let completedCount = 0;
  let totalRequiredMonthly = 0;
  for (const item of items) {
    totalTarget += item.targetAmount;
    totalSaved += item.saved;
    const group = trackGroup(item.track);
    if (group === 0) {
      activeCount += 1;
      totalRequiredMonthly += item.requiredMonthly ?? 0;
    } else if (group === 2) {
      completedCount += 1;
    }
  }

  return { totalTarget, totalSaved, activeCount, completedCount, totalRequiredMonthly, items };
}
