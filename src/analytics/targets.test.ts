import { describe, expect, it } from 'vitest';
import { REFERENCE_SAVINGS_PCT, savingsTargetPct } from './targets';

describe('savingsTargetPct', () => {
  it('devolve a meta das Configurações em %', () => {
    expect(savingsTargetPct({ savingsRateTarget: 20 })).toBe(20);
    expect(savingsTargetPct({ savingsRateTarget: 35 })).toBe(35);
  });

  it('0% (ou valor inválido) é "sem meta": null, nunca um 20% implícito', () => {
    expect(savingsTargetPct({ savingsRateTarget: 0 })).toBeNull();
    expect(savingsTargetPct({ savingsRateTarget: -5 })).toBeNull();
    expect(savingsTargetPct({ savingsRateTarget: Number.NaN })).toBeNull();
  });

  it('a referência (para a nota de saúde) é o "20" da regra 50/30/20', () => {
    expect(REFERENCE_SAVINGS_PCT).toBe(20);
  });
});
