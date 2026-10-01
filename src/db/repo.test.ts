/**
 * Regras de negócio do repositório: vínculos entre contas, metas, dívidas e lançamentos; criação de recorrências.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { accountBalances, debtsOverview, goalsOverview, monthSummary, totalBalance } from '@/analytics';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { Account } from '@/domain/types';
import { resetDb } from '@/test/render';
import { db } from './db';
import {
  addAccount,
  addDebt,
  addDebtPayment,
  addGoal,
  addGoalContribution,
  addRecurring,
  deleteOrArchiveAccount,
  loadFinanceData,
  setTransactionStatus,
  updateAccount,
  updateTransaction,
} from './repo';

const TODAY = '2026-10-01';

function seedAccount(name: string, initialBalance: number, p: Partial<Account> = {}) {
  return addAccount({
    name,
    type: 'corrente',
    initialBalance,
    color: '#0f766e',
    icon: '🏦',
    archived: false,
    includeInNetWorth: true,
    creditLimit: null,
    closingDay: null,
    dueDay: null,
    ...p,
  });
}

function seedGoal(accountId: string | null, targetAmount = 300000) {
  return addGoal({
    name: 'Viagem',
    targetAmount,
    targetDate: null,
    icon: '✈️',
    color: '#2563eb',
    priority: 'media',
    status: 'ativa',
    accountId,
    notes: '',
  });
}

function seedLoan(balance: number) {
  return addDebt({
    name: 'Empréstimo',
    creditor: 'Banco',
    type: 'emprestimo',
    originalAmount: balance,
    balance,
    balanceDate: '2026-09-01',
    interestRate: 0,
    minimumPayment: 10000,
    dueDay: 10,
    remainingInstallments: null,
    status: 'ativa',
    notes: '',
  });
}

beforeEach(async () => {
  await resetDb();
});

describe('conta ligada a uma meta', () => {
  it('excluir a conta desvincula a meta; o aporte seguinte vira despesa e não transferência para a conta-fantasma', async () => {
    const banco = await seedAccount('Banco', 500000);
    const poupanca = await seedAccount('Poupança', 0, { type: 'poupanca' });
    const goal = await seedGoal(poupanca.id);

    expect(await deleteOrArchiveAccount(poupanca.id)).toBe('deleted');
    expect((await db.goals.get(goal.id))?.accountId).toBeNull();

    await addGoalContribution({ goalId: goal.id, amount: 100000, date: TODAY, fromAccountId: banco.id });
    const [tx] = await db.transactions.toArray();
    expect(tx).toMatchObject({ type: 'despesa', categoryId: CATEGORY_IDS.investimentos, toAccountId: null });

    // O dinheiro que saiu aparece no fluxo do mês (antes: sumia do saldo sem aparecer em lugar nenhum).
    const data = await loadFinanceData();
    expect(monthSummary(data.transactions, '2026-10').invested).toBe(100000);
  });

  it('meta apontando para conta inexistente (dados antigos) também cai no caminho da despesa', async () => {
    const banco = await seedAccount('Banco', 500000);
    const goal = await seedGoal('conta-que-nao-existe');
    await addGoalContribution({ goalId: goal.id, amount: 20000, date: TODAY, fromAccountId: banco.id });
    const [tx] = await db.transactions.toArray();
    expect(tx.type).toBe('despesa');
    expect(tx.toAccountId).toBeNull();
  });

  it('meta ligada a conta arquivada: o aporte não vai para uma conta fora dos saldos', async () => {
    const banco = await seedAccount('Banco', 100000);
    const reserva = await seedAccount('Reserva', 0, { type: 'poupanca' });
    const goal = await seedGoal(reserva.id);
    await updateAccount(reserva.id, { archived: true });

    await addGoalContribution({ goalId: goal.id, amount: 20000, date: TODAY, fromAccountId: banco.id });
    const [tx] = await db.transactions.toArray();
    expect(tx).toMatchObject({ type: 'despesa', categoryId: CATEGORY_IDS.investimentos, toAccountId: null });
  });

  it('com a conta da meta ativa, o aporte continua sendo transferência', async () => {
    const banco = await seedAccount('Banco', 100000);
    const reserva = await seedAccount('Reserva', 0, { type: 'poupanca' });
    const goal = await seedGoal(reserva.id);
    await addGoalContribution({ goalId: goal.id, amount: 20000, date: TODAY, fromAccountId: banco.id });
    const [tx] = await db.transactions.toArray();
    expect(tx).toMatchObject({ type: 'transferencia', accountId: banco.id, toAccountId: reserva.id });
    const data = await loadFinanceData();
    expect(totalBalance(data.accounts, data.transactions)).toBe(100000);
  });

  it('conta com lançamentos é arquivada e a meta mantém o vínculo', async () => {
    const banco = await seedAccount('Banco', 100000);
    const reserva = await seedAccount('Reserva', 0, { type: 'poupanca' });
    const goal = await seedGoal(reserva.id);
    await addGoalContribution({ goalId: goal.id, amount: 20000, date: TODAY, fromAccountId: banco.id });
    expect(await deleteOrArchiveAccount(reserva.id)).toBe('archived');
    expect((await db.goals.get(goal.id))?.accountId).toBe(reserva.id);
  });
});

describe('editar o lançamento de um pagamento de dívida ou aporte de meta', () => {
  it('valor corrigido no lançamento atualiza o pagamento e reabre a dívida', async () => {
    const banco = await seedAccount('Banco', 500000);
    const debt = await seedLoan(200000);
    const payment = await addDebtPayment({ debtId: debt.id, amount: 200000, date: TODAY, fromAccountId: banco.id });
    expect((await db.debts.get(debt.id))?.status).toBe('quitada');

    await updateTransaction(payment.transactionId!, { amount: 20000 });

    const data = await loadFinanceData();
    expect(accountBalances(data.accounts, data.transactions)[banco.id]).toBe(480000);
    expect((await db.debtPayments.get(payment.id))?.amount).toBe(20000);
    expect((await db.debts.get(debt.id))?.status).toBe('ativa');
    // Dívidas e Contas voltam a concordar: saíram R$ 200,00 e a dívida caiu R$ 200,00.
    expect(debtsOverview(data.debts, data.debtPayments).totalBalance).toBe(180000);
  });

  it('aumentar o valor quita a dívida; a data também é copiada', async () => {
    const banco = await seedAccount('Banco', 500000);
    const debt = await seedLoan(100000);
    const payment = await addDebtPayment({ debtId: debt.id, amount: 50000, date: TODAY, fromAccountId: banco.id });
    await updateTransaction(payment.transactionId!, { amount: 100000, date: '2026-10-03' });
    expect(await db.debtPayments.get(payment.id)).toMatchObject({ amount: 100000, date: '2026-10-03' });
    expect((await db.debts.get(debt.id))?.status).toBe('quitada');
  });

  it('valor corrigido no lançamento atualiza o aporte e o status da meta', async () => {
    const banco = await seedAccount('Banco', 500000);
    const goal = await seedGoal(null, 100000);
    const contribution = await addGoalContribution({
      goalId: goal.id,
      amount: 100000,
      date: TODAY,
      fromAccountId: banco.id,
    });
    expect((await db.goals.get(goal.id))?.status).toBe('concluida');

    await updateTransaction(contribution.transactionId!, { amount: 30000, date: '2026-10-02' });

    expect(await db.goalContributions.get(contribution.id)).toMatchObject({ amount: 30000, date: '2026-10-02' });
    expect((await db.goals.get(goal.id))?.status).toBe('ativa');
    const data = await loadFinanceData();
    expect(goalsOverview(data.goals, data.goalContributions, TODAY).totalSaved).toBe(30000);
  });

  it('virar receita desfaz o vínculo; mudar só o status não mexe no pagamento', async () => {
    const banco = await seedAccount('Banco', 500000);
    const debt = await seedLoan(100000);
    const payment = await addDebtPayment({ debtId: debt.id, amount: 50000, date: TODAY, fromAccountId: banco.id });
    await setTransactionStatus(payment.transactionId!, 'pendente');
    expect(await db.debtPayments.get(payment.id)).toMatchObject({ amount: 50000, transactionId: payment.transactionId });

    await updateTransaction(payment.transactionId!, { type: 'receita', categoryId: CATEGORY_IDS.outrosReceita });
    expect(await db.debtPayments.get(payment.id)).toMatchObject({ amount: 50000, transactionId: null });
  });
});

describe('addRecurring', () => {
  const rule = {
    type: 'despesa' as const,
    amount: 200000,
    description: 'Aluguel',
    categoryId: CATEGORY_IDS.moradia,
    frequency: 'mensal' as const,
    startDate: '2026-01-05',
    endDate: null,
    autoGenerate: true,
    active: true,
  };

  it('nextDate informado não gera as ocorrências antigas (o início continua sendo a âncora)', async () => {
    const banco = await seedAccount('Banco', 500000);
    const created = await addRecurring({ ...rule, accountId: banco.id, nextDate: '2026-10-05' });
    // runRecurring usa a data real; a regra fica com a primeira ocorrência ainda não gerada >= 05/10.
    expect(created.startDate).toBe('2026-01-05');
    const dates = (await db.transactions.toArray()).map((t) => t.date);
    expect(dates.every((d) => d >= '2026-10-05')).toBe(true);
  });

  it('sem nextDate mantém o comportamento antigo (gera desde o início) e ignora nextDate anterior ao início', async () => {
    const banco = await seedAccount('Banco', 500000);
    await addRecurring({ ...rule, accountId: banco.id, startDate: '2026-09-05', nextDate: '2020-01-01' });
    const dates = (await db.transactions.toArray()).map((t) => t.date).sort();
    expect(dates[0]).toBe('2026-09-05');
  });
});
