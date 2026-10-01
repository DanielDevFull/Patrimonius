import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cashflowForecast } from '@/analytics';
import { db } from '@/db/db';
import { addAccount, addRecurring, loadFinanceData } from '@/db/repo';
import { CATEGORY_IDS } from '@/domain/defaults';
import { renderWithProviders, resetDb } from '@/test/render';
import RecurringPage from './RecurringPage';

function seedAccount() {
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

/** Abre "Nova recorrência" e preenche um aluguel mensal de R$ 2.000,00 com início em 05/01/2026. */
async function fillRent() {
  const user = userEvent.setup();
  renderWithProviders(<RecurringPage />, { route: '/recorrencias' });
  await screen.findByRole('heading', { name: 'Recorrências', level: 1 });
  await user.click(screen.getByRole('button', { name: 'Nova recorrência' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Nova recorrência' }));
  await user.type(dialog.getByLabelText('Valor'), '2000');
  await user.type(dialog.getByLabelText('Descrição'), 'Aluguel');
  await user.selectOptions(dialog.getByLabelText('Categoria'), CATEGORY_IDS.moradia);
  fireEvent.change(dialog.getByLabelText('Início'), { target: { value: '2026-01-05' } });
  return { user, dialog };
}

describe('RecurringFormModal: início no passado', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    await resetDb();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('por padrão a agenda começa no mês corrente: sem 9 pendentes vencidos afundando a previsão', async () => {
    const banco = await seedAccount();
    const { user, dialog } = await fillRent();
    const option = dialog.getByRole('switch', { name: /^Gerar também as 9 ocorrências anteriores a este mês/ });
    expect(option).not.toBeChecked();
    expect(dialog.getByText(/05\/01\/2026 a 05\/09\/2026/)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Recorrência criada (1 lançamento pendente gerado).')).toBeInTheDocument();
    const [rule] = await db.recurring.toArray();
    expect(rule).toMatchObject({ startDate: '2026-01-05', nextDate: '2026-11-05', accountId: banco.id });
    expect((await db.transactions.toArray()).map((t) => t.date)).toEqual(['2026-10-05']);

    const data = await loadFinanceData();
    const forecast = cashflowForecast(data, '2026-10-01');
    expect(forecast.expectedExpense).toBe(200000);
    expect(forecast.projectedEndBalance).toBeGreaterThan(0);
  });

  it('ligando a opção, as ocorrências antigas são geradas como pendentes', async () => {
    await seedAccount();
    const { user, dialog } = await fillRent();
    await user.click(dialog.getByRole('switch', { name: /^Gerar também as 9 ocorrências anteriores a este mês/ }));
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Recorrência criada (10 lançamentos pendentes gerados).')).toBeInTheDocument();
  });

  it('ligar a geração automática numa regra antiga não gera os meses anteriores', async () => {
    const banco = await seedAccount();
    await addRecurring({
      type: 'despesa',
      amount: 200000,
      description: 'Aluguel',
      categoryId: CATEGORY_IDS.moradia,
      accountId: banco.id,
      frequency: 'mensal',
      startDate: '2026-01-05',
      endDate: null,
      autoGenerate: false,
      active: true,
    });
    const user = userEvent.setup();
    renderWithProviders(<RecurringPage />, { route: '/recorrencias' });
    await screen.findByRole('heading', { name: 'Recorrências', level: 1 });
    const li = screen.getByText('Aluguel', { selector: 'span' }).closest('li');
    if (!li) throw new Error('regra não encontrada');
    await user.click(within(li).getByRole('button', { name: 'Ações de Aluguel' }));
    await user.click(screen.getByRole('menuitem', { name: 'Editar' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Editar recorrência' }));
    await user.click(dialog.getByRole('switch', { name: /^Gerar lançamentos automaticamente/ }));
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText(/^Recorrência atualizada/)).toBeInTheDocument();
    expect((await db.transactions.toArray()).map((t) => t.date)).toEqual(['2026-10-05']);
  });
});
