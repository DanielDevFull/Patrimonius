import { describe, expect, it } from 'vitest';
import { makeAccount, makeData } from '@/test/factories';
import { respond } from '../responder';
describe('metas "em N meses"', () => {
  it('"em 12 meses" planeja exatamente 12 aportes mensais', () => {
    const data = makeData({ accounts: [makeAccount()] });
    const { reply } = respond('criar meta carro de 12 mil em 12 meses', data, '2026-10-01', {});
    expect(reply.text).toContain('durante 12 meses');
    expect(reply.text).toContain('R$ 1.000,00');
    const action = reply.actions.find((a) => a.type === 'create_goal');
    expect(action && action.type === 'create_goal' && action.draft.targetDate).toBe('2027-09-30');
  });
});
