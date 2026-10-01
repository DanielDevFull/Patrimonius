import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { addAccount, addDebt, addDebtPayment, addGoal, addGoalContribution } from '@/db/repo';
import { renderWithProviders, resetDb } from '@/test/render';
import { TransactionFormModal } from './TransactionForm';

function seedBank() {
  return addAccount({
    name: 'Banco',
    type: 'corrente',
    initialBalance: 500000,
    color: '#0f766e',
    icon: '🏦',
    archived: false,
    includeInNetWorth: true,
    creditLimit: null,
    closingDay: null,
    dueDay: null,
  });
}

describe('TransactionFormModal: lançamento de pagamento de dívida / aporte de meta', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
    await resetDb();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('avisa do vínculo e corrigir o valor atualiza o pagamento da dívida', async () => {
    const banco = await seedBank();
    const debt = await addDebt({
      name: 'Empréstimo',
      creditor: 'Banco',
      type: 'emprestimo',
      originalAmount: 200000,
      balance: 200000,
      balanceDate: '2026-10-01',
      interestRate: 0,
      minimumPayment: 20000,
      dueDay: 10,
      remainingInstallments: null,
      status: 'ativa',
      notes: '',
    });
    const payment = await addDebtPayment({ debtId: debt.id, amount: 200000, date: '2026-10-10', fromAccountId: banco.id });
    const tx = await db.transactions.get(payment.transactionId!);
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<TransactionFormModal open onClose={onClose} transaction={tx} />);

    expect(
      await screen.findByText(/Este lançamento é o pagamento da dívida “Empréstimo”/),
    ).toBeInTheDocument();
    const amount = screen.getByLabelText('Valor');
    await user.clear(amount);
    await user.type(amount, '200');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    expect((await db.debtPayments.get(payment.id))?.amount).toBe(20000);
    expect((await db.debts.get(debt.id))?.status).toBe('ativa');
  });

  it('avisa quando o lançamento é o aporte de uma meta', async () => {
    const banco = await seedBank();
    const goal = await addGoal({
      name: 'Viagem',
      targetAmount: 300000,
      targetDate: null,
      icon: '✈️',
      color: '#2563eb',
      priority: 'media',
      status: 'ativa',
      accountId: null,
      notes: '',
    });
    const c = await addGoalContribution({ goalId: goal.id, amount: 10000, date: '2026-10-10', fromAccountId: banco.id });
    const tx = await db.transactions.get(c.transactionId!);
    renderWithProviders(<TransactionFormModal open onClose={vi.fn()} transaction={tx} />);
    expect(await screen.findByText(/Este lançamento é o aporte da meta “Viagem”/)).toBeInTheDocument();
  });
});
