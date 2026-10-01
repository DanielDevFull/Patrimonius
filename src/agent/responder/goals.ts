/** Metas: criação, situação e aportes. */
import {
  averageMonthlyExpense,
  averageMonthlyIncome,
  goalProgress,
  goalsOverview,
  type GoalProgress,
  type GoalTrack,
} from '@/analytics';
import { ROUTES } from '@/app/navigation';
import { addMonths, diffMonths, formatDateBR, formatMonthLong, monthKey } from '@/domain/dates';
import { COLOR_PALETTE } from '@/domain/defaults';
import { formatBRL, formatDecimal, formatPercent } from '@/domain/money';
import { normalizeText, plural } from '@/domain/text';
import type { FinanceData, Priority } from '@/domain/types';
import { bullets, categoryLabel, dateRelative, money, sentences } from '../format';
import type { AgentCard, CardTone, GoalDraft } from '../types';
import type { Handler, TurnContext } from './context';

const TRACK_LABEL: Record<GoalTrack, string> = {
  concluida: 'Concluída',
  no_ritmo: 'No ritmo',
  atrasada: 'Atrasada',
  sem_prazo: 'Sem prazo',
  vencida: 'Prazo vencido',
  pausada: 'Pausada',
};

const TRACK_TONE: Record<GoalTrack, CardTone> = {
  concluida: 'positive',
  no_ritmo: 'positive',
  atrasada: 'warning',
  sem_prazo: 'neutral',
  vencida: 'negative',
  pausada: 'neutral',
};

const GOAL_ICONS: [RegExp, string][] = [
  [/\b(reserva|emergencia)/, '🛟'],
  [/\b(viagem|viajar|ferias|intercambio|passeio|europa|disney)/, '✈️'],
  [/\b(carro|moto|veiculo)/, '🚗'],
  [/\b(casa|apartamento|ape|imovel|reforma|entrada)/, '🏠'],
  [/\b(notebook|computador|celular|iphone|pc|videogame|tv|televisao)/, '💻'],
  [/\b(casamento|noivado|alianca)/, '💍'],
  [/\b(curso|faculdade|estudo|pos|mba|intercambio|educacao)/, '🎓'],
  [/\b(aposentadoria|previdencia)/, '🏖️'],
  [/\b(filho|filha|bebe|crianca)/, '👶'],
  [/\b(divida|dividas|quitar)/, '💳'],
  [/\b(presente|natal)/, '🎁'],
];

export function goalIcon(name: string): string {
  const n = normalizeText(name);
  return GOAL_ICONS.find(([re]) => re.test(n))?.[1] ?? '🎯';
}

function goalPriority(name: string): Priority {
  return /\b(reserva|emergencia)/.test(normalizeText(name)) ? 'alta' : 'media';
}

export function nextGoalColor(data: FinanceData): string {
  return COLOR_PALETTE[data.goals.length % COLOR_PALETTE.length];
}

/** Sobra mensal média (renda - despesa dos 3 meses anteriores) e renda média (com fallback na estimativa). */
function monthlyCapacity(ctx: TurnContext): { income: number; surplus: number | null } {
  const { data, month } = ctx;
  const recordedIncome = averageMonthlyIncome(data.transactions, month, 3);
  const expense = averageMonthlyExpense(data.transactions, month, 3);
  const estimate = data.settings.monthlyIncomeEstimate ?? 0;
  const income = recordedIncome > 0 ? recordedIncome : estimate;
  const hasHistory = recordedIncome > 0 || expense > 0;
  return { income, surplus: hasHistory ? recordedIncome - expense : null };
}

function progressCardItem(p: GoalProgress, current = p.saved) {
  return {
    label: categoryLabel({ icon: p.icon, name: p.name }),
    current,
    target: p.targetAmount,
    hint: TRACK_LABEL[p.track],
    tone: TRACK_TONE[p.track],
  };
}

/** criar_meta */
export const createGoalReply: Handler = (ctx) => {
  const { data, entities: e, name: userName } = ctx;
  const name = e.name?.trim();
  const amount = e.amount;
  if (!name && (amount === undefined || amount <= 0)) {
    return {
      text: 'Vamos criar uma meta! 🎯 Me diga o objetivo, o valor e, se quiser, o prazo. Por exemplo: “criar meta viagem de 10 mil até dezembro”.',
      suggestions: ['Criar meta viagem de 10 mil em 12 meses', 'Criar meta reserva de emergência de 15 mil em 18 meses'],
    };
  }
  if (amount === undefined || amount <= 0) {
    return {
      text: `Boa ideia, a meta “${name}”! Quanto você quer juntar? Se tiver um prazo, me diga também (ex.: “em 12 meses”).`,
      suggestions: [`Criar meta ${name} de 5 mil em 12 meses`, `Criar meta ${name} de 10 mil em 24 meses`],
    };
  }
  const finalName = name ?? 'Nova meta';
  const icon = goalIcon(finalName);
  const targetDate = e.targetDate ?? (e.months && e.months > 0 ? addMonths(ctx.today, e.months) : null);
  const months = targetDate ? Math.max(1, diffMonths(ctx.month, monthKey(targetDate))) : null;
  const monthly = months ? Math.ceil(amount / months) : null;
  const { income, surplus } = monthlyCapacity(ctx);
  const parts: (string | null)[] = [
    `Ótimo objetivo${userName ? `, ${userName}` : ''}! Meta ${icon} “${finalName}”: ${money(amount)}${targetDate ? ` até ${formatDateBR(targetDate)}` : ''}.`,
    name ? null : 'Dei o nome “Nova meta” — você pode mudar antes de confirmar.',
  ];
  if (monthly !== null && months !== null) {
    parts.push(
      `Para chegar lá, guarde ${money(monthly)} por mês durante ${plural(months, 'mês', 'meses')}${income > 0 ? ` (${formatPercent(monthly / income)} da sua renda média)` : ''}.`,
    );
    if (surplus !== null && surplus > 0)
      parts.push(
        monthly > surplus
          ? `Hoje sua sobra média é ${formatBRL(surplus)} por mês — talvez valha estender o prazo ou cortar alguns gastos.`
          : `Cabe na sua sobra média de ${formatBRL(surplus)} por mês. 👍`,
      );
    else if (surplus !== null)
      parts.push('Hoje seus gastos consomem toda a renda: para essa meta andar, será preciso abrir espaço no orçamento.');
  } else if (surplus !== null && surplus > 0) {
    const pace = Math.max(1000, Math.round(surplus / 2));
    parts.push(
      `Sem prazo definido: guardando ${formatBRL(pace)} por mês (metade da sua sobra média), você chega lá em ${plural(Math.ceil(amount / pace), 'mês', 'meses')}.`,
    );
  } else {
    parts.push('Definir um prazo ajuda a manter o foco — você pode ajustar depois.');
  }
  if (icon === '🛟')
    parts.push(
      'Dica: deixe a reserva em uma aplicação de liquidez diária e baixo risco (é uma orientação geral, não uma recomendação de investimento).',
    );
  parts.push('Confirma a criação?');
  const draft: GoalDraft = {
    name: finalName,
    targetAmount: amount,
    targetDate,
    icon,
    color: nextGoalColor(data),
    priority: goalPriority(finalName),
    status: 'ativa',
  };
  const cards: AgentCard[] =
    monthly !== null
      ? [{ type: 'stat', title: 'Aporte mensal necessário', value: formatBRL(monthly), hint: plural(months ?? 0, 'mês', 'meses') }]
      : [];
  return {
    text: sentences(parts),
    cards,
    actions: [{ type: 'create_goal', label: 'Criar meta', draft }],
    suggestions: ['Como estão minhas metas?', 'Vou fechar o mês no azul?', 'Dicas para economizar'],
  };
};

function goalDetail(p: GoalProgress, today: string): string {
  const head = `${categoryLabel({ icon: p.icon, name: p.name })}: ${money(p.saved)} de ${formatBRL(p.targetAmount)} (${formatPercent(p.percent)}).`;
  switch (p.track) {
    case 'concluida':
      return `${head} Meta concluída! 🎉 Que tal definir o próximo objetivo?`;
    case 'pausada':
      return `${head} Esta meta está pausada — retome quando fizer sentido.`;
    case 'vencida':
      return `${head} O prazo (${formatDateBR(p.targetDate ?? today)}) já passou e faltam ${formatBRL(p.remaining)}. Que tal definir uma nova data?`;
    case 'no_ritmo':
      return `${head} Faltam ${formatBRL(p.remaining)}. Você está no ritmo: aporta em média ${formatBRL(p.averageMonthlyContribution)} por mês e precisa de ${formatBRL(p.requiredMonthly ?? 0)} até ${formatDateBR(p.targetDate ?? today)}. 👍`;
    case 'atrasada':
      return `${head} Faltam ${formatBRL(p.remaining)}. Para cumprir o prazo (${formatDateBR(p.targetDate ?? today)}), aporte ${formatBRL(p.requiredMonthly ?? p.remaining)} por mês — sua média recente é ${formatBRL(p.averageMonthlyContribution)}.`;
    case 'sem_prazo':
      return `${head} Faltam ${formatBRL(p.remaining)}.${p.projectedCompletionDate ? ` No ritmo atual, você conclui por volta de ${formatMonthLong(monthKey(p.projectedCompletionDate))}.` : ' Defina um aporte mensal para ela avançar.'}`;
  }
}

/** status_metas */
export const goalsStatusReply: Handler = (ctx) => {
  const { data, today, entities: e } = ctx;
  if (data.goals.length === 0) {
    return {
      text: 'Você ainda não tem metas. Metas dão destino ao dinheiro que você poupa — reserva de emergência, viagem, carro novo… Quer criar uma?',
      actions: [{ type: 'navigate', label: 'Ver metas', to: ROUTES.goals }],
      suggestions: ['Criar meta reserva de emergência de 10 mil em 12 meses', 'Criar meta viagem de 5 mil em 10 meses'],
    };
  }
  const overview = goalsOverview(data.goals, data.goalContributions, today);
  const focus = e.goalId ? overview.items.find((p) => p.goalId === e.goalId) : undefined;
  if (focus) {
    return {
      text: goalDetail(focus, today),
      cards: [{ type: 'progress', title: 'Meta', items: [progressCardItem(focus)] }],
      suggestions: [`Guardei 100 na meta ${focus.name}`, 'Como estão minhas metas?'],
    };
  }
  const active = overview.items.filter((p) => p.track !== 'concluida' && p.track !== 'pausada');
  const onTrack = active.filter((p) => p.track === 'no_ritmo').length;
  const behind = active.filter((p) => p.track === 'atrasada' || p.track === 'vencida');
  const parts: (string | null)[] = [
    `Você tem ${plural(active.length, 'meta ativa', 'metas ativas')}${overview.completedCount ? ` e ${plural(overview.completedCount, 'concluída', 'concluídas')}` : ''}. Já guardou ${money(overview.totalSaved)} de ${formatBRL(overview.totalTarget)}.`,
  ];
  if (active.length) {
    const counts = [onTrack ? `${onTrack} no ritmo` : null, behind.length ? `${behind.length} ${behind.length === 1 ? 'atrasada' : 'atrasadas'}` : null].filter(Boolean);
    if (counts.length) parts.push(`${counts.join(' e ')}.`.replace(/^./, (c) => c.toUpperCase()));
  }
  const first = behind[0];
  if (first)
    parts.push(
      first.track === 'vencida'
        ? `Atenção para ${first.name}: o prazo passou e faltam ${formatBRL(first.remaining)} — defina uma nova data.`
        : `Atenção para ${first.name}: aporte ${formatBRL(first.requiredMonthly ?? first.remaining)} por mês para cumprir o prazo.`,
    );
  else if (active.length) parts.push('Tudo caminhando — continue com os aportes! 👏');
  if (overview.totalRequiredMonthly > 0)
    parts.push(`Somando tudo, suas metas com prazo pedem ${formatBRL(overview.totalRequiredMonthly)} por mês.`);
  const firstActive = active[0];
  return {
    text: sentences(parts),
    cards: [{ type: 'progress', title: 'Suas metas', items: overview.items.slice(0, 8).map((p) => progressCardItem(p)) }],
    actions: [{ type: 'navigate', label: 'Ver metas', to: ROUTES.goals }],
    suggestions: [
      firstActive ? `Guardei 100 na meta ${firstActive.name}` : 'Criar meta viagem de 5 mil em 10 meses',
      'Vou fechar o mês no azul?',
      'Dicas para economizar',
    ],
  };
};

/** aportar_meta */
export const contributeGoalReply: Handler = (ctx) => {
  const { data, today, entities: e } = ctx;
  if (data.goals.length === 0) {
    return {
      text: 'Você ainda não tem metas para receber aportes. Quer criar uma? Diga, por exemplo: “criar meta viagem de 5 mil em 10 meses”.',
      actions: [{ type: 'navigate', label: 'Ver metas', to: ROUTES.goals }],
      suggestions: ['Criar meta viagem de 5 mil em 10 meses', 'Criar meta reserva de emergência de 10 mil em 12 meses'],
    };
  }
  const goal = data.goals.find((g) => g.id === e.goalId);
  const amount = e.amount;
  if (!goal) {
    const candidates = data.goals.filter((g) => g.status !== 'concluida');
    const list = (candidates.length ? candidates : data.goals).map((g) => goalProgress(g, data.goalContributions, today));
    return {
      text: `Não encontrei essa meta. ${amount ? `Em qual delas você quer guardar ${formatBRL(amount)}?` : 'Em qual delas você quer guardar?'}\n${bullets(
        list.map((p) => `${categoryLabel({ icon: p.icon, name: p.name })} — ${formatBRL(p.saved)} de ${formatBRL(p.targetAmount)}`),
      )}`,
      suggestions: list.slice(0, 4).map((p) => `Guardei ${formatDecimal(amount ?? 10000)} na meta ${p.name}`),
    };
  }
  const progress = goalProgress(goal, data.goalContributions, today);
  const label = categoryLabel({ icon: goal.icon, name: goal.name });
  if (amount === undefined || amount <= 0) {
    return {
      text: `Quanto você quer guardar na meta ${label}?${progress.requiredMonthly ? ` Para o prazo, o ideal é ${formatBRL(progress.requiredMonthly)} por mês.` : ''}`,
      suggestions: [
        `Guardei ${formatDecimal(progress.requiredMonthly && progress.requiredMonthly > 0 ? progress.requiredMonthly : 10000)} na meta ${goal.name}`,
      ],
    };
  }
  const date = e.date ?? today;
  const after = progress.saved + amount;
  const ratio = goal.targetAmount > 0 ? Math.min(1, after / goal.targetAmount) : 1;
  const text = sentences([
    `Boa! 💪 Aporte de ${money(amount)} na meta ${label}${date !== today ? ` (${dateRelative(date, today)})` : ''}.`,
    `Com ele, você chega a ${formatBRL(after)} de ${formatBRL(goal.targetAmount)} (${formatPercent(ratio)}).`,
    after >= goal.targetAmount ? 'Esse aporte completa a meta! 🎉' : `Faltam ${formatBRL(goal.targetAmount - after)}.`,
    goal.status === 'pausada' ? 'A meta está pausada, mas o aporte será registrado mesmo assim.' : null,
    'Confirma?',
  ]);
  return {
    text,
    cards: [{ type: 'progress', title: 'Depois do aporte', items: [progressCardItem(progress, after)] }],
    actions: [{ type: 'contribute_goal', label: 'Confirmar aporte', goalId: goal.id, amount, date }],
    suggestions: ['Como estão minhas metas?', 'Qual meu saldo?'],
  };
};
