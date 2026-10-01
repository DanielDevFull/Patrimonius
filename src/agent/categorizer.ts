import { similarity } from '@/domain/text';
import type { Category, CategoryKind, ID, Transaction } from '@/domain/types';
import { scoreCategories } from './nlu/entities';
import { fold, squash } from './nlu/text';
import type { CategorySuggestion } from './types';

/** Abaixo disso não sugerimos nada. */
const MIN_CONFIDENCE = 0.35;

/**
 * Chave de comparação de descrições: minúscula, sem acento, sem sufixo de parcela " (1/3)",
 * sem números e sem pontuação. Ex.: 'iFood *Pedido 123 (2/3)' => 'ifood pedido'.
 */
export function descriptionKey(description: string): string {
  const base = fold(description).replace(/\s*\(\s*\d+\s*\/\s*\d+\s*\)\s*$/, '');
  return squash(base.replace(/[0-9]+/g, ' ').replace(/[^a-z\s]+/g, ' '));
}

interface Vote {
  weight: number;
  /** Data mais recente (desempate). */
  last: string;
}

/** Lançamentos do histórico com a mesma chave de descrição, agrupados por categoria. */
type KeyVotes = Map<ID, { count: number; last: string }>;

/** Histórico indexado por tipo (despesa/receita) e chave de descrição. */
type HistoryIndex = Map<CategoryKind, Map<string, KeyVotes>>;

/**
 * Índice do histórico, memoizado por array (o app recria o array a cada mudança nos dados). Assim cada tecla no campo
 * de descrição não normaliza de novo milhares de lançamentos: a busca exata é O(1) e a de semelhantes percorre só as
 * descrições DISTINTAS. O tamanho é conferido para não usar um índice velho se o array for alterado no lugar.
 */
const indexCache = new WeakMap<Transaction[], { length: number; index: HistoryIndex }>();

function historyIndex(history: Transaction[]): HistoryIndex {
  const cached = indexCache.get(history);
  if (cached && cached.length === history.length) return cached.index;
  const index: HistoryIndex = new Map();
  for (const tx of history) {
    if ((tx.type !== 'despesa' && tx.type !== 'receita') || tx.categoryId === null) continue;
    const key = descriptionKey(tx.description);
    if (!key) continue;
    let byKey = index.get(tx.type);
    if (!byKey) index.set(tx.type, (byKey = new Map()));
    let votes = byKey.get(key);
    if (!votes) byKey.set(key, (votes = new Map()));
    const date = `${tx.date}|${tx.createdAt}`;
    const v = votes.get(tx.categoryId);
    if (v) {
      v.count += 1;
      if (date > v.last) v.last = date;
    } else votes.set(tx.categoryId, { count: 1, last: date });
  }
  indexCache.set(history, { length: history.length, index });
  return index;
}

/** Soma os votos de uma chave (peso = similaridade por lançamento), só de categorias válidas. */
function addVotes(votes: Map<ID, Vote>, keyVotes: KeyVotes, weight: number, valid: Set<ID>): void {
  for (const [categoryId, kv] of keyVotes) {
    if (!valid.has(categoryId)) continue;
    const v = votes.get(categoryId);
    if (v) {
      v.weight += weight * kv.count;
      if (kv.last > v.last) v.last = kv.last;
    } else votes.set(categoryId, { weight: weight * kv.count, last: kv.last });
  }
}

function tally(votes: Map<ID, Vote>): { categoryId: ID; share: number } | null {
  let total = 0;
  for (const v of votes.values()) total += v.weight;
  let best: [ID, Vote] | null = null;
  for (const entry of votes) {
    if (
      !best ||
      entry[1].weight > best[1].weight + 1e-9 ||
      (Math.abs(entry[1].weight - best[1].weight) <= 1e-9 && entry[1].last > best[1].last)
    ) {
      best = entry;
    }
  }
  return best && total > 0 ? { categoryId: best[0], share: best[1].weight / total } : null;
}

/**
 * Sugere a categoria para uma descrição de lançamento, 100% local:
 * 1) histórico: lançamentos anteriores do mesmo tipo com a MESMA descrição normalizada (ignorando sufixo de parcela
 *    " (1/3)", números e pontuação) => categoria mais frequente, recência desempata; confiança alta (0,75–0,95,
 *    conforme a unanimidade). Sem igual, descrições semelhantes (similarity >= 0,8) votam com peso = similaridade;
 *    confiança média (0,55–0,7);
 * 2) palavras-chave/sinônimos (0,65) e nome da categoria (0,7) — 'nome_categoria' ou 'palavra_chave';
 *    correspondência aproximada (erro de digitação) vale 0,45.
 * Só retorna categorias não arquivadas do `kind` informado. null se nada confiável (confidence < 0,35).
 */
export function suggestCategory(
  description: string,
  kind: CategoryKind,
  categories: Category[],
  history: Transaction[],
): CategorySuggestion | null {
  if (typeof description !== 'string') return null;
  const key = descriptionKey(description);
  if (!key) return null;
  const valid = new Set(categories.filter((c) => !c.archived && c.kind === kind).map((c) => c.id));
  if (!valid.size) return null;

  const byKey = historyIndex(history).get(kind);
  const exact = new Map<ID, Vote>();
  const exactVotes = byKey?.get(key);
  if (exactVotes) addVotes(exact, exactVotes, 1, valid);

  const exactWinner = tally(exact);
  if (exactWinner) {
    return {
      categoryId: exactWinner.categoryId,
      confidence: round(0.75 + 0.2 * exactWinner.share),
      reason: 'historico',
    };
  }

  // Sem igual: descrições semelhantes votam com peso = similaridade (calculada uma vez por descrição distinta).
  const similar = new Map<ID, Vote>();
  if (byKey) {
    for (const [k, keyVotes] of byKey) {
      if (k === key) continue;
      const sim = similarity(k, key);
      if (sim >= 0.8) addVotes(similar, keyVotes, sim, valid);
    }
  }

  let best: CategorySuggestion | null = null;
  const similarWinner = tally(similar);
  if (similarWinner) {
    best = {
      categoryId: similarWinner.categoryId,
      confidence: round(0.55 + 0.15 * similarWinner.share),
      reason: 'historico',
    };
  }

  const hit = scoreCategories(fold(description), categories, kind)[0];
  if (hit) {
    const confidence = hit.source === 'nome' ? 0.7 : hit.source === 'aproximado' ? 0.45 : 0.65;
    if (!best || confidence > best.confidence) {
      best = {
        categoryId: hit.categoryId,
        confidence,
        reason: hit.source === 'nome' ? 'nome_categoria' : 'palavra_chave',
      };
    }
  }
  return best && best.confidence >= MIN_CONFIDENCE ? best : null;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
