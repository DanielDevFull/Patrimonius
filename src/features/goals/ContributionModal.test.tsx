import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { addAccount, addGoal, deleteOrArchiveAccount, updateAccount } from '@/db/repo';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { Account } from '@/domain/types';
import { renderWithProviders, resetDb } from '@/test/render';
import GoalsPage from './GoalsPage';

function seedAccount(name: string, p: Partial<Account> = {}) {
  return addAccount({
    name,
    type: 'corrente',
    initialBalance: 500000,
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

function seedGoal(accountId: string | null) {
  return addGoal({
    name: 'Viagem',
    targetAmount: 300000,
    targetDate: null,
    icon: '✈️',
    color: '#2563eb',
    priority: 'media',
    status: 'ativa',
    accountId,
    notes: '',
  });
}

async function openContribution() {
  const user = userEvent.setup();
  renderWithProviders(<GoalsPage />, { route: '/metas' });
  await screen.findByRole('heading', { name: 'Metas', level: 1 });
  await user.click(within(screen.getByRole('article', { name: 'Viagem' })).getByRole('button', { name: 'Aportar em Viagem' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Aportar em Viagem' }));
  return { user, dialog };
}

describe('ContributionModal', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
    await resetDb();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('conta da meta arquivada: anuncia e grava uma despesa (não uma transferência para fora dos saldos)', async () => {
    const banco = await seedAccount('Banco');
    const reserva = await seedAccount('Reserva', { type: 'poupanca', initialBalance: 0 });
    await seedGoal(reserva.id);
    await updateAccount(reserva.id, { archived: true });
    const { user, dialog } = await openContribution();

    await user.type(dialog.getByLabelText('Valor'), '100');
    await user.selectOptions(dialog.getByLabelText('Debitar de uma conta (opcional)'), banco.id);
    expect(dialog.getByText(/Será criada uma despesa em “Investimentos e reserva” na conta Banco/)).toBeInTheDocument();
    expect(dialog.queryByText(/transferência de Banco para Reserva/)).not.toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Aportar' }));

    expect(await screen.findByText('Aporte registrado.')).toBeInTheDocument();
    const [tx] = await db.transactions.toArray();
    expect(tx).toMatchObject({ type: 'despesa', categoryId: CATEGORY_IDS.investimentos, toAccountId: null });
  });

  it('conta da meta excluída: o modal e o lançamento gravado concordam (despesa)', async () => {
    const banco = await seedAccount('Banco');
    const poupanca = await seedAccount('Poupança', { type: 'poupanca', initialBalance: 0 });
    await seedGoal(poupanca.id);
    expect(await deleteOrArchiveAccount(poupanca.id)).toBe('deleted');
    const { user, dialog } = await openContribution();

    await user.type(dialog.getByLabelText('Valor'), '1000');
    await user.selectOptions(dialog.getByLabelText('Debitar de uma conta (opcional)'), banco.id);
    expect(dialog.getByText(/Será criada uma despesa em “Investimentos e reserva” na conta Banco/)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Aportar' }));

    expect(await screen.findByText('Aporte registrado.')).toBeInTheDocument();
    const [tx] = await db.transactions.toArray();
    expect(tx).toMatchObject({ type: 'despesa', toAccountId: null });
  });

  it('meta sem conta: avisa que o valor sai do patrimônio e oferece vincular uma conta', async () => {
    const banco = await seedAccount('Banco');
    await seedGoal(null);
    const { user, dialog } = await openContribution();

    await user.selectOptions(dialog.getByLabelText('Debitar de uma conta (opcional)'), banco.id);
    expect(dialog.getByText(/o valor sai dos seus saldos e do patrimônio/)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Vincular conta' }));

    expect(await screen.findByRole('dialog', { name: 'Editar meta' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Aportar em Viagem' })).not.toBeInTheDocument();
  });
});
