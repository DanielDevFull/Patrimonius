import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatRate,
  formatSignedPercent,
  monthLongFrom,
  monthShortFrom,
  parsePercent,
  parsePositiveInt,
  rateToInput,
} from './format';

describe('formatRate / rateToInput / formatSignedPercent', () => {
  it('formata taxas em pt-BR com até 2 casas', () => {
    expect(formatRate(2.5)).toBe('2,5%');
    expect(formatRate(12)).toBe('12%');
    expect(formatRate(0.12345)).toBe('0,12%');
    expect(formatRate(-0.001)).toBe('0%');
    expect(formatRate(1234.5)).toBe('1.234,5%');
    expect(formatRate(Number.NaN)).toBe('—');
    expect(formatRate(0.797414, 4)).toBe('0,7974%');
  });
  it('prepara a taxa para um campo de texto (até 4 casas, sem milhar)', () => {
    expect(rateToInput(2.5)).toBe('2,5');
    expect(rateToInput(0.797414)).toBe('0,7974');
    expect(rateToInput(1500)).toBe('1500');
  });
  it('variação com sinal', () => {
    expect(formatSignedPercent(0.052)).toBe('+5,2%');
    expect(formatSignedPercent(-0.1)).toBe('-10%');
    expect(formatSignedPercent(0.00001)).toBe('0%');
    expect(formatSignedPercent(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('parsePercent', () => {
  it('aceita vírgula, ponto, % e sufixos a.m./a.a.', () => {
    expect(parsePercent('2,5')).toBe(2.5);
    expect(parsePercent('2.5')).toBe(2.5);
    expect(parsePercent(' 12 % ')).toBe(12);
    expect(parsePercent('1,5 a.m.')).toBe(1.5);
    expect(parsePercent('13,75% a.a.')).toBe(13.75);
    expect(parsePercent(',5')).toBe(0.5);
    expect(parsePercent('0')).toBe(0);
  });
  it('rejeita vazio, negativo e texto inválido', () => {
    expect(parsePercent('')).toBeNull();
    expect(parsePercent('-1')).toBeNull();
    expect(parsePercent('1,2,3')).toBeNull();
    expect(parsePercent('abc')).toBeNull();
    expect(parsePercent('2,')).toBeNull();
  });
});

describe('parsePositiveInt', () => {
  it('só inteiros positivos', () => {
    expect(parsePositiveInt(' 12 ')).toBe(12);
    expect(parsePositiveInt('0')).toBeNull();
    expect(parsePositiveInt('1.5')).toBeNull();
    expect(parsePositiveInt('')).toBeNull();
  });
});

describe('formatDuration', () => {
  it('anos e meses em pt-BR', () => {
    expect(formatDuration(0)).toBe('0 meses');
    expect(formatDuration(1)).toBe('1 mês');
    expect(formatDuration(11)).toBe('11 meses');
    expect(formatDuration(12)).toBe('1 ano');
    expect(formatDuration(13)).toBe('1 ano e 1 mês');
    expect(formatDuration(27)).toBe('2 anos e 3 meses');
    expect(formatDuration(240)).toBe('20 anos');
  });
});

describe('monthShortFrom / monthLongFrom', () => {
  it('conta meses a partir do mês de hoje', () => {
    expect(monthShortFrom('2026-10-15', 0)).toBe('out/26');
    expect(monthShortFrom('2026-10-31', 4)).toBe('fev/27');
    expect(monthLongFrom('2026-10-15', 3)).toBe('Janeiro de 2027');
  });
});
