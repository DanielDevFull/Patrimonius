/**
 * Reconhecimento de entidades nomeadas: categorias, contas e metas.
 */
import type { Account, AccountType, Category, Goal } from '@/domain/types';
import { CATEGORY_SYNONYMS, PURCHASE_ITEMS, PURCHASE_VERB } from './synonyms';
import { findPhrase, fold, fuzzyScore, sameWord, squash, tokenize, words, type Span } from './text';

/* ------------------------------------------------------------------ */
/* Categorias                                                          */
/* ------------------------------------------------------------------ */

export type CategoryHitSource = 'nome' | 'sinonimo' | 'palavra_chave' | 'contexto' | 'aproximado';

export interface CategoryHit {
  categoryId: string;
  score: number;
  source: CategoryHitSource;
  span: Span;
}

/** Palavras dos nomes de categoria que, sozinhas, não identificam nada. */
const GENERIC_NAME_TOKENS = new Set([
  'outras',
  'outros',
  'despesas',
  'despesa',
  'receitas',
  'receita',
  'pessoais',
]);
/** Nomes de categoria que também são substantivos genéricos ("fiz compras no mercado"). */
const GENERIC_CATEGORY_NAMES = new Set(['compras', 'contas']);
/** Palavras comuns que nunca devem ser "corrigidas" para uma categoria por aproximação. */
const FUZZY_STOP = new Set([
  'gastei',
  'gastos',
  'gastar',
  'gastando',
  'quanto',
  'quero',
  'comprei',
  'comprar',
  'paguei',
  'pagar',
  'recebi',
  'receber',
  'transferi',
  'passei',
  'orcamento',
  'limite',
  'maximo',
  'definir',
  'mensal',
  'semana',
  'passado',
  'passada',
  'cartao',
  'credito',
  'debito',
  'conta',
  'corrente',
  'poupanca',
  'carteira',
  'dinheiro',
  'quantos',
  'quanta',
  'quantas',
  'estou',
  'minhas',
  'minha',
  'meses',
  'tenho',
  'consigo',
  'posso',
  'parcelas',
  'parcelado',
  'vezes',
  'ontem',
  'hoje',
  'amanha',
  'janeiro',
  'fevereiro',
  'marco',
  'abril',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]);

function vocabularyOf(c: Category): { phrase: string; source: CategoryHitSource }[] {
  const out: { phrase: string; source: CategoryHitSource }[] = [];
  for (const k of c.keywords) out.push({ phrase: squash(fold(k)), source: 'palavra_chave' });
  for (const s of CATEGORY_SYNONYMS[c.id] ?? []) out.push({ phrase: s, source: 'sinonimo' });
  return out.filter((v) => v.phrase.length > 0);
}

/**
 * Pontua todas as categorias citadas no texto (já dobrado). Fontes e pesos:
 * nome completo 1,0 (0,7 para nomes genéricos como "Compras"); verbo de compra + item 0,88;
 * sinônimo/palavra-chave 0,8 (+0,05 se tiver mais de uma palavra); palavra do nome 0,75; aproximado 0,6.
 * Um trecho contido em outro trecho maior de OUTRA categoria é descartado ("mercado livre" => Compras, não Mercado).
 * Retorna uma entrada por categoria, da mais provável para a menos provável.
 */
export function scoreCategories(t: string, categories: Category[], kind?: Category['kind']): CategoryHit[] {
  const pool = categories.filter((c) => !c.archived && (!kind || c.kind === kind));
  const tokens = tokenize(t).filter((tk) => /[a-z]/.test(tk.text) || /^\d{2}$/.test(tk.text));
  const hits: CategoryHit[] = [];
  const allVocab = new Set<string>();
  const vocabs = new Map(pool.map((c) => [c.id, vocabularyOf(c)]));
  for (const v of vocabs.values()) for (const e of v) allVocab.add(e.phrase);

  for (const c of pool) {
    const add = (score: number, source: CategoryHitSource, span: Span) =>
      hits.push({ categoryId: c.id, score: Math.round(score * 100) / 100, source, span });
    const name = squash(fold(c.name));
    const full = findPhrase(t, name);
    if (full) add(GENERIC_CATEGORY_NAMES.has(name) ? 0.7 : 1, 'nome', full);
    for (const nt of words(name)) {
      if (nt.length < 4 || GENERIC_NAME_TOKENS.has(nt)) continue;
      for (const tk of tokens) if (sameWord(tk.text, nt)) add(0.75, 'nome', tk);
    }
    for (const v of vocabs.get(c.id) ?? []) {
      const multi = v.phrase.includes(' ');
      const score = 0.8 + (multi ? 0.05 : 0);
      if (multi || /[^a-z0-9]/.test(v.phrase)) {
        const span = findPhrase(t, v.phrase);
        if (span) add(score, v.source, span);
      } else {
        for (const tk of tokens) if (sameWord(tk.text, v.phrase)) add(score, v.source, tk);
      }
    }
  }

  // Verbo de compra + item ("comprei um celular") => Compras.
  const compras = pool.find((c) => c.id === 'cat-compras');
  if (compras && PURCHASE_VERB.test(t)) {
    for (const tk of tokens) {
      if (PURCHASE_ITEMS.some((item) => sameWord(tk.text, item))) {
        hits.push({ categoryId: compras.id, score: 0.88, source: 'contexto', span: tk });
      }
    }
  }

  // Correspondência aproximada (erros de digitação) para palavras longas desconhecidas.
  for (const tk of tokens) {
    if (tk.text.length < 6 || FUZZY_STOP.has(tk.text) || allVocab.has(tk.text)) continue;
    if (hits.some((h) => h.span.start <= tk.start && tk.end <= h.span.end)) continue;
    for (const c of pool) {
      const candidates = [...words(fold(c.name)), ...(vocabs.get(c.id) ?? []).map((v) => v.phrase)].filter(
        (p) => !p.includes(' ') && p.length >= 6,
      );
      if (candidates.some((p) => fuzzyScore(tk.text, p) >= 0.84)) {
        hits.push({ categoryId: c.id, score: 0.6, source: 'aproximado', span: tk });
      }
    }
  }

  // Descarta trechos contidos em um trecho maior de outra categoria.
  const kept = hits.filter(
    (h) =>
      !hits.some(
        (o) =>
          o.categoryId !== h.categoryId &&
          o.span.start <= h.span.start &&
          h.span.end <= o.span.end &&
          o.span.end - o.span.start > h.span.end - h.span.start,
      ),
  );

  const best = new Map<string, CategoryHit>();
  for (const h of kept) {
    const cur = best.get(h.categoryId);
    if (!cur || h.score > cur.score || (h.score === cur.score && h.span.start < cur.span.start)) {
      best.set(h.categoryId, h);
    }
  }
  const order = new Map(pool.map((c, i) => [c.id, i]));
  const kindRank = new Map(pool.map((c) => [c.id, c.kind === 'despesa' ? 0 : 1]));
  // Desempate: frase com mais palavras ("passagem aérea"), depois a primeira citada (núcleo da expressão:
  // "almoço no shopping" => Restaurantes), depois despesa antes de receita e a ordem das categorias.
  const wordCount = (sp: Span) => t.slice(sp.start, sp.end).trim().split(/\s+/).length;
  return [...best.values()].sort(
    (a, b) =>
      b.score - a.score ||
      wordCount(b.span) - wordCount(a.span) ||
      a.span.start - b.span.start ||
      (kindRank.get(a.categoryId) ?? 0) - (kindRank.get(b.categoryId) ?? 0) ||
      (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0),
  );
}

/**
 * Encontra a categoria citada no texto (nome, sinônimos, palavras-chave; tolera plural e erros leves de digitação).
 * `kind` restringe o tipo. Categorias arquivadas são ignoradas. Retorna null se nada for encontrado.
 */
export function matchCategory(
  text: string,
  categories: Category[],
  kind?: Category['kind'],
): { categoryId: string; confidence: number } | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const top = scoreCategories(fold(text), categories, kind)[0];
  return top ? { categoryId: top.categoryId, confidence: top.score } : null;
}

/* ------------------------------------------------------------------ */
/* Contas                                                              */
/* ------------------------------------------------------------------ */

const GENERIC_ACCOUNT_TOKENS = new Set([
  'conta',
  'contas',
  'cartao',
  'credito',
  'debito',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'e',
  'o',
  'a',
  'banco',
  'meu',
  'minha',
  'meus',
  'minhas',
]);

/** Palavras que indicam o TIPO de conta. */
export const ACCOUNT_TYPE_PATTERNS: [RegExp, AccountType][] = [
  [/\b(?:cartao|credito|fatura)\b/, 'cartao_credito'],
  [/\b(?:poupanca|poupancas)\b/, 'poupanca'],
  [
    /\b(?:carteira|em dinheiro|no dinheiro|dinheiro vivo|dinheiro fisico|especie|cash|em maos|na mao)\b/,
    'carteira',
  ],
  [/\b(?:corrente|cc|debito)\b/, 'corrente'],
  [/\b(?:investimentos?|corretora|aplicacoes?)\b/, 'investimento'],
];

/** Palavras usadas para citar contas (para limpar descrições). */
export const ACCOUNT_WORDS = [
  'cartao',
  'credito',
  'debito',
  'conta',
  'corrente',
  'poupanca',
  'carteira',
  'dinheiro',
  'especie',
  'pix',
  'cc',
  'fatura',
  'investimento',
  'investimentos',
  'corretora',
];

export function significantAccountTokens(account: Account): string[] {
  return words(fold(account.name)).filter((w) => w.length >= 2 && !GENERIC_ACCOUNT_TOKENS.has(w));
}

/** Pontua uma conta para o texto dobrado (0 = não citada). */
export function scoreAccount(t: string, account: Account, sameTypeCount: number): number {
  const name = squash(fold(account.name));
  const textTokens = words(t);
  let nameScore = 0;
  if (name && findPhrase(t, name)) {
    nameScore = 0.95;
  } else {
    for (const nt of significantAccountTokens(account)) {
      if (textTokens.some((w) => sameWord(w, nt)))
        nameScore = Math.max(nameScore, nt.length >= 3 ? 0.85 : 0.7);
      else if (nt.length >= 5 && textTokens.some((w) => w.length >= 4 && fuzzyScore(w, nt) >= 0.8)) {
        nameScore = Math.max(nameScore, 0.7);
      }
    }
  }
  const typeHit = ACCOUNT_TYPE_PATTERNS.some(([re, type]) => type === account.type && re.test(t));
  // "fatura nubank" com contas "Nubank" (corrente) e "Cartão Nubank": o tipo citado desempata.
  const otherType =
    !typeHit && ACCOUNT_TYPE_PATTERNS.some(([re, type]) => type !== account.type && re.test(t));
  if (nameScore > 0) return Math.min(1, nameScore + (typeHit ? 0.05 : 0) - (otherType ? 0.1 : 0));
  if (typeHit) return sameTypeCount === 1 ? 0.7 : 0.55;
  return 0;
}

/**
 * Encontra a conta citada no texto: nome aproximado ("nubank", "nubak") e/ou tipo ("cartão"/"crédito" => cartão de
 * crédito; "poupança"; "carteira"/"em dinheiro"/"espécie" => carteira; "corrente"/"débito" => conta corrente).
 * Nome + tipo vence só nome; só o tipo vale 0,7 se houver uma única conta daquele tipo (0,55 se houver várias:
 * a primeira da lista é escolhida). Contas arquivadas são ignoradas. null se confiança < 0,5.
 */
export function matchAccount(
  text: string,
  accounts: Account[],
): { accountId: string; confidence: number } | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const ranked = rankAccounts(fold(text), accounts);
  return ranked[0] ?? null;
}

export function rankAccounts(t: string, accounts: Account[]): { accountId: string; confidence: number }[] {
  const pool = accounts.filter((a) => !a.archived);
  const typeCount = new Map<AccountType, number>();
  for (const a of pool) typeCount.set(a.type, (typeCount.get(a.type) ?? 0) + 1);
  return pool
    .map((a, i) => ({ accountId: a.id, confidence: scoreAccount(t, a, typeCount.get(a.type) ?? 0), i }))
    .filter((r) => r.confidence >= 0.5)
    .sort((a, b) => b.confidence - a.confidence || a.i - b.i)
    .map(({ accountId, confidence }) => ({ accountId, confidence }));
}

/* ------------------------------------------------------------------ */
/* Metas                                                               */
/* ------------------------------------------------------------------ */

const GENERIC_GOAL_TOKENS = new Set([
  'meta',
  'de',
  'da',
  'do',
  'para',
  'pra',
  'minha',
  'meu',
  'o',
  'a',
  'um',
  'uma',
  'e',
]);
const STATUS_WEIGHT: Record<Goal['status'], number> = { ativa: 1, pausada: 0.95, concluida: 0.85 };

/**
 * Encontra a meta citada no texto (nome completo, palavras do nome, aproximação tolerante a erros).
 * Metas concluídas/pausadas têm peso menor. Se o texto só diz "meta" e há uma única meta ativa, ela é
 * escolhida com confiança 0,5. null se nada confiável.
 */
export function matchGoal(text: string, goals: Goal[]): { goalId: string; confidence: number } | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const t = fold(text);
  const textTokens = words(t);
  let best: { goalId: string; confidence: number } | null = null;
  for (const g of goals) {
    const name = squash(fold(g.name));
    const nameTokens = words(name).filter((w) => w.length >= 3 && !GENERIC_GOAL_TOKENS.has(w));
    let score = 0;
    if (name && findPhrase(t, name)) score = 0.95;
    else if (nameTokens.length) {
      const present = nameTokens.filter((nt) => textTokens.some((w) => sameWord(w, nt)));
      if (present.length === nameTokens.length) score = 0.85;
      else if (present.length > 0) score = 0.75;
      else if (
        nameTokens.some(
          (nt) => nt.length >= 4 && textTokens.some((w) => w.length >= 4 && fuzzyScore(w, nt) >= 0.8),
        )
      ) {
        score = 0.65;
      }
    }
    score *= STATUS_WEIGHT[g.status];
    if (score > 0 && (!best || score > best.confidence)) best = { goalId: g.id, confidence: score };
  }
  if (best && best.confidence >= 0.5) return best;
  const active = goals.filter((g) => g.status === 'ativa');
  if (active.length === 1 && /\bmetas?\b/.test(t)) return { goalId: active[0].id, confidence: 0.5 };
  return null;
}
