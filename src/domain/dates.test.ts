import { describe, expect, it } from 'vitest';
import { addDays, addMonths, diffDays, diffMonths, endOfMonth, lastMonths, parseDateBR } from './dates';

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
  it('parseDateBR', () => {
    expect(parseDateBR('05/10/2026')).toBe('2026-10-05');
    expect(parseDateBR('31/02/2026')).toBeNull();
  });
});
