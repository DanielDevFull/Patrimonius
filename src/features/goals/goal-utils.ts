/**
 * Funções puras de apoio à tela de Metas (sem acesso ao banco).
 */
import type { EmergencyFundStatus, GoalProgress, GoalTrack } from '@/analytics';
import type { BadgeTone } from '@/components/ui';
import { diffMonths, isISODate, monthKey } from '@/domain/dates';
import type { Cents, Goal, GoalContribution, GoalStatus, ID, ISODate, Priority } from '@/domain/types';

/* ------------------------------------------------------------------ */
/* Rótulos                                                             */
/* ------------------------------------------------------------------ */

export const TRACK_META: Record<GoalTrack, { label: string; tone: BadgeTone }> = {
  no_ritmo: { label: 'No ritmo', tone: 'positive' },
  atrasada: { label: 'Atrasada', tone: 'warning' },
  sem_prazo: { label: 'Sem prazo', tone: 'neutral' },
  vencida: { label: 'Vencida', tone: 'negative' },
  concluida: { label: 'Concluída', tone: 'brand' },
  pausada: { label: 'Pausada', tone: 'info' },
};

/** Emojis sugeridos no formulário de meta. */
export const GOAL_EMOJIS = ['🎯', '🛟', '✈️', '🚗', '🏡', '🏖️', '🎓', '💍', '💻', '📱', '👶', '🐶', '🎸', '💰'];

export type GoalSection = 'andamento' | 'pausadas' | 'concluidas';

/** Seção da lista em que a meta aparece. */
export function sectionOf(track: GoalTrack): GoalSection {
  if (track === 'pausada') return 'pausadas';
  if (track === 'concluida') return 'concluidas';
  return 'andamento';
}

/* ------------------------------------------------------------------ */
/* Modelos                                                             */
/* ------------------------------------------------------------------ */

export interface GoalTemplate {
  key: 'reserva' | 'viagem' | 'carro' | 'casa' | 'aposentadoria' | 'estudos';
  name: string;
  icon: string;
  color: string;
  priority: Priority;
  /** Valor alvo sugerido (null = o usuário informa). */
  target: Cents | null;
  description: string;
}

/**
 * Modelos rápidos de meta. A reserva de emergência usa o alvo calculado por `emergencyFund`
 * (meses-alvo x custo essencial) quando ele é maior que zero.
 */
export function goalTemplates(emergency: Pick<EmergencyFundStatus, 'target' | 'targetMonths'>): GoalTemplate[] {
  return [
    {
      key: 'reserva',
      name: 'Reserva de emergência',
      icon: '🛟',
      color: '#0f766e',
      priority: 'alta',
      target: emergency.target > 0 ? emergency.target : null,
      description:
        emergency.target > 0
          ? `${emergency.targetMonths} meses do seu custo essencial, para imprevistos.`
          : 'Dinheiro guardado para imprevistos (6 meses de custo essencial).',
    },
    {
      key: 'viagem',
      name: 'Viagem',
      icon: '✈️',
      color: '#2563eb',
      priority: 'media',
      target: null,
      description: 'Passagens, hospedagem e passeios sem parcelar.',
    },
    {
      key: 'carro',
      name: 'Carro',
      icon: '🚗',
      color: '#ea580c',
      priority: 'media',
      target: null,
      description: 'Entrada ou compra à vista, fugindo dos juros.',
    },
    {
      key: 'casa',
      name: 'Casa própria',
      icon: '🏡',
      color: '#7c3aed',
      priority: 'media',
      target: null,
      description: 'Entrada do imóvel, documentação e mudança.',
    },
    {
      key: 'aposentadoria',
      name: 'Aposentadoria',
      icon: '🏖️',
      color: '#16a34a',
      priority: 'media',
      target: null,
      description: 'Independência financeira no longo prazo.',
    },
    {
      key: 'estudos',
      name: 'Estudos',
      icon: '🎓',
      color: '#ca8a04',
      priority: 'media',
      target: null,
      description: 'Curso, faculdade, idiomas ou certificações.',
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Planejamento                                                        */
/* ------------------------------------------------------------------ */

/**
 * Quanto guardar por mês para chegar ao alvo até o prazo (mesma regra de `goalProgress`):
 * meses = diferença entre o mês de hoje e o mês do prazo, mais o mês atual se ele ainda não teve aporte
 * (`contributedThisMonth`, padrão false — meta nova); mínimo 1. null sem alvo/prazo válidos ou prazo passado.
 */
export function monthlyPlan(
  target: Cents | null,
  saved: Cents,
  targetDate: ISODate | null,
  today: ISODate,
  contributedThisMonth = false,
): { months: number; monthly: Cents } | null {
  if (target === null || target <= 0 || !targetDate || !isISODate(targetDate) || targetDate < today) return null;
  const months = Math.max(1, diffMonths(monthKey(today), monthKey(targetDate)) + (contributedThisMonth ? 0 : 1));
  const remaining = Math.max(0, target - saved);
  return { months, monthly: Math.ceil(remaining / months) };
}

/* ------------------------------------------------------------------ */
/* Validação                                                           */
/* ------------------------------------------------------------------ */

export interface GoalFormInput {
  name: string;
  target: Cents | null;
  targetDate: string;
}

export type GoalFormField = 'name' | 'target' | 'targetDate';

/**
 * Valida o formulário de meta. Prazo é opcional; se informado deve ser uma data válida e não pode estar no passado
 * (exceto se for o prazo já salvo da meta em edição, que é mantido como está).
 */
export function validateGoalForm(
  input: GoalFormInput,
  today: ISODate,
  originalDate: ISODate | null = null,
): Partial<Record<GoalFormField, string>> {
  const errors: Partial<Record<GoalFormField, string>> = {};
  if (!input.name.trim()) errors.name = 'Dê um nome para a meta.';
  if (input.target === null || input.target <= 0) errors.target = 'Informe um valor maior que zero.';
  const date = input.targetDate.trim();
  if (date) {
    if (!isISODate(date)) errors.targetDate = 'Data inválida.';
    else if (date < today && date !== originalDate) errors.targetDate = 'Escolha uma data a partir de hoje.';
  }
  return errors;
}

export type ContributionMode = 'aporte' | 'resgate';

/** Valida aporte/resgate: valor > 0, resgate até o saldo guardado, data válida. */
export function validateContribution(
  mode: ContributionMode,
  amount: Cents | null,
  saved: Cents,
  date: string,
): { amount?: string; date?: string } {
  const errors: { amount?: string; date?: string } = {};
  if (amount === null || amount <= 0) errors.amount = 'Informe um valor maior que zero.';
  else if (mode === 'resgate' && amount > saved) errors.amount = 'O resgate não pode ser maior que o valor guardado.';
  if (!isISODate(date)) errors.date = 'Informe uma data válida.';
  return errors;
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

/** Aporte que faz uma meta ativa (ainda não concluída) atingir o alvo. */
export function completesGoal(goal: Pick<Goal, 'status' | 'targetAmount'>, saved: Cents, delta: Cents): boolean {
  return goal.status === 'ativa' && delta > 0 && saved < goal.targetAmount && saved + delta >= goal.targetAmount;
}

/**
 * Status coerente com o valor guardado (ao editar o alvo, retomar uma meta ou remover aportes):
 * pausada continua pausada; senão 'concluida' se guardado >= alvo, 'ativa' caso contrário.
 */
export function reconcileStatus(status: GoalStatus, saved: Cents, target: Cents): GoalStatus {
  if (status === 'pausada') return 'pausada';
  return saved >= target ? 'concluida' : 'ativa';
}

/** Soma líquida dos aportes de uma meta (mínimo 0), como em `goalProgress`. */
export function savedFor(goalId: ID, contributions: GoalContribution[]): Cents {
  let total = 0;
  for (const c of contributions) if (c.goalId === goalId) total += c.amount;
  return Math.max(0, total);
}

/** Aportes/resgates de uma meta, mais recentes primeiro. */
export function contributionsOf(goalId: ID, contributions: GoalContribution[]): GoalContribution[] {
  return contributions
    .filter((c) => c.goalId === goalId)
    .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));
}

/* ------------------------------------------------------------------ */
/* Dica do Pat                                                         */
/* ------------------------------------------------------------------ */

export type CoachTip =
  | { kind: 'no_ritmo' }
  | { kind: 'atrasada'; extraMonthly: Cents }
  /** Meta com prazo que ainda não recebeu nada: sugere o aporte mensal para começar. */
  | { kind: 'comecar'; monthly: Cents }
  | { kind: 'vencida'; remaining: Cents }
  | { kind: 'sem_prazo_com_ritmo'; date: ISODate }
  | { kind: 'sem_aportes' };

/** Dica curta sobre a meta (null para concluídas/pausadas). */
export function coachTip(p: GoalProgress): CoachTip | null {
  switch (p.track) {
    case 'no_ritmo':
      // Meta recém-criada (ainda sem aportes) conta como no ritmo, mas a dica é de como começar.
      if (p.saved === 0 && p.averageMonthlyContribution <= 0 && (p.requiredMonthly ?? 0) > 0)
        return { kind: 'comecar', monthly: p.requiredMonthly ?? 0 };
      return { kind: 'no_ritmo' };
    case 'atrasada':
      if (p.saved === 0 && p.averageMonthlyContribution <= 0) return { kind: 'comecar', monthly: p.requiredMonthly ?? 0 };
      return { kind: 'atrasada', extraMonthly: Math.max(0, (p.requiredMonthly ?? 0) - p.averageMonthlyContribution) };
    case 'vencida':
      return { kind: 'vencida', remaining: p.remaining };
    case 'sem_prazo':
      return p.projectedCompletionDate
        ? { kind: 'sem_prazo_com_ritmo', date: p.projectedCompletionDate }
        : { kind: 'sem_aportes' };
    default:
      return null;
  }
}
