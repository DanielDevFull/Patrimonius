/**
 * Cenário financeiro de exemplo para os testes do agente (insights, respostas e relatório).
 *
 * Hoje = quinta-feira, 15/10/2026. Pessoa com salário de R$ 6.000,00 e vida organizada:
 * - Contas: Conta corrente (R$ 5.000 inicial), Poupança (R$ 10.000) e Cartão Nubank (limite R$ 5.000).
 * - Jul, ago e set (meses completos, idênticos): salário 6.000 (dia 5), aporte 500 (dia 6), mercado 300 (dias 8, 18, 25),
 *   aluguel 1.500 (dia 10), restaurante 100 no cartão (dias 12 e 22), Netflix 55,90 no cartão (dia 14), cinema 150 (dia 20).
 *   Total de despesas por mês: R$ 3.305,90.
 * - Outubro até dia 14: salário, aporte, mercado (300), aluguel, restaurante (100) e Netflix — R$ 2.455,90 de despesas.
 * - Orçamento padrão: Mercado R$ 1.000. Meta: Viagem R$ 10.000 até 30/06/2027 com aportes de R$ 1.000 em ago, set e out.
 *
 * Saldos em 15/10: corrente R$ 17.550,00; poupança R$ 10.000,00; cartão -R$ 923,60.
 */
import { CATEGORY_IDS } from '@/domain/defaults';
import type { FinanceData, Transaction } from '@/domain/types';
import {
  makeAccount,
  makeBudget,
  makeContribution,
  makeData,
  makeGoal,
  makeTransaction,
} from '@/test/factories';

export const TODAY = '2026-10-15';
export const MONTH = '2026-10';

export const ACC = {
  corrente: 'acc-corrente',
  poupanca: 'acc-poupanca',
  cartao: 'acc-cartao',
} as const;

export const GOAL_VIAGEM = 'goal-viagem';

type TxInput = Partial<Transaction> & Pick<Transaction, 'amount' | 'date'>;

/** Lançamento (despesa paga na conta corrente, salvo indicação). */
export function tx(p: TxInput): Transaction {
  return makeTransaction({ accountId: ACC.corrente, ...p });
}

/** Lançamentos da primeira quinzena (dias 5 a 14) de um mês. */
function firstHalf(month: string): Transaction[] {
  return [
    tx({ type: 'receita', amount: 600000, date: `${month}-05`, description: 'Salário', categoryId: CATEGORY_IDS.salario }),
    tx({ amount: 50000, date: `${month}-06`, description: 'Aporte tesouro', categoryId: CATEGORY_IDS.investimentos }),
    tx({ amount: 30000, date: `${month}-08`, description: 'Mercado', categoryId: CATEGORY_IDS.mercado }),
    tx({ amount: 150000, date: `${month}-10`, description: 'Aluguel', categoryId: CATEGORY_IDS.moradia }),
    tx({
      amount: 10000,
      date: `${month}-12`,
      description: 'Restaurante',
      categoryId: CATEGORY_IDS.restaurantes,
      accountId: ACC.cartao,
    }),
    tx({
      amount: 5590,
      date: `${month}-14`,
      description: 'Netflix',
      categoryId: CATEGORY_IDS.assinaturas,
      accountId: ACC.cartao,
    }),
  ];
}

/** Lançamentos da segunda quinzena (dias 18 a 25) de um mês completo. */
function secondHalf(month: string): Transaction[] {
  return [
    tx({ amount: 30000, date: `${month}-18`, description: 'Mercado', categoryId: CATEGORY_IDS.mercado }),
    tx({ amount: 15000, date: `${month}-20`, description: 'Cinema', categoryId: CATEGORY_IDS.lazer }),
    tx({
      amount: 10000,
      date: `${month}-22`,
      description: 'Restaurante',
      categoryId: CATEGORY_IDS.restaurantes,
      accountId: ACC.cartao,
    }),
    tx({ amount: 30000, date: `${month}-25`, description: 'Mercado', categoryId: CATEGORY_IDS.mercado }),
  ];
}

export function baseTransactions(): Transaction[] {
  return [
    ...['2026-07', '2026-08', '2026-09'].flatMap((m) => [...firstHalf(m), ...secondHalf(m)]),
    ...firstHalf(MONTH),
  ];
}

/** Cenário completo e saudável; sobrescreva o que precisar. */
export function makeScenario(overrides: Partial<FinanceData> = {}): FinanceData {
  const base = makeData();
  return makeData({
    accounts: [
      makeAccount({ id: ACC.corrente, name: 'Conta corrente', type: 'corrente', initialBalance: 500000 }),
      makeAccount({ id: ACC.poupanca, name: 'Poupança', type: 'poupanca', initialBalance: 1000000, icon: '🐷' }),
      makeAccount({
        id: ACC.cartao,
        name: 'Cartão Nubank',
        type: 'cartao_credito',
        creditLimit: 500000,
        closingDay: 3,
        dueDay: 10,
        icon: '💳',
      }),
    ],
    transactions: baseTransactions(),
    budgets: [makeBudget({ categoryId: CATEGORY_IDS.mercado, amount: 100000 })],
    goals: [makeGoal({ id: GOAL_VIAGEM, name: 'Viagem', targetAmount: 1000000, targetDate: '2027-06-30' })],
    goalContributions: ['2026-08-03', '2026-09-03', '2026-10-03'].map((date) =>
      makeContribution({ goalId: GOAL_VIAGEM, amount: 100000, date }),
    ),
    settings: { ...base.settings, userName: 'Ana Lima' },
    ...overrides,
  });
}

/** Congela profundamente um objeto (para provar que as funções não alteram a entrada). */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}
