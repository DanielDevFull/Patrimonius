import { describe, expect, it } from 'vitest';
import { formatBRL, formatBRLCompact, formatSignedBRL, parseMoney, splitCents } from './money';

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

  it.each(['1,234', '12.345,678', '0,005', '12.5678', '1,234.567'])(
    'rejeita %s (mais de 2 casas decimais seriam arredondadas sem aviso)',
    (input) => {
      expect(parseMoney(input)).toBeNull();
    },
  );

  it('com "mil" as casas decimais extras são válidas', () => {
    expect(parseMoney('1,234 mil')).toBe(123400);
    expect(parseMoney('2,5k')).toBe(250000);
    expect(parseMoney('1.234')).toBe(123400);
  });
});

describe('format', () => {
  it('formata BRL', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
    expect(formatSignedBRL(-500)).toBe('-R$ 5,00');
    expect(formatSignedBRL(500)).toBe('+R$ 5,00');
  });

  it('compacto: abaixo de R$ 1.000 mostra o valor exato (R$ 903,8 pareceria R$ 903,80)', () => {
    expect(formatBRLCompact(90384)).toBe('R$ 903,84');
    expect(formatBRLCompact(8730)).toBe('R$ 87,30');
    expect(formatBRLCompact(105)).toBe('R$ 1,05');
    expect(formatBRLCompact(-90384)).toBe('-R$ 903,84');
    expect(formatBRLCompact(0)).toBe('R$ 0,00');
  });

  it('compacto: a partir de R$ 1.000 usa mil/mi', () => {
    expect(formatBRLCompact(150000)).toBe('R$ 1,5 mil');
    expect(formatBRLCompact(123456789)).toBe('R$ 1,2 mi');
  });
});

describe('splitCents', () => {
  it('divide sem perder centavos', () => {
    expect(splitCents(1000, 3)).toEqual([334, 333, 333]);
    expect(splitCents(1000, 3).reduce((a, b) => a + b)).toBe(1000);
  });
});
