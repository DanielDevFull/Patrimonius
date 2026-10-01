/**
 * Extração de períodos em pt-BR ('este mês', 'mês passado', 'em setembro', 'últimos 3 meses'...).
 */
import {
  addDays,
  addMonths,
  addMonthsToKey,
  endOfMonth,
  formatMonthLong,
  makeISO,
  monthKey,
  parseISO,
  startOfMonth,
  weekday,
} from '@/domain/dates';
import type { ISODate, MonthKey } from '@/domain/types';
import type { Period } from '../types';
import { MONTH_ABBR, MONTH_FULL, MONTH_FULL_RE, monthNumber } from './dates';
import { readWordNumber, toInt } from './numbers';
import { expandSlang, fold, tokenize } from './text';

export interface PeriodMatch {
  period: Period;
  /** Mês único coberto pelo período (quando o período é exatamente um mês do calendário). */
  month: MonthKey | null;
  start: number;
  end: number;
}

function monthPeriod(key: MonthKey, label: string): Period {
  return { start: startOfMonth(key), end: endOfMonth(key), label };
}

function yearPeriod(year: number, label: string): Period {
  return { start: makeISO(year, 1, 1), end: makeISO(year, 12, 31), label };
}

/** Semana de segunda a domingo que contém `date`. */
function weekPeriod(date: ISODate, label: string): Period {
  const start = addDays(date, -((weekday(date) + 6) % 7));
  return { start, end: addDays(start, 6), label };
}

function countFrom(raw: string): number | null {
  const direct = toInt(raw);
  if (direct !== null) return direct;
  const toks = tokenize(raw);
  const w = readWordNumber(toks, 0);
  return w && toks[w.last].end === raw.length ? w.value : null;
}

const UNIT_LABEL: Record<string, [string, string, string]> = {
  // unidade => [singular, plural, gênero (o/a)]
  dia: ['dia', 'dias', 'o'],
  semana: ['semana', 'semanas', 'a'],
  mes: ['mês', 'meses', 'o'],
  ano: ['ano', 'anos', 'o'],
};

function unitOf(raw: string): keyof typeof UNIT_LABEL {
  if (raw.startsWith('dia')) return 'dia';
  if (raw.startsWith('semana')) return 'semana';
  if (raw.startsWith('ano')) return 'ano';
  return 'mes';
}

/**
 * Encontra um período no texto JÁ dobrado (e com gírias expandidas). Ordem de prioridade fixa:
 * janelas ("últimos N"), mês retrasado/passado/próximo, semanas, anos, mês nomeado, este mês, dias.
 */
export function findPeriod(t: string, today: ISODate): PeriodMatch | null {
  const curKey = monthKey(today);
  const { year: curYear, month: curMonth } = parseISO(today);
  const rules: [RegExp, (m: RegExpExecArray) => { period: Period; month: MonthKey | null } | null][] = [
    [
      /\bultim[oa]s\s+(\d{1,3}|[a-z]+(?:\s+e\s+[a-z]+)?)\s+(dias|semanas|meses|anos)\b/,
      (m) => {
        const n = countFrom(m[1]);
        if (!n || n < 1) return null;
        const unit = unitOf(m[2]);
        const [sing, plur, g] = UNIT_LABEL[unit];
        const label = `últim${g}${n === 1 ? '' : 's'} ${n} ${n === 1 ? sing : plur}`;
        let start: ISODate;
        if (unit === 'dia') start = addDays(today, -(n - 1));
        else if (unit === 'semana') start = addDays(today, -(7 * n - 1));
        else start = addDays(addMonths(today, unit === 'ano' ? -12 * n : -n), 1);
        return { period: { start, end: today, label }, month: null };
      },
    ],
    [
      /\bproxim[oa]s\s+(\d{1,3}|[a-z]+(?:\s+e\s+[a-z]+)?)\s+(dias|semanas|meses)\b/,
      (m) => {
        const n = countFrom(m[1]);
        if (!n || n < 1) return null;
        const unit = unitOf(m[2]);
        const [sing, plur, g] = UNIT_LABEL[unit];
        const label = `próxim${g}${n === 1 ? '' : 's'} ${n} ${n === 1 ? sing : plur}`;
        let end: ISODate;
        if (unit === 'dia') end = addDays(today, n - 1);
        else if (unit === 'semana') end = addDays(today, 7 * n - 1);
        else end = addDays(addMonths(today, n), -1);
        return { period: { start: today, end, label }, month: null };
      },
    ],
    [
      /\bmes\s+retrasado\b/,
      () => {
        const key = addMonthsToKey(curKey, -2);
        return { period: monthPeriod(key, 'mês retrasado'), month: key };
      },
    ],
    [
      /\b(?:mes\s+(?:passado|anterior)|ultimo\s+mes)\b/,
      () => {
        const key = addMonthsToKey(curKey, -1);
        return { period: monthPeriod(key, 'mês passado'), month: key };
      },
    ],
    [
      /\b(?:proximo\s+mes|mes\s+que\s+vem|mes\s+seguinte)\b/,
      () => {
        const key = addMonthsToKey(curKey, 1);
        return { period: monthPeriod(key, 'próximo mês'), month: key };
      },
    ],
    [
      /\b(?:semana\s+(?:passada|anterior)|ultima\s+semana)\b/,
      () => ({ period: weekPeriod(addDays(today, -7), 'semana passada'), month: null }),
    ],
    [
      /\b(?:proxima\s+semana|semana\s+que\s+vem)\b/,
      () => ({ period: weekPeriod(addDays(today, 7), 'próxima semana'), month: null }),
    ],
    [
      /\b(?:(?:est|ess|nest|ness|dest|dess)a|da|na)\s+semana\b/,
      () => ({ period: weekPeriod(today, 'esta semana'), month: null }),
    ],
    [
      /\b(?:ano\s+(?:passado|anterior)|ultimo\s+ano)\b/,
      () => ({ period: yearPeriod(curYear - 1, 'ano passado'), month: null }),
    ],
    [
      /\b(?:(?:est|ess|nest|ness|dest|dess)e\s+ano|no\s+ano|do\s+ano|ano\s+atual)\b(?!\s+(?:de|que vem|passado))/,
      () => ({ period: yearPeriod(curYear, 'este ano'), month: null }),
    ],
    [
      new RegExp(
        `\\b(${MONTH_FULL_RE}|${Object.keys(MONTH_ABBR).join('|')})\\s*(?:de\\s+|/\\s*)(\\d{4}|\\d{2})\\b`,
      ),
      (m) => {
        const month = monthNumber(m[1]);
        if (!month) return null;
        const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
        const key = makeISO(year, month, 1).slice(0, 7);
        return { period: monthPeriod(key, formatMonthLong(key)), month: key };
      },
    ],
    [
      new RegExp(`\\b(${MONTH_FULL_RE})\\b`),
      (m) => {
        const month = MONTH_FULL[m[1]];
        // Mês que ainda não chegou neste ano => o do ano anterior (consultas são sobre o passado).
        const year = month > curMonth ? curYear - 1 : curYear;
        const key = makeISO(year, month, 1).slice(0, 7);
        return { period: monthPeriod(key, formatMonthLong(key)), month: key };
      },
    ],
    [
      /\b(?:em|no\s+ano\s+de|ano\s+de|durante|desde)\s+((?:19|20)\d{2})\b/,
      (m) => ({ period: yearPeriod(Number(m[1]), m[1]), month: null }),
    ],
    [
      /\b(?:(?:est|ess|nest|ness|dest|dess)e|no|do|neste)\s+mes\b|\bmes\s+(?:atual|corrente)\b/,
      () => ({ period: monthPeriod(curKey, 'este mês'), month: curKey }),
    ],
    [/\bdepois\s+de\s+amanha\b/, () => single(addDays(today, 2), 'depois de amanhã')],
    [/\b(?:anteontem|antes\s+de\s+ontem)\b/, () => single(addDays(today, -2), 'anteontem')],
    [/\bamanha\b/, () => single(addDays(today, 1), 'amanhã')],
    [/\bontem\b/, () => single(addDays(today, -1), 'ontem')],
    [/\bhoje\b/, () => single(today, 'hoje')],
  ];
  for (const [re, build] of rules) {
    const m = re.exec(t);
    if (!m) continue;
    const res = build(m);
    if (res) return { ...res, start: m.index, end: m.index + m[0].length };
  }
  return null;
}

function single(date: ISODate, label: string): { period: Period; month: null } {
  return { period: { start: date, end: date, label }, month: null };
}

/**
 * Extrai um período: 'hoje', 'ontem', 'esta semana', 'semana passada', 'este mês', 'mês passado',
 * 'em setembro' (do ano corrente, ou do anterior se o mês ainda não chegou), 'setembro de 2025',
 * 'este ano', 'ano passado', 'em 2025', 'últimos 3 meses', 'últimos 30 dias', 'próximos 7 dias'.
 *
 * Convenções: semanas vão de segunda a domingo; meses e anos são do calendário (1º ao último dia);
 * "últimos N meses/dias" é uma janela móvel terminando hoje (ex.: últimos 30 dias = hoje e os 29 anteriores).
 */
export function extractPeriod(text: string, today: ISODate): Period | null {
  if (typeof text !== 'string' || !text) return null;
  return findPeriod(expandSlang(fold(text)), today)?.period ?? null;
}
