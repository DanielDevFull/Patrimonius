/**
 * Helpers de texto do agente Pat (pt-BR). Funções puras, sem dependência de data/hora do sistema.
 *
 * Convenções das respostas:
 * - Valores com `formatBRL`, percentuais com `formatPercent`, meses com `formatMonthLong`.
 * - Em cards de gráfico (`AgentCard` do tipo 'chart'), `value` é SEMPRE em centavos (como todo dinheiro no app).
 */
import {
  MONTH_NAMES,
  WEEKDAYS,
  addMonthsToKey,
  endOfMonth,
  formatDateRelative,
  formatMonthLong,
  monthKey,
  parseISO,
  startOfMonth,
  weekday,
} from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import { capitalize, normalizeText } from '@/domain/text';
import type { Account, Cents, Frequency, ISODate, MonthKey, Settings } from '@/domain/types';
import type { CardTone, InsightSeverity, Period } from './types';

/* ------------------------------------------------------------------ */
/* Pessoa                                                              */
/* ------------------------------------------------------------------ */

/** Primeiro nome do usuário (ou '' quando não informado). */
export function firstName(settings: Pick<Settings, 'userName'>): string {
  const name = (settings.userName ?? '').trim();
  return name ? name.split(/\s+/)[0] : '';
}

/** 'Oi, Ana!' ou 'Oi!'. */
export function hello(name: string): string {
  return name ? `Oi, ${name}!` : 'Oi!';
}

/** Frase com vocativo: 'Ana, não entendi.' ou 'Não entendi.' (sem nome, primeira letra maiúscula). */
export function withVocative(name: string, sentence: string): string {
  return name ? `${name}, ${sentence}` : capitalize(sentence);
}

/* ------------------------------------------------------------------ */
/* Números                                                             */
/* ------------------------------------------------------------------ */

const numberFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** Número em pt-BR com até 1 casa decimal ('2,5'), sem '-0'. */
export function formatNumber(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return numberFmt.format(rounded === 0 ? 0 : rounded);
}

/** '0,8 mês', '1 mês', '2,5 meses'. */
export function formatMonthsCount(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return `${formatNumber(rounded)} ${rounded > 0 && rounded < 2 ? 'mês' : 'meses'}`;
}

/** Variação relativa (atual vs anterior) ou null quando não há base de comparação. */
export function relativeChange(current: number, previous: number): number | null {
  if (!(previous > 0)) return null;
  return (current - previous) / previous;
}

/** Valor em negrito para o texto do chat. */
export function bold(s: string): string {
  return `**${s}**`;
}

/** Valor monetário em negrito. */
export function money(cents: Cents): string {
  return bold(formatBRL(cents));
}

/** Mediana de valores inteiros (média dos dois centrais arredondada quando a quantidade é par). */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Quantas vezes por mês (em média) cada frequência acontece. */
const MONTHLY_FACTOR: Record<Frequency, number> = {
  semanal: 52 / 12,
  quinzenal: 26 / 12,
  mensal: 1,
  bimestral: 1 / 2,
  trimestral: 1 / 3,
  semestral: 1 / 6,
  anual: 1 / 12,
};

/** Custo mensal equivalente de um valor recorrente. */
export function monthlyEquivalent(amount: Cents, frequency: Frequency): Cents {
  return Math.round(amount * MONTHLY_FACTOR[frequency]);
}

/* ------------------------------------------------------------------ */
/* Listas e frases                                                     */
/* ------------------------------------------------------------------ */

/** 'A', 'A e B', 'A, B e C'. */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/** Linhas como lista do chat ('• item'). */
export function bullets(lines: string[]): string {
  return lines.map((l) => `• ${l}`).join('\n');
}

/** Junta parágrafos/frases ignorando vazios. */
export function paragraphs(parts: (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join('\n\n');
}

/** Junta frases na mesma linha ignorando vazios. */
export function sentences(parts: (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ');
}

/** Remove duplicadas (mantendo a ordem) e limita a quantidade de sugestões. */
export function uniqueSuggestions(list: string[], max = 4): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const key = normalizeText(s);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** Primeira letra maiúscula, preservando grafias como 'iFood'. */
export function capitalizeDescription(s: string): string {
  const text = s.trim();
  if (text.length >= 2 && text[1] !== text[1].toLowerCase()) return text;
  return capitalize(text);
}

/* ------------------------------------------------------------------ */
/* Datas e períodos                                                    */
/* ------------------------------------------------------------------ */

/** 'hoje', 'ontem', 'amanhã' ou 'em 05/10/2026'. */
export function dateRelative(date: ISODate, today: ISODate): string {
  const rel = formatDateRelative(date, today);
  return rel === 'hoje' || rel === 'ontem' || rel === 'amanhã' ? rel : `em ${rel}`;
}

/** 'quinta-feira, 1º de outubro'. */
export function formatDayLong(date: ISODate): string {
  const { month, day } = parseISO(date);
  return `${WEEKDAYS[weekday(date)]}, ${day === 1 ? '1º' : day} de ${MONTH_NAMES[month - 1]}`;
}

/** Período de um mês inteiro com rótulo amigável relativo a `today`. */
export function monthPeriod(month: MonthKey, today: ISODate): Period {
  const current = monthKey(today);
  let label = formatMonthLong(month);
  if (month === current) label = 'este mês';
  else if (month === addMonthsToKey(current, -1)) label = 'mês passado';
  return { start: startOfMonth(month), end: endOfMonth(month), label };
}

/** Mês coberto pelo período quando ele é exatamente um mês do calendário; senão null. */
export function periodMonth(period: Period): MonthKey | null {
  const key = monthKey(period.start);
  return period.start === startOfMonth(key) && period.end === endOfMonth(key) ? key : null;
}

const PERIOD_PREPOSITION: Record<string, string> = {
  'mês passado': 'no mês passado',
  'mês retrasado': 'no mês retrasado',
  'próximo mês': 'no próximo mês',
  'ano passado': 'no ano passado',
  'semana passada': 'na semana passada',
  'próxima semana': 'na próxima semana',
};

/**
 * Expressão adverbial para o período, pronta para compor frases:
 * 'este mês', 'no mês passado', 'em setembro de 2026', 'nos últimos 3 meses', 'em 15/09/2026', 'hoje'.
 */
export function periodPhrase(period: Period): string {
  const label = period.label;
  if (/^\d/.test(label)) return `em ${label}`;
  const window = /^(?:últim|próxim)([oa])(s?)\s/.exec(label);
  if (window) return `n${window[1]}${window[2]} ${label}`;
  if (PERIOD_PREPOSITION[label]) return PERIOD_PREPOSITION[label];
  if (MONTH_NAMES.some((m) => label.startsWith(m))) return `em ${label}`;
  return label;
}

/** Período com a primeira letra maiúscula para iniciar frases ('No mês passado', 'Este mês'). */
export function periodPhraseStart(period: Period): string {
  return capitalize(periodPhrase(period));
}

/* ------------------------------------------------------------------ */
/* Entidades                                                           */
/* ------------------------------------------------------------------ */

/** '🛒 Mercado' (ou só o nome, sem ícone). */
export function categoryLabel(category: { icon: string; name: string } | undefined | null): string {
  if (!category) return '❔ Sem categoria';
  const icon = category.icon.trim();
  return icon ? `${icon} ${category.name}` : category.name;
}

/** 'na conta Nubank', 'na Conta corrente', 'no Cartão Nubank', 'no cartão Visa'. */
export function accountPhrase(account: Pick<Account, 'name' | 'type'>): string {
  const n = normalizeText(account.name);
  if (account.type === 'cartao_credito') return n.startsWith('cartao') ? `no ${account.name}` : `no cartão ${account.name}`;
  if (n.startsWith('conta')) return `na ${account.name}`;
  if (n.startsWith('carteira')) return `na ${account.name}`;
  return `na conta ${account.name}`;
}

/* ------------------------------------------------------------------ */
/* Tons e severidades                                                  */
/* ------------------------------------------------------------------ */

export function toneOfAmount(cents: Cents): CardTone {
  if (cents < 0) return 'negative';
  if (cents > 0) return 'positive';
  return 'neutral';
}

export const SEVERITY_TONE: Record<InsightSeverity, CardTone> = {
  critico: 'negative',
  atencao: 'warning',
  info: 'neutral',
  positivo: 'positive',
};

export const SEVERITY_LABEL: Record<InsightSeverity, string> = {
  critico: 'Urgente',
  atencao: 'Atenção',
  info: 'Dica',
  positivo: 'Conquista',
};
