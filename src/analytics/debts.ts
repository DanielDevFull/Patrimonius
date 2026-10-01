import type { Cents, Debt, DebtPayment, ISODate } from '@/domain/types';
import type { DebtsOverview, PayoffDebtInput, PayoffPlan, PayoffStrategy, StrategyComparison } from './types';

/**
 * Saldo devedor atual: max(0, debt.balance - soma dos pagamentos da dívida com date >= debt.balanceDate
 * e date <= asOf (se informado)). Dívida 'quitada' retorna 0.
 */
export function debtCurrentBalance(debt: Debt, payments: DebtPayment[], asOf?: ISODate): Cents {
  void debt;
  void payments;
  void asOf;
  throw new Error('não implementado');
}

/** Visão consolidada das dívidas (ver DebtsOverview). */
export function debtsOverview(debts: Debt[], payments: DebtPayment[]): DebtsOverview {
  void debts;
  void payments;
  throw new Error('não implementado');
}

/**
 * Simula a quitação mês a mês com um orçamento mensal FIXO para dívidas (`monthlyBudget`):
 * 1) juros: saldo += round(saldo * taxa/100); 2) paga o mínimo de cada dívida (limitado ao saldo);
 * 3) o que sobrar do orçamento vai para a dívida-alvo (avalanche: maior taxa; snowball: menor saldo; empate: ordem de entrada),
 *    repetindo para a próxima se a alvo zerar. Mínimos de dívidas quitadas ficam disponíveis (bola de neve natural).
 * Se monthlyBudget < soma dos mínimos, paga proporcionalmente aos mínimos e o plano é feasible=false.
 * Para em `maxMonths` (padrão 600) => feasible=false.
 */
export function simulatePayoff(
  debts: PayoffDebtInput[],
  monthlyBudget: Cents,
  strategy: PayoffStrategy,
  maxMonths?: number,
): PayoffPlan {
  void debts;
  void monthlyBudget;
  void strategy;
  void maxMonths;
  throw new Error('não implementado');
}

/** Roda as duas estratégias e recomenda a de menor custo de juros. */
export function compareStrategies(debts: PayoffDebtInput[], monthlyBudget: Cents): StrategyComparison {
  void debts;
  void monthlyBudget;
  throw new Error('não implementado');
}

/** Converte dívidas ativas do domínio em entradas de simulação (saldo atual, taxa, mínimo). */
export function toPayoffInputs(debts: Debt[], payments: DebtPayment[]): PayoffDebtInput[] {
  void debts;
  void payments;
  throw new Error('não implementado');
}
