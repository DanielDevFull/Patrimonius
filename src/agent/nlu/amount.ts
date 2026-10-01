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

/** Centavos por extenso depois do valor: "(45 reais) e 90 centavos", "(R$ 50) com trinta centavos". */
function centsTail(t: string, end: number): { cents: number; length: number } | null {
  const rest = t.slice(end);
  const digits = /^\s+(?:e|com)\s+(\d{1,2})\s+centavos?(?![a-z])/.exec(rest);
  if (digits) return { cents: Number(digits[1]), length: digits[0].length };
  const lead = /^\s+(?:e|com)\s+/.exec(rest);
  if (!lead) return null;
  const toks = tokenize(rest.slice(lead[0].length));
  const w = readWordNumber(toks, 0);
  if (!w || toks[0].start !== 0 || w.value < 1 || w.value > 99) return null;
  const tail = /^\s+centavos?(?![a-z])/.exec(rest.slice(lead[0].length + toks[w.last].end));
  if (!tail) return null;
  return { cents: w.value, length: lead[0].length + toks[w.last].end + tail[0].length };
}

/** Todos os valores monetários do texto (já dobrado), na ordem em que aparecem. */
export function findAmounts(t: string): AmountMatch[] {
  const blocked = nonMoneyRanges(t);
  const found: AmountMatch[] = [];

  // 1) Numéricos: "R$ 45,90", "45.90", "1.200", "1,5 mil", "2k", "3 mil e 500", "50 reais" e, só depois de "R$",
  //    milhar separado por espaço ("R$ 1 234,56"; sem o símbolo, "2 300" pode ser quantidade + valor).
  const re =
    /(?<![\d.,/a-z])(?:(r\$\s*)(\d{1,3}(?: \d{3})+(?:,\d{1,2})?)(?![\d.,])|(r\$\s*)?(\d[\d.,]*\d|\d))(?:\s*(mil|k)(?![a-z]))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const start = m.index;
    let end = m.index + m[0].length;
    const span = { start, end };
    if (overlaps(span, blocked) || overlaps(span, found)) continue;
    const hasSymbol = Boolean(m[1] ?? m[3]);
    const numeric = m[2] ?? m[4];
    const scale = m[5];
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
    const cents = !scale && !/[.,]\d{1,2}$/.test(numeric) ? centsTail(t, end) : null;
    if (cents) {
      value += cents.cents;
      end += cents.length;
    }
    found.push({
      start,
      end,
      amount: value,
      strong: hasSymbol || Boolean(scale) || Boolean(curAfter) || Boolean(cents) || /[.,]\d{1,2}$/.test(numeric),
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
    const cents = cur ? centsTail(t, end) : null;
    if (cents) end += cents.length;
    found.push({ start, end, amount: w.value * 100 + (cents?.cents ?? 0), strong: Boolean(cur) || w.big });
  }

  return found.sort((a, b) => a.start - b.start);
}

/** Escolhe o valor principal: o primeiro com marcador forte, senão o primeiro encontrado. */
export function pickAmount(list: AmountMatch[]): AmountMatch | null {
  return list.find((a) => a.strong) ?? list[0] ?? null;
}

/** Palavras que, logo depois de um número, indicam que ele NÃO é uma quantidade de itens ("50 no mercado"). */
const NOT_AN_ITEM = new Set([
  'no', 'na', 'nos', 'nas', 'em', 'de', 'do', 'da', 'dos', 'das', 'com', 'pra', 'para', 'pro', 'por', 'pelo',
  'pela', 'e', 'ou', 'a', 'o', 'as', 'os', 'um', 'uma', 'ate', 'hoje', 'ontem', 'mil', 'k',
]);
/** Preço citado depois da quantidade: "2 pizzas de 40", "3 cervejas por 15", "2 cafés a 8 cada". */
const PRICE_LEAD = /(?:^|\s)(?:de|por|a|custou|custaram|custando|cada|pagando|pagou|paguei|valor)\s*$/;

/**
 * Valor principal considerando quantidades: "comprei 2 pizzas de 40" => R$ 40,00 (quantidade 2), e não R$ 2,00.
 * Só quando nenhum valor tem marcador forte, o primeiro é um inteiro pequeno seguido de um item e um valor
 * posterior vem depois de "de/por/a/custou/cada". Senão, igual a `pickAmount`.
 */
export function pickAmountWithQuantity(
  list: AmountMatch[],
  t: string,
): { amount: AmountMatch | null; quantity?: number } {
  const fallback = { amount: pickAmount(list) };
  if (list.length < 2 || list.some((a) => a.strong)) return fallback;
  const first = list[0];
  if (!/^\d{1,2}$/.test(t.slice(first.start, first.end))) return fallback;
  const item = /^\s+([a-z]+)/.exec(t.slice(first.end));
  if (!item || NOT_AN_ITEM.has(item[1])) return fallback;
  const price = list.slice(1).find((a) => PRICE_LEAD.test(t.slice(first.end, a.start)));
  if (!price) return fallback;
  return { amount: price, quantity: first.amount / 100 };
}

/**
 * Extrai valor monetário: 'R$ 45,90', '45,90', '45.90', '50 reais', '1.200', '1,5 mil', '2k', 'cem reais',
 * 'mil e quinhentos', 'duzentos e cinquenta'. Não confunde com parcelas ('10x'), dias ('dia 15'),
 * datas ('15/09'), anos ('dezembro de 2027') nem quantidades ('8 meses').
 * `match` é o trecho do texto ORIGINAL que corresponde ao valor.
 */
export function extractAmount(text: string): { amount: Cents; match: string } | null {
  if (typeof text !== 'string' || !text) return null;
  const folded = fold(text);
  const best = pickAmountWithQuantity(findAmounts(folded), folded).amount;
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
