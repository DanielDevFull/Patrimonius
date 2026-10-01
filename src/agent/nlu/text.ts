/**
 * Utilitários de texto internos da NLU.
 *
 * A NLU trabalha sobre um texto "dobrado" (`fold`): minúsculo e sem acentos, mas com o MESMO comprimento
 * do original. Assim, qualquer índice encontrado por regex no texto dobrado vale também para o original,
 * o que permite devolver trechos (`match`) e descrições com a grafia que o usuário digitou.
 */

const COMBINING = /[̀-ͯ]/g;

/** Minúsculas + sem acentos, preservando o comprimento (1 caractere de entrada => 1 de saída). */
export function fold(input: string): string {
  let out = '';
  for (const ch of input.split('')) {
    const lower = ch.toLowerCase();
    const base = lower.normalize('NFD').replace(COMBINING, '');
    out += base.length === 1 ? base : lower.length === 1 ? lower : ch;
  }
  return out;
}

export interface Span {
  start: number;
  end: number;
}

export interface Token extends Span {
  /** Texto dobrado do token. */
  text: string;
}

/** Tokens alfanuméricos (números com separadores ficam inteiros: '45,90', '1.200'). */
export function tokenize(folded: string): Token[] {
  const tokens: Token[] = [];
  const re = /[a-z0-9$]+(?:[.,/][0-9]+)*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(folded))) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

/** Palavras (somente texto) de um texto dobrado. */
export function words(folded: string): string[] {
  return tokenize(folded).map((t) => t.text);
}

/** Escapa um texto para uso literal em RegExp. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** true se `phrase` (dobrada) aparece em `text` (dobrado) como palavra(s) inteira(s). */
export function findPhrase(text: string, phrase: string): Span | null {
  const p = phrase.trim();
  if (!p) return null;
  const re = new RegExp(`(?<![a-z0-9])${escapeRegExp(p).replace(/\s+/g, '\\s+')}(?![a-z0-9])`);
  const m = re.exec(text);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

/**
 * Distância de edição com transposição de adjacentes (Damerau restrita / OSA).
 * "orcamneto" -> "orcamento" custa 1 (e não 2 como no Levenshtein).
 */
export function osaDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** Similaridade 0..1 tolerante a transposições (textos já dobrados). */
export function fuzzyScore(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (!max) return 1;
  return 1 - osaDistance(a, b) / max;
}

/** Singular/plural simples: 'restaurante' ~ 'restaurantes', 'remedio' ~ 'remedios', 'pao' ~ 'paes'. */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return l === `${s}s` || l === `${s}es` || (s.endsWith('l') && l === `${s.slice(0, -1)}is`);
}

/**
 * Gírias e abreviações comuns => forma canônica (aplicado token a token, sobre o texto dobrado).
 * Usado apenas para classificar a intenção e extrair períodos/datas.
 */
export const SLANG: Record<string, string> = {
  qto: 'quanto',
  qnto: 'quanto',
  qnt: 'quanto',
  qt: 'quanto',
  quantos: 'quanto',
  vc: 'voce',
  vcs: 'voces',
  ce: 'voce',
  to: 'estou',
  tou: 'estou',
  tamo: 'estamos',
  ta: 'esta',
  tao: 'estao',
  q: 'que',
  oq: 'o que',
  pq: 'por que',
  tb: 'tambem',
  tbm: 'tambem',
  msm: 'mesmo',
  mt: 'muito',
  mto: 'muito',
  mta: 'muita',
  hj: 'hoje',
  amn: 'amanha',
  dps: 'depois',
  n: 'nao',
  obg: 'obrigado',
  obgd: 'obrigado',
  obgda: 'obrigada',
  brigado: 'obrigado',
  brigada: 'obrigada',
  vlw: 'valeu',
  blz: 'beleza',
  sdd: 'saudade',
  pfv: 'por favor',
  pf: 'por favor',
  td: 'tudo',
  tds: 'todos',
  orc: 'orcamento',
  orcament: 'orcamento',
  ctz: 'certeza',
  msg: 'mensagem',
  cred: 'credito',
  deb: 'debito',
  din: 'dinheiro',
  grana: 'dinheiro',
  bufunfa: 'dinheiro',
  torrei: 'gastei',
  torrando: 'gastando',
  gastamo: 'gastamos',
};

/** Aplica SLANG token a token, preservando o resto do texto (o comprimento pode mudar). */
export function expandSlang(folded: string): string {
  return folded.replace(/[a-z0-9]+/g, (w) => SLANG[w] ?? w);
}

/** Colapsa espaços e remove espaços nas pontas. */
export function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Mascara vários trechos com `ch` (mantém o comprimento). */
export function maskSpans(text: string, spans: Span[], ch = ' '): string {
  let out = text;
  for (const s of spans)
    out = out.slice(0, s.start) + ch.repeat(Math.max(0, s.end - s.start)) + out.slice(s.end);
  return out;
}

/** true se o trecho cruza algum dos trechos da lista. */
export function overlapsAny(tk: Span, spans: Span[]): boolean {
  return spans.some((s) => tk.start < s.end && s.start < tk.end);
}
