import type { Category, CategoryKind, Transaction } from '@/domain/types';
import type { CategorySuggestion } from './types';

/**
 * Sugere a categoria para uma descrição de lançamento, 100% local:
 * 1) histórico: lançamentos anteriores com descrição normalizada igual/semelhante (categoria mais frequente; recência desempata);
 * 2) palavras-chave das categorias (category.keywords) e nome da categoria;
 * Só retorna categorias não arquivadas do `kind` informado. null se nada confiável (confidence < 0.35).
 */
export function suggestCategory(
  description: string,
  kind: CategoryKind,
  categories: Category[],
  history: Transaction[],
): CategorySuggestion | null {
  void description;
  void kind;
  void categories;
  void history;
  throw new Error('não implementado');
}
