import type { Cents } from './types';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percentFmt = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

/** Normaliza espaços especiais (NBSP) que o Intl usa, facilitando testes e comparação. */
function normalizeSpaces(s: string): string {
  return s.replace(/[\u00a0\u202f]/g, ' ');
}

/** 123456 -> 'R$ 1.234,56' */
export function formatBRL(cents: Cents): string {
  return normalizeSpaces(brl.format(cents / 100));
}

/** 123456 -> '+R$ 1.234,56' / '-R$ 1.234,56' (zero sem sinal). */
export function formatSignedBRL(cents: Cents): string {
  if (cents === 0) return formatBRL(0);
  return (cents > 0 ? '+' : '-') + formatBRL(Math.abs(cents));
}

/** 123456789 -> 'R$ 1,2 mi' */
export function formatBRLCompact(cents: Cents): string {
  return normalizeSpaces(brlCompact.format(cents / 100));
}

/** 123456 -> '1.234,56' (sem símbolo, útil para inputs). */
export function formatDecimal(cents: Cents): string {
  return normalizeSpaces(decimal.format(cents / 100));
}

/** 0.1234 -> '12,3%' */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—';
  return normalizeSpaces(percentFmt.format(ratio));
}

/** Converte reais (number) em centavos inteiros com arredondamento correto. */
export function toCents(reais: number): Cents {
  return Math.round(reais * 100);
}

/** Converte centavos em reais (number) — use apenas para exibição/gráficos. */
export function fromCents(cents: Cents): number {
  return cents / 100;
}

/**
 * Faz o parse de um valor digitado pelo usuário em formato brasileiro ou internacional.
 * Aceita: '1.234,56', '1234,56', '1234.56', 'R$ 50', '50', '-12,5', '1,5 mil', '2 mil', '1.000'.
 * Retorna centavos ou null se não for um número válido.
 *
 * Regras de separador:
 * - Se houver vírgula e ponto, o último que aparecer é o separador decimal.
 * - Só vírgula: vírgula é decimal.
 * - Só ponto: se houver exatamente 3 dígitos após cada ponto (ex.: '1.000', '12.345.678') é separador de milhar;
 *   caso contrário é decimal ('12.5', '12.50').
 */
export function parseMoney(input: string): Cents | null {
  if (typeof input !== 'string') return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;
  let multiplier = 1;
  const milMatch = s.match(/^(.*?)\s*(mil|k)$/);
  if (milMatch) {
    multiplier = 1000;
    s = milMatch[1].trim();
  }
  s = s.replace(/r\$/g, '').replace(/reais|real/g, '').replace(/\s+/g, '');
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (!s || !/^[\d.,]+$/.test(s)) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      normalized = s.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = s.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    if ((s.match(/,/g) ?? []).length > 1) return null;
    normalized = s.replace(',', '.');
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    const thousands = parts.length > 1 && parts.slice(1).every((p) => p.length === 3) && parts[0].length > 0;
    if (thousands) {
      normalized = parts.join('');
    } else if (parts.length === 2) {
      normalized = s;
    } else {
      return null;
    }
  } else {
    normalized = s;
  }
  if (!/^\d*\.?\d*$/.test(normalized) || normalized === '.' || normalized === '') return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * multiplier * 100);
  return negative ? -cents : cents;
}

/** Soma segura de centavos. */
export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Divide `total` em `parts` parcelas inteiras cuja soma é exatamente `total` (centavos extras nas primeiras). */
export function splitCents(total: Cents, parts: number): Cents[] {
  if (parts <= 0 || !Number.isInteger(parts)) throw new Error('parts deve ser um inteiro positivo');
  const base = Math.trunc(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < Math.abs(remainder) ? Math.sign(remainder) : 0));
}

/** Razão segura (retorna null quando o denominador é 0). */
export function safeRatio(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

/* ------------------------------------------------------------------ */
/* Valores dentro de textos prontos (agente, insights, relatórios)      */
/* ------------------------------------------------------------------ */

export interface TextPart {
  text: string;
  /** true quando o trecho é um valor em reais (recebe a classe .money para o modo "ocultar valores"). */
  money: boolean;
}

/** Valores em reais dentro de um texto: 'R$ 1.234,56', '-R$ 10,00', 'R$ 50', 'R$ 1,2 mil'. */
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
