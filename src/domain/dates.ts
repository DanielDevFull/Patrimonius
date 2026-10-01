import type { ISODate, MonthKey } from './types';

/**
 * Utilitários de data trabalhando com strings 'YYYY-MM-DD' (sem fuso horário).
 * Internamente usam Date em UTC para evitar problemas de horário de verão.
 */

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export { MONTH_NAMES, MONTH_SHORT, WEEKDAYS };

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

/** Data local de hoje como 'YYYY-MM-DD'. */
export function todayISO(now: Date = new Date()): ISODate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/** Primeiro ano aceito em datas digitadas pelo usuário. */
export const MIN_PLAUSIBLE_YEAR = 1900;
/** Quantos anos depois do ano corrente uma data digitada ainda é aceita. */
export const MAX_YEARS_AHEAD = 10;

/** Limites [min, max] de datas plausíveis para campos de data (também usados em `min`/`max` do <input type="date">). */
export function plausibleDateRange(today: ISODate): { min: ISODate; max: ISODate } {
  return {
    min: makeISO(MIN_PLAUSIBLE_YEAR, 1, 1),
    max: makeISO(parseISO(today).year + MAX_YEARS_AHEAD, 12, 31),
  };
}

/**
 * Data válida E plausível para um lançamento digitado: ano entre 1900 e o ano corrente + 10.
 * Pega erros de digitação no ano (ex.: '0226-01-10' ou '2062-01-10'), que gravariam um lançamento
 * que mexe no saldo mas fica escondido fora dos meses que o usuário navega.
 */
export function isPlausibleDate(value: unknown, today: ISODate): value is ISODate {
  if (!isISODate(value)) return false;
  const { min, max } = plausibleDateRange(today);
  return value >= min && value <= max;
}

export function isMonthKey(value: unknown): value is MonthKey {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Partes numéricas de uma ISODate. */
export function parseISO(date: ISODate): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

export function makeISO(year: number, month: number, day: number): ISODate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** Número de dias do mês (month 1-12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toUTC(date: ISODate): Date {
  const { year, month, day } = parseISO(date);
  return new Date(Date.UTC(year, month - 1, day));
}

function fromUTC(d: Date): ISODate {
  return makeISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = toUTC(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTC(d);
}

/**
 * Soma meses mantendo o dia, limitado ao último dia do mês de destino.
 * Ex.: addMonths('2026-01-31', 1) => '2026-02-28'.
 * Se `anchorDay` for informado, ele é usado como dia preferido (útil para recorrências: 31 -> 28 -> 31).
 */
export function addMonths(date: ISODate, months: number, anchorDay?: number): ISODate {
  const { year, month, day } = parseISO(date);
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const wanted = anchorDay ?? day;
  return makeISO(y, m, Math.min(wanted, daysInMonth(y, m)));
}

/** Diferença em dias (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

/** Dia da semana: 0 = domingo ... 6 = sábado. */
export function weekday(date: ISODate): number {
  return toUTC(date).getUTCDay();
}

export function monthKey(date: ISODate): MonthKey {
  return date.slice(0, 7);
}

export function addMonthsToKey(key: MonthKey, months: number): MonthKey {
  return monthKey(addMonths(`${key}-01`, months));
}

/** Diferença em meses entre dois MonthKey (b - a). */
export function diffMonths(a: MonthKey, b: MonthKey): number {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

export function startOfMonth(key: MonthKey): ISODate {
  return `${key}-01`;
}

export function endOfMonth(key: MonthKey): ISODate {
  const [y, m] = key.split('-').map(Number);
  return makeISO(y, m, daysInMonth(y, m));
}

export function daysInMonthKey(key: MonthKey): number {
  const [y, m] = key.split('-').map(Number);
  return daysInMonth(y, m);
}

/** Lista de MonthKeys terminando em `end` (inclusive), em ordem cronológica. */
export function lastMonths(end: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, i) => addMonthsToKey(end, i - count + 1));
}

/** true se a <= date <= b (comparação lexicográfica de ISODate é válida). */
export function isBetween(date: ISODate, a: ISODate, b: ISODate): boolean {
  return date >= a && date <= b;
}

export function isInMonth(date: ISODate, key: MonthKey): boolean {
  return date.startsWith(key);
}

/** '2026-10' -> 'outubro de 2026' */
export function formatMonthLong(key: MonthKey): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} de ${y}`;
}

/** '2026-10' -> 'out/26' */
export function formatMonthShort(key: MonthKey): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_SHORT[m - 1]}/${String(y).slice(2)}`;
}

/** '2026-10-05' -> '05/10/2026' */
export function formatDateBR(date: ISODate): string {
  const { year, month, day } = parseISO(date);
  return `${pad(day)}/${pad(month)}/${year}`;
}

/** '2026-10-05' -> '05 out' */
export function formatDateShort(date: ISODate): string {
  const { month, day } = parseISO(date);
  return `${pad(day)} ${MONTH_SHORT[month - 1]}`;
}

/**
 * Rótulo relativo amigável: 'hoje', 'ontem', 'amanhã', ou '05/10/2026'.
 */
export function formatDateRelative(date: ISODate, today: ISODate): string {
  const d = diffDays(today, date);
  if (d === 0) return 'hoje';
  if (d === -1) return 'ontem';
  if (d === 1) return 'amanhã';
  return formatDateBR(date);
}

export function nowTimestamp(): string {
  return new Date().toISOString();
}
