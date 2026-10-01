/**
 * Extração de datas em pt-BR ('hoje', 'ontem', 'dia 15', '15/09', '15 de setembro', 'sexta passada'...).
 */
import {
  addDays,
  addMonths,
  daysInMonth,
  diffDays,
  isISODate,
  makeISO,
  parseISO,
  weekday,
} from '@/domain/dates';
import type { ISODate } from '@/domain/types';
import { toInt } from './numbers';
import { fold, type Span } from './text';

/** Nomes (dobrados) dos meses => número 1-12. Abreviações só valem junto de números ('15 set', 'set/25'). */
export const MONTH_FULL: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};
export const MONTH_ABBR: Record<string, number> = {
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12,
};
export const MONTH_FULL_RE = Object.keys(MONTH_FULL).join('|');
const MONTH_ANY_RE = `${MONTH_FULL_RE}|${Object.keys(MONTH_ABBR).join('|')}`;

export function monthNumber(word: string): number | null {
  return MONTH_FULL[word] ?? MONTH_ABBR[word] ?? null;
}

const WEEKDAY_INDEX: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

export interface DateMatch extends Span {
  date: ISODate;
}

/** Ano de 2 ou 4 dígitos => 4 dígitos. */
function fullYear(raw: string): number {
  const y = Number(raw);
  return raw.length === 2 ? 2000 + y : y;
}

/**
 * Data sem ano (dd/mm, '15 de setembro'): usa o ano corrente; se isso cair mais de ~6 meses no futuro
 * (ex.: '28/12' dito em janeiro), entende-se que é do ano anterior.
 */
function resolveYearless(month: number, day: number, today: ISODate): ISODate | null {
  const { year } = parseISO(today);
  let iso = makeISO(year, month, day);
  if (!isISODate(iso)) return null;
  if (diffDays(today, iso) > 183) {
    iso = makeISO(year - 1, month, day);
    if (!isISODate(iso)) return null;
  }
  return iso;
}

/**
 * 'dia 15': dia do mês corrente. Se ainda não chegou (data no futuro), entende-se o mês ANTERIOR, porque
 * a NLU usa datas para registrar o que já aconteceu ("paguei dia 25" dito no dia 1º => dia 25 do mês passado).
 * Dias inexistentes no mês são limitados ao último dia (ex.: 'dia 31' em setembro => 30/09).
 */
function resolveDayOfMonth(day: number, today: ISODate): ISODate | null {
  if (day < 1 || day > 31) return null;
  const { year, month } = parseISO(today);
  let iso = makeISO(year, month, Math.min(day, daysInMonth(year, month)));
  if (iso > today) {
    const prev = parseISO(addMonths(`${year}-${String(month).padStart(2, '0')}-01`, -1));
    iso = makeISO(prev.year, prev.month, Math.min(day, daysInMonth(prev.year, prev.month)));
  }
  return iso;
}

/**
 * Dia da semana: sem qualificador => ocorrência mais recente até hoje (inclusive);
 * 'passada/passado' => mais recente ANTES de hoje; 'que vem'/'próxima' => próxima depois de hoje.
 */
function resolveWeekday(target: number, today: ISODate, mode: 'recent' | 'past' | 'next'): ISODate {
  const current = weekday(today);
  if (mode === 'next') {
    const ahead = (target - current + 7) % 7 || 7;
    return addDays(today, ahead);
  }
  let back = (current - target + 7) % 7;
  if (mode === 'past' && back === 0) back = 7;
  return addDays(today, -back);
}

/** Todas as datas encontradas no texto dobrado (ordenadas pela posição). */
export function findDates(t: string, today: ISODate): DateMatch[] {
  const out: DateMatch[] = [];
  const push = (m: RegExpExecArray, date: ISODate | null) => {
    if (!date) return;
    const span = { start: m.index, end: m.index + m[0].length };
    if (out.some((o) => span.start < o.end && o.start < span.end)) return;
    out.push({ ...span, date });
  };
  const each = (re: RegExp, fn: (m: RegExpExecArray) => ISODate | null) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) push(m, fn(m));
  };

  each(/\bdepois de amanha\b/g, () => addDays(today, 2));
  each(/\b(?:anteontem|antiontem|antes de ontem)\b/g, () => addDays(today, -2));
  each(/\bamanha\b/g, () => addDays(today, 1));
  each(/\bontem\b/g, () => addDays(today, -1));
  each(/\b(?:hoje|hj)\b/g, () => today);
  each(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => {
    const iso = `${m[1]}-${m[2]}-${m[3]}`;
    return isISODate(iso) ? iso : null;
  });
  each(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?![\d/])/g, (m) => {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (m[3]) {
      const iso = makeISO(fullYear(m[3]), month, day);
      return isISODate(iso) ? iso : null;
    }
    return month >= 1 && month <= 12 ? resolveYearless(month, day, today) : null;
  });
  each(
    new RegExp(
      `\\b(?:dia\\s+)?(\\d{1,2}|primeiro)\\s+(?:de\\s+)?(${MONTH_ANY_RE})\\b(?:\\s*(?:de|/)\\s*(\\d{4}))?`,
      'g',
    ),
    (m) => {
      const day = m[1] === 'primeiro' ? 1 : Number(m[1]);
      const month = monthNumber(m[2]);
      if (!month) return null;
      if (m[3]) {
        const iso = makeISO(Number(m[3]), month, day);
        return isISODate(iso) ? iso : null;
      }
      return resolveYearless(month, day, today);
    },
  );
  each(/\bdia\s+(\d{1,2}|primeiro|[a-z]+)\b/g, (m) => {
    const day = m[1] === 'primeiro' ? 1 : toInt(m[1]);
    return day === null ? null : resolveDayOfMonth(day, today);
  });
  each(
    /\b(?:(proxim[oa])\s+)?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:[\s-]*feira)?(?:\s+(passad[oa]|retrasad[oa]|que vem))?\b(?!\s+(?:parcela|prestacao|vez|via|opcao|etapa|mao|chamada))/g,
    (m) => {
      const target = WEEKDAY_INDEX[m[2]];
      if (m[1] || m[3] === 'que vem') return resolveWeekday(target, today, 'next');
      if (m[3]?.startsWith('retrasad')) return addDays(resolveWeekday(target, today, 'past'), -7);
      return resolveWeekday(target, today, m[3] ? 'past' : 'recent');
    },
  );
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Extrai uma data: 'hoje', 'ontem', 'anteontem', 'amanhã', 'dia 15', '15/09', '15/09/2026', '15 de setembro',
 * 'segunda', 'sexta passada'. Regras:
 * - 'dia N' => mês corrente; se N ainda não chegou, mês anterior (lançamentos são de fatos passados).
 * - 'dd/mm' sem ano => ano corrente (ou o anterior se cairia mais de 6 meses no futuro).
 * - dia da semana => ocorrência mais recente até hoje; com 'passada' => estritamente antes de hoje.
 * `match` é o trecho do texto ORIGINAL.
 */
export function extractDate(text: string, today: ISODate): { date: ISODate; match: string } | null {
  if (typeof text !== 'string' || !text) return null;
  const first = findDates(fold(text), today)[0];
  return first ? { date: first.date, match: text.slice(first.start, first.end) } : null;
}
