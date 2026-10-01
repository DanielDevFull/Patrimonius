/**
 * Funções puras do painel (sem React, sem banco). Testadas em dashboard-utils.test.ts.
 */
import type { CategoryTotal, GoalTrack, HealthComponent, HealthGrade } from '@/analytics';
import { ROUTES, newTransactionPath } from '@/app/navigation';
import type { BadgeTone } from '@/components/ui';
import { formatDateRelative } from '@/domain/dates';
import type { Cents, FinanceData, ISODate, Transaction } from '@/domain/types';

/* ------------------------------------------------------------------ */
/* Saudação                                                            */
/* ------------------------------------------------------------------ */

/** 'Bom dia' (5h–11h), 'Boa tarde' (12h–17h) ou 'Boa noite'. */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Primeiro nome ('' se não informado). */
export function firstNameOf(userName: string | null | undefined): string {
  const name = (userName ?? '').trim();
  return name ? name.split(/\s+/)[0] : '';
}

/** 'Boa tarde, Ana!' ou 'Boa tarde!'. */
export function greetingLine(hour: number, userName: string | null | undefined): string {
  const name = firstNameOf(userName);
  const greeting = greetingFor(hour);
  return name ? `${greeting}, ${name}!` : `${greeting}!`;
}

/* ------------------------------------------------------------------ */
/* Valores dentro de textos do agente                                  */
/* ------------------------------------------------------------------ */

export interface TextPart {
  text: string;
  /** true quando o trecho é um valor em reais (recebe a classe .money para o modo "ocultar valores"). */
  money: boolean;
}

/** 'R$ 1.234,56', '-R$ 50,00', '+R$ 10,00', 'R$ 1,2 mi', 'R$ 3 mil'. */
const MONEY_IN_TEXT = /[+-]?R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d+)?(?:\s(?:mil|mi|bi|tri)\b)?/g;

/**
 * Separa um texto (ex.: mensagem de insight, parágrafo do relatório) em trechos normais e trechos de valor em reais,
 * para que os valores possam ser borrados no modo privacidade sem esconder a frase inteira.
 */
export function splitMoneyText(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(MONEY_IN_TEXT)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start), money: false });
    parts.push({ text: match[0], money: true });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), money: false });
  return parts;
}

/* ------------------------------------------------------------------ */
/* Gastos por categoria (rosca)                                        */
/* ------------------------------------------------------------------ */

export const OTHER_SLICE_COLOR = '#94a3b8';

export interface DonutSlice {
  key: string;
  label: string;
  icon: string;
  color: string;
  value: Cents;
  /** Fração (0..1) do total exibido. */
  share: number;
}

/**
 * Fatias da rosca a partir dos totais por categoria (já ordenados por total desc).
 * No máximo `maxSlices` fatias: as menores são agrupadas em "Outras" (uma única categoria restante aparece com
 * o próprio nome). Totais <= 0 são ignorados. A cor segue a categoria (nunca a posição).
 */
export function donutSlices(rows: CategoryTotal[], maxSlices = 6): DonutSlice[] {
  const positive = rows.filter((r) => r.total > 0);
  const total = positive.reduce((s, r) => s + r.total, 0);
  if (total === 0) return [];
  const toSlice = (r: CategoryTotal): DonutSlice => ({
    key: r.categoryId ?? 'sem-categoria',
    label: r.name,
    icon: r.icon,
    color: r.color,
    value: r.total,
    share: r.total / total,
  });
  const limit = Math.max(1, Math.floor(maxSlices));
  if (positive.length <= limit) return positive.map(toSlice);
  const head = positive.slice(0, limit - 1).map(toSlice);
  const rest = positive.slice(limit - 1);
  const restTotal = rest.reduce((s, r) => s + r.total, 0);
  head.push({
    key: 'outras',
    label: `Outras (${rest.length} categorias)`,
    icon: '📦',
    color: OTHER_SLICE_COLOR,
    value: restTotal,
    share: restTotal / total,
  });
  return head;
}

/* ------------------------------------------------------------------ */
/* Lançamentos                                                         */
/* ------------------------------------------------------------------ */

/**
 * Últimos lançamentos já ocorridos (date <= today), do mais recente para o mais antigo
 * (empate: criado por último primeiro, depois id). Lançamentos futuros (agendados) ficam de fora.
 */
export function recentTransactions(transactions: Transaction[], today: ISODate, limit = 5): Transaction[] {
  if (limit <= 0) return [];
  return transactions
    .filter((tx) => tx.date <= today)
    .sort(
      (a, b) =>
        (a.date === b.date ? 0 : a.date > b.date ? -1 : 1) ||
        (a.createdAt === b.createdAt ? 0 : a.createdAt > b.createdAt ? -1 : 1) ||
        (a.id === b.id ? 0 : a.id > b.id ? -1 : 1),
    )
    .slice(0, Math.floor(limit));
}

/** Complemento de tempo para frases: 'hoje', 'amanhã', 'ontem' ou 'em 05/10/2026'. */
export function whenPhrase(date: ISODate, today: ISODate): string {
  const rel = formatDateRelative(date, today);
  return rel === 'hoje' || rel === 'amanhã' || rel === 'ontem' ? rel : `em ${rel}`;
}

/** Efeito com sinal para exibição: receita +, despesa −, transferência 0 (só move entre contas). */
export function displayAmount(tx: Pick<Transaction, 'type' | 'amount'>): Cents {
  if (tx.type === 'receita') return tx.amount;
  if (tx.type === 'despesa') return -tx.amount;
  return 0;
}

/* ------------------------------------------------------------------ */
/* Primeiros passos                                                    */
/* ------------------------------------------------------------------ */

export interface FirstStep {
  key: 'contas' | 'lancamento' | 'orcamento' | 'meta' | 'assistente';
  label: string;
  description: string;
  to: string;
  cta: string;
  done: boolean;
}

/** Checklist do primeiro uso. `hasChatted` = o usuário já mandou alguma mensagem ao agente. */
export function firstSteps(
  data: Pick<FinanceData, 'accounts' | 'transactions' | 'budgets' | 'goals' | 'settings'>,
  hasChatted: boolean,
): FirstStep[] {
  const agent = data.settings.agentName?.trim() || 'Pat';
  return [
    {
      key: 'contas',
      label: 'Cadastre suas contas',
      description: 'Conta corrente, poupança, carteira e cartões, com o saldo de hoje.',
      to: ROUTES.accounts,
      cta: 'Cadastrar contas',
      done: data.accounts.some((a) => !a.archived),
    },
    {
      key: 'lancamento',
      label: 'Registre o primeiro lançamento',
      description: 'Comece pelo salário e pelos gastos fixos (aluguel, contas, assinaturas).',
      to: newTransactionPath('despesa'),
      cta: 'Novo lançamento',
      done: data.transactions.length > 0,
    },
    {
      key: 'orcamento',
      label: 'Defina um orçamento',
      description: 'Um limite mensal para as categorias que mais pesam, como mercado e restaurantes.',
      to: ROUTES.budgets,
      cta: 'Criar orçamento',
      done: data.budgets.length > 0,
    },
    {
      key: 'meta',
      label: 'Crie uma meta',
      description: 'Reserva de emergência, viagem, troca do carro… com prazo e valor.',
      to: ROUTES.goals,
      cta: 'Criar meta',
      done: data.goals.length > 0,
    },
    {
      key: 'assistente',
      label: `Converse com o ${agent}`,
      description: 'Registre gastos escrevendo “gastei 50 no mercado” e tire dúvidas sobre o seu dinheiro.',
      to: ROUTES.assistant,
      cta: `Falar com o ${agent}`,
      done: hasChatted,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Saúde financeira                                                    */
/* ------------------------------------------------------------------ */

export const HEALTH_GRADE_LABELS: Record<HealthGrade, string> = {
  excelente: 'Excelente',
  boa: 'Boa',
  regular: 'Regular',
  atencao: 'Atenção',
  critica: 'Crítica',
};

/** Tom da barra de um componente: >= 70 positivo, >= 40 atenção, senão negativo. */
export function componentTone(score: number): 'positive' | 'warning' | 'negative' {
  if (score >= 70) return 'positive';
  if (score >= 40) return 'warning';
  return 'negative';
}

/**
 * Componente que mais tira pontos da nota: maior (100 − score) × peso (empate: ordem original).
 * null se todos estiverem com nota máxima.
 */
export function weakestComponent(components: HealthComponent[]): HealthComponent | null {
  let worst: HealthComponent | null = null;
  let worstLoss = 0;
  for (const c of components) {
    const loss = (100 - c.score) * c.weight;
    if (loss > worstLoss) {
      worst = c;
      worstLoss = loss;
    }
  }
  return worst;
}

/* ------------------------------------------------------------------ */
/* Metas                                                               */
/* ------------------------------------------------------------------ */

export const GOAL_TRACK_META: Record<GoalTrack, { label: string; tone: BadgeTone }> = {
  no_ritmo: { label: 'No ritmo', tone: 'positive' },
  atrasada: { label: 'Atrasada', tone: 'warning' },
  vencida: { label: 'Prazo vencido', tone: 'negative' },
  sem_prazo: { label: 'Sem prazo', tone: 'neutral' },
  concluida: { label: 'Concluída', tone: 'positive' },
  pausada: { label: 'Pausada', tone: 'neutral' },
};
