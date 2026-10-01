/**
 * Formatação e parse compartilhados pelas telas de Dívidas, Patrimônio e Simuladores.
 * Funções puras (sem React) — fáceis de testar.
 */
import { addMonthsToKey, formatMonthLong, formatMonthShort, monthKey } from '@/domain/dates';
import { capitalize, plural } from '@/domain/text';
import type { ISODate } from '@/domain/types';

const rateFmts = new Map<number, Intl.NumberFormat>();
function rateFmt(digits: number): Intl.NumberFormat {
  let fmt = rateFmts.get(digits);
  if (!fmt) {
    fmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits });
    rateFmts.set(digits, fmt);
  }
  return fmt;
}
const rateInputFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4, useGrouping: false });

/** Número em pt-BR (casas conforme o formatador), sem '-0'. */
function formatRateNumber(value: number, fmt: Intl.NumberFormat): string {
  if (!Number.isFinite(value)) return '—';
  const s = fmt.format(value).replace(/[\u00a0\u202f]/g, ' ');
  return s === '-0' ? '0' : s;
}

/** 2.5 -> '2,5%'; 12 -> '12%'; 0.12345 -> '0,12%' (ou '0,1235%' com digits = 4). */
export function formatRate(pct: number, digits = 2): string {
  const s = formatRateNumber(pct, rateFmt(digits));
  return s === '—' ? s : `${s}%`;
}

/** Taxa para preencher um campo de texto: 2.5 -> '2,5'; 0.79741 -> '0,7974'. */
export function rateToInput(pct: number): string {
  return formatRateNumber(pct, rateInputFmt);
}

/** Variação com sinal: 0.052 -> '+5,2%'; -0.1 -> '-10%'; 0 -> '0%'. */
export function formatSignedPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—';
  const pct = Math.round(ratio * 1000) / 10;
  if (pct === 0) return '0%';
  return `${pct > 0 ? '+' : '-'}${formatRate(Math.abs(pct))}`;
}

/**
 * Parse de uma taxa digitada pelo usuário: '2,5', '2.5', '2,5%', ' 12 % ', '1,5 a.m.'.
 * Retorna null para vazio, texto inválido ou negativo.
 */
export function parsePercent(input: string): number | null {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/a\.?\s?[ma]\.?$/, '')
    .replace(/%/g, '')
    .replace(/\s+/g, '');
  if (!/^\d+([.,]\d+)?$/.test(s) && !/^[.,]\d+$/.test(s)) return null;
  const value = Number(s.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/** Parse de um inteiro positivo (prazo, parcelas). '' ou inválido => null. */
export function parsePositiveInt(input: string): number | null {
  const s = input.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** 0 -> '0 meses'; 5 -> '5 meses'; 12 -> '1 ano'; 27 -> '2 anos e 3 meses'. */
export function formatDuration(months: number): string {
  const total = Math.max(0, Math.round(months));
  const years = Math.floor(total / 12);
  const rest = total % 12;
  if (years === 0) return plural(rest, 'mês', 'meses');
  if (rest === 0) return plural(years, 'ano', 'anos');
  return `${plural(years, 'ano', 'anos')} e ${plural(rest, 'mês', 'meses')}`;
}

/** Mês (abreviado) que fica `offset` meses depois do mês de `today`: ('2026-10-15', 3) -> 'jan/27'. */
export function monthShortFrom(today: ISODate, offset: number): string {
  return formatMonthShort(addMonthsToKey(monthKey(today), offset));
}

/** Mês por extenso `offset` meses depois do mês de `today`: ('2026-10-15', 3) -> 'Janeiro de 2027'. */
export function monthLongFrom(today: ISODate, offset: number): string {
  return capitalize(formatMonthLong(addMonthsToKey(monthKey(today), offset)));
}
