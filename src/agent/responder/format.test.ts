import { describe, expect, it } from 'vitest';
import {
  accountPhrase,
  capitalizeDescription,
  categoryLabel,
  dateRelative,
  firstName,
  formatDayLong,
  formatMonthsCount,
  joinList,
  median,
  monthPeriod,
  monthlyEquivalent,
  periodMonth,
  periodPhrase,
  periodPhraseStart,
  relativeChange,
  uniqueSuggestions,
  withVocative,
} from '../format';

const p = (label: string, start = '2026-10-01', end = '2026-10-31') => ({ start, end, label });

describe('format — períodos', () => {
  it.each([
    ['este mês', 'este mês'],
    ['mês passado', 'no mês passado'],
    ['mês retrasado', 'no mês retrasado'],
    ['próximo mês', 'no próximo mês'],
    ['semana passada', 'na semana passada'],
    ['esta semana', 'esta semana'],
    ['ano passado', 'no ano passado'],
    ['setembro de 2026', 'em setembro de 2026'],
    ['15/09/2026', 'em 15/09/2026'],
    ['2025', 'em 2025'],
    ['últimos 3 meses', 'nos últimos 3 meses'],
    ['últimas 2 semanas', 'nas últimas 2 semanas'],
    ['próximos 7 dias', 'nos próximos 7 dias'],
    ['hoje', 'hoje'],
    ['ontem', 'ontem'],
  ])('"%s" => "%s"', (label, phrase) => {
    expect(periodPhrase(p(label))).toBe(phrase);
  });

  it('frase no início da sentença fica com maiúscula', () => {
    expect(periodPhraseStart(p('mês passado'))).toBe('No mês passado');
  });

  it('monthPeriod usa rótulos relativos ao dia de hoje', () => {
    expect(monthPeriod('2026-10', '2026-10-15')).toEqual({ start: '2026-10-01', end: '2026-10-31', label: 'este mês' });
    expect(monthPeriod('2026-09', '2026-10-15').label).toBe('mês passado');
    expect(monthPeriod('2026-02', '2026-10-15')).toEqual({ start: '2026-02-01', end: '2026-02-28', label: 'fevereiro de 2026' });
  });

  it('periodMonth reconhece só meses inteiros do calendário', () => {
    expect(periodMonth(p('x'))).toBe('2026-10');
    expect(periodMonth(p('x', '2026-10-01', '2026-10-15'))).toBeNull();
    expect(periodMonth(p('x', '2026-09-15', '2026-10-14'))).toBeNull();
  });

  it('datas relativas e por extenso', () => {
    expect(dateRelative('2026-10-15', '2026-10-15')).toBe('hoje');
    expect(dateRelative('2026-10-14', '2026-10-15')).toBe('ontem');
    expect(dateRelative('2026-10-16', '2026-10-15')).toBe('amanhã');
    expect(dateRelative('2026-10-20', '2026-10-15')).toBe('em 20/10/2026');
    expect(formatDayLong('2026-10-01')).toBe('quinta-feira, 1º de outubro');
    expect(formatDayLong('2026-10-15')).toBe('quinta-feira, 15 de outubro');
  });
});

describe('format — textos', () => {
  it('lista em pt-BR com "e"', () => {
    expect(joinList([])).toBe('');
    expect(joinList(['A'])).toBe('A');
    expect(joinList(['A', 'B'])).toBe('A e B');
    expect(joinList(['A', 'B', 'C'])).toBe('A, B e C');
  });

  it('meses no singular/plural como em pt-BR', () => {
    expect(formatMonthsCount(0.8)).toBe('0,8 mês');
    expect(formatMonthsCount(1)).toBe('1 mês');
    expect(formatMonthsCount(1.96)).toBe('2 meses');
    expect(formatMonthsCount(6)).toBe('6 meses');
    expect(formatMonthsCount(0)).toBe('0 meses');
  });

  it('nome e vocativo', () => {
    expect(firstName({ userName: '  Ana   Lima ' })).toBe('Ana');
    expect(firstName({ userName: '' })).toBe('');
    expect(withVocative('Ana', 'não entendi.')).toBe('Ana, não entendi.');
    expect(withVocative('', 'não entendi.')).toBe('Não entendi.');
  });

  it('descrição com primeira letra maiúscula, preservando grafias como iFood', () => {
    expect(capitalizeDescription('farmácia')).toBe('Farmácia');
    expect(capitalizeDescription('iFood')).toBe('iFood');
    expect(capitalizeDescription(' uber ')).toBe('Uber');
  });

  it('frase da conta conforme o tipo e o nome', () => {
    expect(accountPhrase({ name: 'Nubank', type: 'corrente' })).toBe('na conta Nubank');
    expect(accountPhrase({ name: 'Conta corrente', type: 'corrente' })).toBe('na Conta corrente');
    expect(accountPhrase({ name: 'Carteira', type: 'carteira' })).toBe('na Carteira');
    expect(accountPhrase({ name: 'Cartão Nubank', type: 'cartao_credito' })).toBe('no Cartão Nubank');
    expect(accountPhrase({ name: 'Visa', type: 'cartao_credito' })).toBe('no cartão Visa');
  });

  it('rótulo de categoria com ícone (ou sem categoria)', () => {
    expect(categoryLabel({ icon: '🛒', name: 'Mercado' })).toBe('🛒 Mercado');
    expect(categoryLabel({ icon: '', name: 'Mercado' })).toBe('Mercado');
    expect(categoryLabel(undefined)).toBe('❔ Sem categoria');
  });

  it('sugestões sem repetição (ignorando acento/caixa) e no máximo 4', () => {
    expect(uniqueSuggestions(['Resumo do mês', 'resumo do mes', 'A', 'B', 'C', 'D'])).toEqual(['Resumo do mês', 'A', 'B', 'C']);
    expect(uniqueSuggestions(['', ' '])).toEqual([]);
  });
});

describe('format — números', () => {
  it('custo mensal equivalente por frequência (centavos inteiros)', () => {
    expect(monthlyEquivalent(12000, 'anual')).toBe(1000);
    expect(monthlyEquivalent(10000, 'semanal')).toBe(43333);
    expect(monthlyEquivalent(9000, 'trimestral')).toBe(3000);
    expect(monthlyEquivalent(5590, 'mensal')).toBe(5590);
  });

  it('mediana e variação relativa', () => {
    expect(median([])).toBe(0);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(relativeChange(150, 100)).toBe(0.5);
    expect(relativeChange(10, 0)).toBeNull();
  });
});
