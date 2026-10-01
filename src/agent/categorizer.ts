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
  count: number;
  /** Data mais recente (desempate). */
  last: string;
}

function tally(
  entries: { categoryId: ID; weight: number; date: string }[],
): { categoryId: ID; share: number } | null {
  const votes = new Map<ID, Vote>();
  let total = 0;
  for (const e of entries) {
    const v = votes.get(e.categoryId) ?? { weight: 0, count: 0, last: '' };
    v.weight += e.weight;
    v.count += 1;
    if (e.date > v.last) v.last = e.date;
    votes.set(e.categoryId, v);
    total += e.weight;
  }
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

  const relevant = history.filter(
    (tx) => tx.type === kind && tx.categoryId !== null && valid.has(tx.categoryId),
  );
  const exact: { categoryId: ID; weight: number; date: string }[] = [];
  const similar: { categoryId: ID; weight: number; date: string }[] = [];
  for (const tx of relevant) {
    const k = descriptionKey(tx.description);
    if (!k) continue;
    const entry = { categoryId: tx.categoryId as ID, date: `${tx.date}|${tx.createdAt}` };
    if (k === key) exact.push({ ...entry, weight: 1 });
    else {
      const sim = similarity(k, key);
      if (sim >= 0.8) similar.push({ ...entry, weight: sim });
    }
  }

  const exactWinner = tally(exact);
  if (exactWinner) {
    return {
      categoryId: exactWinner.categoryId,
      confidence: round(0.75 + 0.2 * exactWinner.share),
      reason: 'historico',
    };
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
