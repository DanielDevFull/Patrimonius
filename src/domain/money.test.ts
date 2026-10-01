import { describe, expect, it } from 'vitest';
import { formatBRL, formatSignedBRL, parseMoney, splitCents } from './money';

describe('parseMoney', () => {
  it.each([
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['1234.56', 123456],
    ['R$ 50', 5000],
    ['50', 5000],
    ['-12,5', -1250],
    ['1,5 mil', 150000],
    ['2 mil', 200000],
    ['1.000', 100000],
    ['12.345.678', 1234567800],
    ['12.5', 1250],
    ['0,99', 99],
    ['1,234.56', 123456],
  ])('%s -> %i', (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each(['', 'abc', '1,2,3', '.', '1.2.3'])('rejeita %s', (input) => {
    expect(parseMoney(input)).toBeNull();
  });
});

describe('format', () => {
  it('formata BRL', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
    expect(formatSignedBRL(-500)).toBe('-R$ 5,00');
    expect(formatSignedBRL(500)).toBe('+R$ 5,00');
  });
});

describe('splitCents', () => {
  it('divide sem perder centavos', () => {
    expect(splitCents(1000, 3)).toEqual([334, 333, 333]);
    expect(splitCents(1000, 3).reduce((a, b) => a + b)).toBe(1000);
  });
});
