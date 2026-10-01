import { addMonths, addMonthsToKey, diffMonths, lastMonths, monthKey, todayISO } from '@/domain/dates';
import type { Cents, Goal, GoalContribution, ISODate, MonthKey, Priority } from '@/domain/types';
import { compareRaw, compareText } from './internal/common';
import type { GoalProgress, GoalsOverview, GoalTrack } from './types';

/** Meses completos (anteriores ao atual) usados para medir o ritmo de aportes; o atual entra se já tiver aporte. */
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

/** Mês (data local) em que a meta foi criada; null se createdAt for inválido. */
function createdMonthOf(goal: Goal): MonthKey | null {
  const created = new Date(goal.createdAt);
  return Number.isNaN(created.getTime()) ? null : monthKey(todayISO(created));
}

/**
 * Progresso de uma meta (ver GoalProgress).
 * - saved = soma dos aportes (negativos = resgates), mínimo 0.
 * - monthsLeft = meses em que ainda dá para aportar até o prazo: diferença entre o mês de today e o do prazo, mais o
 *   mês atual se ele ainda não teve aporte (mínimo 1 se prazo >= today; 0 se prazo < today). Ex.: em 01/10, prazo em
 *   31/12 => 3 (out, nov, dez); depois do aporte de outubro => 2.
 * - requiredMonthly = ceil(remaining / monthsLeft) (remaining se monthsLeft = 0; 0 se concluída).
 * - averageMonthlyContribution = aportes líquidos dos 3 meses completos anteriores ao atual, mais o mês atual se já
 *   tiver aporte, divididos só pelos meses dessa janela a partir do início da meta (o mais antigo entre o mês de
 *   criação e o do primeiro aporte; mínimo 1). Assim o dia do mês e a idade da meta não distorcem o ritmo.
 * - track: 'pausada' se status pausada; 'concluida' se saved >= target ou status concluida; 'sem_prazo' sem data;
 *   'vencida' se prazo < today; 'no_ritmo' se média >= requiredMonthly ou se a meta foi criada no mês atual, ainda
 *   não recebeu aportes e o prazo é depois deste mês (ainda não deu tempo de aportar); senão 'atrasada'.
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

  const currentMonth = monthKey(today);
  const thisMonth = own.filter((c) => monthKey(c.date) === currentMonth);
  const contributedThisMonth = thisMonth.some((c) => c.amount > 0);

  let monthsLeft: number | null = null;
  let requiredMonthly: Cents | null = null;
  if (goal.targetDate !== null) {
    monthsLeft =
      goal.targetDate < today
        ? 0
        : Math.max(1, diffMonths(currentMonth, monthKey(goal.targetDate)) + (contributedThisMonth ? 0 : 1));
    if (completed) requiredMonthly = 0;
    else requiredMonthly = monthsLeft === 0 ? remaining : Math.ceil(remaining / monthsLeft);
  }

  const createdMonth = createdMonthOf(goal);
  const firstContributionMonth = own.length > 0 ? monthKey(own[0].date) : null;
  const startMonth =
    createdMonth !== null && (firstContributionMonth === null || createdMonth < firstContributionMonth)
      ? createdMonth
      : firstContributionMonth;
  const paceMonths = lastMonths(addMonthsToKey(currentMonth, -1), PACE_MONTHS);
  if (thisMonth.length > 0) paceMonths.push(currentMonth);
  const window = new Set(paceMonths.filter((m) => startMonth === null || m >= startMonth));
  let recent = 0;
  for (const c of own) if (window.has(monthKey(c.date))) recent += c.amount;
  const averageMonthlyContribution = roundCents(recent / Math.max(1, window.size));

  let projectedCompletionDate: ISODate | null = null;
  if (completed) projectedCompletionDate = completionDate(own, target, today);
  else if (averageMonthlyContribution > 0)
    projectedCompletionDate = addMonths(today, Math.ceil(remaining / averageMonthlyContribution));

  let track: GoalTrack;
  if (goal.status === 'pausada') track = 'pausada';
  else if (completed) track = 'concluida';
  else if (goal.targetDate === null) track = 'sem_prazo';
  else if (goal.targetDate < today) track = 'vencida';
  else {
    // Meta criada neste mês, sem aportes e com prazo depois dele: ainda não deu tempo de aportar.
    const justCreated =
      own.length === 0 &&
      createdMonth !== null &&
      createdMonth >= currentMonth &&
      monthKey(goal.targetDate) > currentMonth;
    track = justCreated || averageMonthlyContribution >= (requiredMonthly ?? 0) ? 'no_ritmo' : 'atrasada';
  }

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
 * - totalTarget/totalSaved somam todas as metas; totalRequiredMonthly soma o aporte mensal das em andamento com prazo
 *   futuro ('no_ritmo'/'atrasada') — metas vencidas ficam de fora, pois o requiredMonthly delas é o saldo inteiro
 *   (um valor único, não mensal).
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
      if (item.track === 'no_ritmo' || item.track === 'atrasada') totalRequiredMonthly += item.requiredMonthly ?? 0;
    } else if (group === 2) {
      completedCount += 1;
    }
  }

  return { totalTarget, totalSaved, activeCount, completedCount, totalRequiredMonthly, items };
}
