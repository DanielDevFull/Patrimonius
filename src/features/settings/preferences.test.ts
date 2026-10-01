import { describe, expect, it } from 'vitest';
import { buildDefaultCategories, CATEGORY_IDS } from '@/domain/defaults';
import type { Category } from '@/domain/types';
import { TEST_NOW } from '@/test/factories';
import {
  categoryNameError,
  defaultReplacement,
  emergencyMonthsError,
  parseIntInRange,
  parseKeywords,
  PROTECTED_CATEGORY_IDS,
  savingsRateError,
  withAlpha,
} from './preferences';

const categories = buildDefaultCategories(TEST_NOW);
const cat = (id: string) => categories.find((c) => c.id === id)!;

describe('parseIntInRange', () => {
  it('aceita inteiros dentro do intervalo, com espaços e ",0"', () => {
    expect(parseIntInRange('6', 1, 24)).toBe(6);
    expect(parseIntInRange(' 12 ', 1, 24)).toBe(12);
    expect(parseIntInRange('6,0', 1, 24)).toBe(6);
  });

  it('rejeita vazio, fora do intervalo, fração, negativo e texto', () => {
    for (const v of ['', '0', '25', '6,5', '-3', 'seis', '1e1']) expect(parseIntInRange(v, 1, 24)).toBeNull();
  });

  it('mensagens em pt-BR', () => {
    expect(emergencyMonthsError('0')).toBe('Informe um número inteiro de 1 a 24 meses.');
    expect(emergencyMonthsError('6')).toBeNull();
    expect(savingsRateError('95')).toBe('Informe uma porcentagem inteira de 0 a 90.');
    expect(savingsRateError('0')).toBeNull();
  });
});

describe('parseKeywords', () => {
  it('normaliza (minúsculas, sem acento), remove vazios e duplicados mantendo a ordem', () => {
    expect(parseKeywords('Padaria, CAFÉ;  pão de  açúcar ,, padaria\nCafe')).toEqual(['padaria', 'cafe', 'pao de acucar']);
    expect(parseKeywords('   ')).toEqual([]);
  });
});

describe('categoryNameError', () => {
  it('exige nome e limita o tamanho', () => {
    expect(categoryNameError('  ', 'despesa', categories, null)).toBe('Informe o nome da categoria.');
    expect(categoryNameError('x'.repeat(41), 'despesa', categories, null)).toContain('no máximo 40');
  });

  it('detecta duplicidade ignorando acentos/caixa, só no mesmo tipo e ignorando a própria categoria', () => {
    expect(categoryNameError('saude', 'despesa', categories, null)).toBe('Já existe uma categoria com esse nome.');
    expect(categoryNameError('Saúde', 'receita', categories, null)).toBeNull();
    expect(categoryNameError('Saúde', 'despesa', categories, CATEGORY_IDS.saude)).toBeNull();
  });
});

describe('defaultReplacement', () => {
  it('sugere "Outras despesas/receitas" conforme o tipo', () => {
    expect(defaultReplacement(cat(CATEGORY_IDS.lazer), categories)).toBe(CATEGORY_IDS.outrosDespesa);
    expect(defaultReplacement(cat(CATEGORY_IDS.salario), categories)).toBe(CATEGORY_IDS.outrosReceita);
  });

  it('quando "outros" está arquivada ou é a própria categoria, usa a primeira ativa do mesmo tipo', () => {
    const list: Category[] = categories.map((c) => (c.id === CATEGORY_IDS.outrosDespesa ? { ...c, archived: true } : c));
    const r = defaultReplacement(cat(CATEGORY_IDS.lazer), list);
    expect(r).not.toBe(CATEGORY_IDS.outrosDespesa);
    expect(list.find((c) => c.id === r)?.kind).toBe('despesa');
    expect(defaultReplacement(cat(CATEGORY_IDS.outrosDespesa), categories)).not.toBe(CATEGORY_IDS.outrosDespesa);
  });

  it('as categorias usadas pelo app são protegidas', () => {
    expect(PROTECTED_CATEGORY_IDS.has(CATEGORY_IDS.dividas)).toBe(true);
    expect(PROTECTED_CATEGORY_IDS.has(CATEGORY_IDS.lazer)).toBe(false);
  });
});

describe('withAlpha', () => {
  it('converte #rgb e #rrggbb e rejeita formatos desconhecidos', () => {
    expect(withAlpha('#0f766e', 1)).toBe('#0f766eff');
    expect(withAlpha('#abc', 0)).toBe('#aabbcc00');
    expect(withAlpha('red', 0.5)).toBe('transparent');
  });
});
