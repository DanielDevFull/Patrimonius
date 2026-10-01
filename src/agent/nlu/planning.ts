/**
 * Entidades de planejamento: nome/data-alvo/prazo de metas e mês de orçamento.
 */
import { endOfMonth, isISODate, makeISO, parseISO } from '@/domain/dates';
import type { ISODate, MonthKey } from '@/domain/types';
import { MONTH_FULL, MONTH_FULL_RE } from './dates';
import { CONNECTORS } from './mentions';
import { readWordNumber, toInt } from './numbers';
import { findPeriod } from './period';
import { tokenize, type Span, type Token } from './text';

const NAME_CUT = new Set([
  'ate',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'com',
  'valor',
  'por',
  'que',
  'durante',
  'daqui',
  'dentro',
  'para',
  'pra',
  'pro',
  'e',
  'ao',
  'mensal',
  'mensais',
  'reais',
  'real',
  'r$',
  'guardando',
  'juntando',
  'economizando',
  'poupando',
  'antes',
  'prazo',
  'meta',
]);
const NAME_LEAD_SKIP = new Set([
  'de',
  'da',
  'do',
  'para',
  'pra',
  'pro',
  'uma',
  'um',
  'o',
  'a',
  'nova',
  'novo',
  'chamada',
  'chamado',
  'com',
  'nome',
  'minha',
  'meu',
  'objetivo',
]);

function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Lê um nome a partir de `from` (texto com valores/datas mascarados por '#'). */
function readName(raw: string, tm: string, from: number): string | undefined {
  const toks = tokenize(tm).filter((tk) => tk.start >= from);
  let i = 0;
  while (i < toks.length && NAME_LEAD_SKIP.has(toks[i].text)) i++;
  const picked: Token[] = [];
  const gap = (a: Token, b: Token) => tm.slice(a.end, b.start).includes('#');
  while (i < toks.length && picked.length < 5) {
    const tk = toks[i];
    if (NAME_CUT.has(tk.text) || /^\d/.test(tk.text) || tk.text in MONTH_FULL) break;
    if (picked.length && gap(picked[picked.length - 1], tk)) break;
    if (CONNECTORS.has(tk.text)) {
      const next = toks[i + 1];
      if (
        !next ||
        gap(tk, next) ||
        NAME_CUT.has(next.text) ||
        /^\d/.test(next.text) ||
        next.text in MONTH_FULL
      )
        break;
    }
    picked.push(tk);
    i++;
  }
  while (picked.length && CONNECTORS.has(picked[picked.length - 1].text)) picked.pop();
  if (!picked.length) return undefined;
  return capitalizeFirst(raw.slice(picked[0].start, picked[picked.length - 1].end).trim());
}

export function goalName(raw: string, tm: string): string | undefined {
  const meta = /\b(?:metas?|objetivo)\b/.exec(tm);
  const fromMeta = meta ? readName(raw, tm, meta.index + meta[0].length) : undefined;
  if (fromMeta) return fromMeta;
  const para = /\b(?:para|pra|pro)\s+/g;
  let m: RegExpExecArray | null;
  while ((m = para.exec(tm))) {
    const name = readName(raw, tm, m.index + m[0].length);
    if (name) return name;
  }
  return undefined;
}

/** Ano da próxima ocorrência do mês (o próprio mês corrente conta). */
function nextYearFor(month: number, today: ISODate): number {
  const { year, month: cur } = parseISO(today);
  return month >= cur ? year : year + 1;
}

function endOfMonthISO(year: number, month: number): ISODate {
  return endOfMonth(makeISO(year, month, 1).slice(0, 7));
}

/** Data-alvo de meta: 'até dezembro de 2027', 'até o fim do ano', 'até 2028', 'até 15/12/2027', 'até o natal'. */
export function goalTargetDate(t: string, today: ISODate): ISODate | undefined {
  const { year } = parseISO(today);
  const monthRe = new RegExp(
    `\\b(?:ate|para|em|no|antes de)\\s+(?:o\\s+)?(?:(?:fim|final)\\s+de\\s+)?(${MONTH_FULL_RE})(?:\\s*(?:de|/)\\s*(\\d{4}|\\d{2}))?\\b`,
  );
  const mm = monthRe.exec(t);
  if (mm) {
    const month = MONTH_FULL[mm[1]];
    const y = mm[2] ? (mm[2].length === 2 ? 2000 + Number(mm[2]) : Number(mm[2])) : nextYearFor(month, today);
    return endOfMonthISO(y, month);
  }
  const dm = /\b(?:ate|para|em)\s+(?:o\s+dia\s+|dia\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/.exec(t);
  if (dm) {
    const day = Number(dm[1]);
    const month = Number(dm[2]);
    const y = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : nextYearFor(month, today);
    const iso = makeISO(y, month, day);
    if (isISODate(iso)) return iso;
  }
  const my = /\b(?:ate|para|em)\s+(\d{1,2})\/(\d{4})\b/.exec(t);
  if (my && Number(my[1]) >= 1 && Number(my[1]) <= 12) return endOfMonthISO(Number(my[2]), Number(my[1]));
  if (/\b(?:ate|para)\s+(?:o\s+)?(?:fim|final)\s+do\s+ano\s+que\s+vem\b/.test(t))
    return makeISO(year + 1, 12, 31);
  if (/\b(?:ate|para)\s+(?:o\s+)?(?:fim|final)\s+do\s+ano\b/.test(t)) return makeISO(year, 12, 31);
  const yy =
    /\b(?:ate|para|em)\s+(?:o\s+)?(?:(?:fim|final)\s+de\s+)?(?:ano\s+(?:de\s+)?)?((?:19|20)\d{2})\b/.exec(t);
  if (yy) return makeISO(Number(yy[1]), 12, 31);
  if (/\bnatal\b/.test(t)) {
    const xmas = makeISO(year, 12, 25);
    return xmas >= today ? xmas : makeISO(year + 1, 12, 25);
  }
  return undefined;
}

/** Prazo em meses: 'em 8 meses', 'daqui a 2 anos', 'em um ano', 'nos próximos seis meses'. */
export function goalMonths(t: string): { months: number; span: Span } | undefined {
  const re =
    /\b(?:em|daqui a|daqui|dentro de|nos proximos|durante|por|ate)\s+(\d{1,3}|[a-z]+(?:\s+e\s+[a-z]+)?)\s+(meses|mes|anos|ano)\b/;
  const m = re.exec(t);
  if (!m) return undefined;
  let n = toInt(m[1]);
  if (n === null) {
    const toks = tokenize(m[1]);
    const w = readWordNumber(toks, 0);
    n = w && toks[w.last].end === m[1].length ? w.value : null;
  }
  if (!n || n < 1) return undefined;
  return {
    months: m[2].startsWith('ano') ? n * 12 : n,
    span: { start: m.index, end: m.index + m[0].length },
  };
}

/* ------------------------------------------------------------------ */
/* Orçamento                                                           */
/* ------------------------------------------------------------------ */

/**
 * Mês do orçamento: null (padrão para todos os meses) salvo quando o texto cita um mês específico
 * ("este mês", "só este mês", "mês que vem", "em novembro" — mês sem ano é o próximo, já que orçamento é planejamento).
 */
export function budgetMonth(tc: string, today: ISODate): MonthKey | null {
  if (
    /\b(por mes|todo mes|todos os meses|mensal|mensais|mensalmente|ao mes|cada mes|padrao|sempre|fixo)\b/.test(
      tc,
    )
  ) {
    return null;
  }
  const bare = new RegExp(`\\b(${MONTH_FULL_RE})\\b(?!\\s*(?:de\\s+|/\\s*)\\d)`).exec(tc);
  if (bare) {
    const month = MONTH_FULL[bare[1]];
    return makeISO(nextYearFor(month, today), month, 1).slice(0, 7);
  }
  return findPeriod(tc, today)?.month ?? null;
}
