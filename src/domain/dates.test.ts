import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  diffDays,
  diffMonths,
  endOfMonth,
  isPlausibleDate,
  lastMonths,
  plausibleDateRange,
} from './dates';

describe('dates', () => {
  it('addMonths limita ao fim do mês e respeita âncora', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -2)).toBe('2025-11-15');
  });
  it('addDays/diffDays', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(diffDays('2026-10-01', '2026-10-31')).toBe(30);
  });
  it('meses', () => {
    expect(endOfMonth('2028-02')).toBe('2028-02-29');
    expect(diffMonths('2026-10', '2027-03')).toBe(5);
    expect(lastMonths('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });
});

describe('isPlausibleDate', () => {
  const today = '2026-10-01';
  it('aceita datas válidas entre 1900 e o ano corrente + 10', () => {
    expect(isPlausibleDate('2026-10-01', today)).toBe(true);
    expect(isPlausibleDate('1900-01-01', today)).toBe(true);
    expect(isPlausibleDate('2036-12-31', today)).toBe(true);
  });
  it('recusa anos digitados errado e datas inválidas', () => {
    expect(isPlausibleDate('0226-01-10', today)).toBe(false);
    expect(isPlausibleDate('2062-01-10', today)).toBe(false);
    expect(isPlausibleDate('2037-01-01', today)).toBe(false);
    expect(isPlausibleDate('1899-12-31', today)).toBe(false);
    expect(isPlausibleDate('2026-02-30', today)).toBe(false);
    expect(isPlausibleDate('', today)).toBe(false);
  });
  it('plausibleDateRange dá os limites para o <input type="date">', () => {
    expect(plausibleDateRange(today)).toEqual({ min: '1900-01-01', max: '2036-12-31' });
  });
});
