/**
 * Extração de valores monetários e de parcelamento em pt-BR.
 */
import { parseMoney } from '@/domain/money';
import type { Cents } from '@/domain/types';
import { readWordNumber, toInt } from './numbers';
import { fold, tokenize, type Span } from './text';

const MONTHS_RE =
  'janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez';

const CURRENCY_SUFFIX =
  /^\s*(reais|real|conto|contos|pila|pilas|paus|pau|mangos|mango|pratas|dilmas)(?![a-z])/;
/** Unidades que indicam que o número NÃO é dinheiro ("10x", "8 meses", "30 dias", "10%"). */
const NON_MONEY_SUFFIX = new RegExp(
  `^\\s*(x(?![a-z])|vezes|vez(?![a-z])|parcelas?|prestac(?:ao|oes)|meses|mes(?![a-z])|dias?(?![a-z])|anos?(?![a-z])|semanas?|horas?|hrs?(?![a-z])|h(?![a-z])|min(?:utos)?(?![a-z])|%|por ?cento|pessoas|vezes|kg|km|litros?|l(?![a-z])|de (?:${MONTHS_RE})(?![a-z]))`,
);
const NON_MONEY_PREFIX = /(?:\bdia|\bdias|\bultim[oa]s?|\bproxim[oa]s?)\s*$/;
const YEAR_PREFIX = new RegExp(
  `(?:\\b(?:${MONTHS_RE})(?:\\s+de)?|\\bano(?:\\s+de)?|\\bem|\\bate|\\bdesde|\\bfinal de|\\bfim de|/)\\s*$`,
);

export interface AmountMatch extends Span {
  amount: Cents;
  /** Tem marcador forte de dinheiro (R$, "reais", decimais, "mil"/"k"). */
  strong: boolean;
}

/** Trechos que parecem número mas não são dinheiro: datas (15/09, 2026-09-15), horas, percentuais. */
function nonMoneyRanges(t: string): Span[] {
  const out: Span[] = [];
  const res = [
    /\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g,
    /\d{4}-\d{2}-\d{2}/g,
    /\d{1,2}[:h]\d{2}/g,
    /\d+(?:[.,]\d+)?\s*%/g,
  ];
  for (const re of res) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function overlaps(a: Span, list: Span[]): boolean {
  return list.some((b) => a.start < b.end && b.start < a.end);
}

/** Todos os valores monetários do texto (já dobrado), na ordem em que aparecem. */
export function findAmounts(t: string): AmountMatch[] {
  const blocked = nonMoneyRanges(t);
  const found: AmountMatch[] = [];

  // 1) Numéricos: "R$ 45,90", "45.90", "1.200", "1,5 mil", "2k", "3 mil e 500", "50 reais".
  const re = /(?<![\d.,/a-z])(r\$\s*)?(\d[\d.,]*\d|\d)(?:\s*(mil|k)(?![a-z]))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const start = m.index;
    let end = m.index + m[0].length;
    const span = { start, end };
    if (overlaps(span, blocked)) continue;
    const hasSymbol = Boolean(m[1]);
    const numeric = m[2];
    const scale = m[3];
    const after = t.slice(end);
    const before = t.slice(0, start);
    const cur = CURRENCY_SUFFIX.exec(after);
    if (!cur && /^[a-z/]/.test(after)) continue; // "13o", "10x", "10/..."
    if (!hasSymbol && !scale && !cur) {
      if (NON_MONEY_SUFFIX.test(after)) continue;
      if (NON_MONEY_PREFIX.test(before) && /^\d{1,2}$/.test(numeric)) continue;
      if (/^(19|20|21)\d{2}$/.test(numeric) && YEAR_PREFIX.test(before)) continue;
    }
    let value = parseMoney(scale ? `${numeric} ${scale}` : numeric);
    if (value === null || value <= 0) continue;
    if (scale) {
      // "3 mil e 500" / "2 mil e quinhentos"
      const rest = /^\s+e\s+(\d{1,3})(?![\d.,a-z])/.exec(after);
      if (rest) {
        value += Number(rest[1]) * 100;
        end += rest[0].length;
      } else {
        const tail = /^\s+e\s+/.exec(after);
        if (tail) {
          const toks = tokenize(t.slice(end + tail[0].length));
          const w = readWordNumber(toks, 0);
          if (w && w.value < 1000 && toks[0].start === 0) {
            value += w.value * 100;
            end += tail[0].length + toks[w.last].end;
          }
        }
      }
    }
    const curAfter = CURRENCY_SUFFIX.exec(t.slice(end));
    if (curAfter) end += curAfter[0].length;
    found.push({
      start,
      end,
      amount: value,
      strong: hasSymbol || Boolean(scale) || Boolean(curAfter) || /[.,]\d{1,2}$/.test(numeric),
    });
  }

  // 2) Por extenso: "cem reais", "mil e quinhentos", "duzentos e cinquenta", "vinte e cinco reais".
  const tokens = tokenize(t);
  for (let i = 0; i < tokens.length; i++) {
    const w = readWordNumber(tokens, i);
    if (!w) continue;
    const start = tokens[w.first].start;
    let end = tokens[w.last].end;
    i = w.last;
    if (overlaps({ start, end }, found)) continue;
    const after = t.slice(end);
    const before = t.slice(0, start);
    const cur = CURRENCY_SUFFIX.exec(after);
    if (!cur) {
      if (w.value < 10 && !w.big) continue;
      if (NON_MONEY_SUFFIX.test(after)) continue;
      if (NON_MONEY_PREFIX.test(before)) continue;
    } else {
      end += cur[0].length;
    }
    if (w.value <= 0) continue;
    found.push({ start, end, amount: w.value * 100, strong: Boolean(cur) || w.big });
  }

  return found.sort((a, b) => a.start - b.start);
}

/** Escolhe o valor principal: o primeiro com marcador forte, senão o primeiro encontrado. */
export function pickAmount(list: AmountMatch[]): AmountMatch | null {
  return list.find((a) => a.strong) ?? list[0] ?? null;
}

/**
 * Extrai valor monetário: 'R$ 45,90', '45,90', '45.90', '50 reais', '1.200', '1,5 mil', '2k', 'cem reais',
 * 'mil e quinhentos', 'duzentos e cinquenta'. Não confunde com parcelas ('10x'), dias ('dia 15'),
 * datas ('15/09'), anos ('dezembro de 2027') nem quantidades ('8 meses').
 * `match` é o trecho do texto ORIGINAL que corresponde ao valor.
 */
export function extractAmount(text: string): { amount: Cents; match: string } | null {
  if (typeof text !== 'string' || !text) return null;
  const best = pickAmount(findAmounts(fold(text)));
  return best ? { amount: best.amount, match: text.slice(best.start, best.end) } : null;
}

export interface InstallmentMatch extends Span {
  count: number;
}

/** Parcelamento: '10x', 'em 10 vezes', '12 parcelas', 'parcelado em 6', 'em dez vezes', 'à vista' (=1). */
export function findInstallments(t: string): InstallmentMatch | null {
  const vista = /(?<![a-z])a vista(?![a-z])/.exec(t);
  const re =
    /(?<![a-z0-9])(?:(?:parcelad[oa]|dividid[oa]|parcelei|dividi)\s+em\s+|em\s+)?(\d{1,2}|[a-z]+(?:\s+e\s+[a-z]+)?)\s*(x(?![a-z])|vezes|parcelas|prestacoes)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const raw = m[1];
    let n = toInt(raw);
    if (n === null) {
      const w = readWordNumber(tokenize(raw), 0);
      n = w && tokenize(raw)[w.last].end === raw.length ? w.value : null;
    }
    if (n !== null && n >= 1 && n <= 99) {
      return { start: m.index, end: m.index + m[0].length, count: n };
    }
  }
  const p = /(?:parcelad[oa]|parcelei|dividi|dividid[oa])\s+em\s+(\d{1,2})(?![\d.,])/.exec(t);
  if (p) return { start: p.index, end: p.index + p[0].length, count: Number(p[1]) };
  if (vista) return { start: vista.index, end: vista.index + vista[0].length, count: 1 };
  return null;
}
