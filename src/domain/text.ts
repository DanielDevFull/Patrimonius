/** Remove acentos, converte para minúsculas e colapsa espaços. Base para buscas e NLU. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Primeira letra maiúscula. */
export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Pluralização simples: plural(2, 'mês', 'meses') => '2 meses'. */
export function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${Math.abs(n) === 1 ? singular : pluralForm}`;
}

/** Distância de Levenshtein (para correspondência aproximada de nomes). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Similaridade 0..1 baseada em Levenshtein sobre textos normalizados. */
export function similarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  const max = Math.max(na.length, nb.length);
  if (!max) return 1;
  return 1 - levenshtein(na, nb) / max;
}
