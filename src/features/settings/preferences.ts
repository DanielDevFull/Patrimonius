/**
 * Regras de validação das preferências financeiras (usadas nas Configurações e no primeiro uso).
 */
import { normalizeText } from '@/domain/text';
import type { Category, CategoryKind, ID } from '@/domain/types';
import { CATEGORY_IDS } from '@/domain/defaults';

export const APP_VERSION = '0.1.0';

export const EMERGENCY_MONTHS = { min: 1, max: 24 } as const;
export const SAVINGS_RATE = { min: 0, max: 90 } as const;

/** Inteiro dentro do intervalo (aceita espaços e vírgula decimal) ou null. */
export function parseIntInRange(text: string, min: number, max: number): number | null {
  const s = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

export function emergencyMonthsError(text: string): string | null {
  return parseIntInRange(text, EMERGENCY_MONTHS.min, EMERGENCY_MONTHS.max) === null
    ? `Informe um número inteiro de ${EMERGENCY_MONTHS.min} a ${EMERGENCY_MONTHS.max} meses.`
    : null;
}

export function savingsRateError(text: string): string | null {
  return parseIntInRange(text, SAVINGS_RATE.min, SAVINGS_RATE.max) === null
    ? `Informe uma porcentagem inteira de ${SAVINGS_RATE.min} a ${SAVINGS_RATE.max}.`
    : null;
}

/* ------------------------------------------------------------------ */
/* Categorias                                                          */
/* ------------------------------------------------------------------ */

/**
 * Categorias que o app usa diretamente (destino padrão ao excluir, aportes em metas e pagamentos de dívidas).
 * Podem ser arquivadas, mas não excluídas.
 */
export const PROTECTED_CATEGORY_IDS: ReadonlySet<ID> = new Set<ID>([
  CATEGORY_IDS.outrosDespesa,
  CATEGORY_IDS.outrosReceita,
  CATEGORY_IDS.investimentos,
  CATEGORY_IDS.dividas,
]);

/**
 * Converte o texto digitado ("Padaria, Café;  pão de açúcar") em palavras-chave normalizadas
 * (minúsculas, sem acento, sem duplicatas, na ordem digitada).
 */
export function parseKeywords(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of text.split(/[,;\n]/)) {
    const k = normalizeText(part);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    result.push(k);
  }
  return result;
}

export const CATEGORY_NAME_MAX = 40;

/** Valida o nome de uma categoria (obrigatório, tamanho e duplicidade no mesmo tipo). */
export function categoryNameError(
  name: string,
  kind: CategoryKind,
  categories: Category[],
  editingId: ID | null,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Informe o nome da categoria.';
  if (trimmed.length > CATEGORY_NAME_MAX) return `Use no máximo ${CATEGORY_NAME_MAX} caracteres.`;
  const normalized = normalizeText(trimmed);
  const duplicate = categories.some(
    (c) => c.id !== editingId && c.kind === kind && normalizeText(c.name) === normalized,
  );
  return duplicate ? 'Já existe uma categoria com esse nome.' : null;
}

/** Categoria substituta sugerida ao excluir: "Outras despesas/receitas" (ou a primeira disponível). */
export function defaultReplacement(category: Category, categories: Category[]): ID | null {
  const candidates = categories.filter((c) => c.kind === category.kind && c.id !== category.id);
  const fallback = category.kind === 'despesa' ? CATEGORY_IDS.outrosDespesa : CATEGORY_IDS.outrosReceita;
  const preferred = candidates.find((c) => c.id === fallback && !c.archived);
  return (preferred ?? candidates.find((c) => !c.archived) ?? candidates[0])?.id ?? null;
}

/** Cor com transparência a partir de '#rgb' ou '#rrggbb' (para fundos suaves); fallback transparente. */
export function withAlpha(hex: string, alpha: number): string {
  let h = hex.trim().replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return 'transparent';
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${h}${a}`;
}
