/** Contexto fixo para os testes da NLU: hoje = quinta-feira, 01/10/2026; categorias padrão; contas e metas de exemplo. */
import { makeAccount, makeData, makeGoal } from '@/test/factories';
import type { NluContext } from './index';

export const TODAY = '2026-10-01';

export function makeNluContext(overrides: Partial<NluContext> = {}): NluContext {
  const data = makeData({
    accounts: [
      makeAccount({ id: 'acc-corrente', name: 'Conta corrente', type: 'corrente' }),
      makeAccount({ id: 'acc-poupanca', name: 'Poupança', type: 'poupanca' }),
      makeAccount({ id: 'acc-carteira', name: 'Carteira', type: 'carteira' }),
      makeAccount({ id: 'acc-nubank', name: 'Cartão Nubank', type: 'cartao_credito' }),
    ],
    goals: [
      makeGoal({ id: 'goal-viagem', name: 'Viagem' }),
      makeGoal({ id: 'goal-carro', name: 'Carro novo' }),
      makeGoal({ id: 'goal-reserva', name: 'Reserva de emergência' }),
    ],
  });
  return {
    today: TODAY,
    categories: data.categories,
    accounts: data.accounts,
    goals: data.goals,
    transactions: [],
    ...overrides,
  };
}
