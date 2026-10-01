import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { addAccount, addGoal, addGoalContribution, updateSettings } from '@/db/repo';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { Account, Goal } from '@/domain/types';
import { describeElements, gridsWithoutBaseColumns } from '@/test/layout';
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

function seedGoal(name: string, p: Partial<Goal> = {}) {
  return addGoal({
    name,
    targetAmount: 300000,
    targetDate: null,
    icon: '🎯',
    color: '#2563eb',
    priority: 'media',
    status: 'ativa',
    accountId: null,
    notes: '',
    ...p,
  });
}

async function renderPage() {
  const user = userEvent.setup();
  renderWithProviders(<GoalsPage />, { route: '/metas' });
  await screen.findByRole('heading', { name: 'Metas', level: 1 });
  return user;
}

function card(name: string) {
  return within(screen.getByRole('article', { name }));
}

describe('GoalsPage', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
    await resetDb();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('nome da meta não é cortado numa linha só ao lado dos botões (até 2 linhas, texto completo no title)', async () => {
    await seedGoal('Reserva de emergência para a família');
    await renderPage();
    const heading = await screen.findByRole('heading', { name: 'Reserva de emergência para a família', level: 3 });
    expect(heading).not.toHaveClass('truncate');
    expect(heading).toHaveClass('line-clamp-2');
    expect(heading).toHaveAttribute('title', 'Reserva de emergência para a família');
  });

  it('estado vazio: cria uma meta validando os campos e mostrando o plano mensal', async () => {
    const poupanca = await seedAccount('Poupança', { type: 'poupanca', icon: '🐷' });
    await seedAccount('Cartão', { type: 'cartao_credito', icon: '💳', initialBalance: 0 });
    const user = await renderPage();
    expect(await screen.findByText('Nenhuma meta ainda')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Criar minha primeira meta' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Nova meta' }));
    await waitFor(() => expect(dialog.getByLabelText('Nome da meta')).toHaveFocus());
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(dialog.getByText('Dê um nome para a meta.')).toBeInTheDocument();
    expect(dialog.getByText('Informe um valor maior que zero.')).toBeInTheDocument();

    await user.type(dialog.getByLabelText('Nome da meta'), 'Viagem para o Chile');
    await user.type(dialog.getByLabelText('Valor alvo'), '12.000');
    fireEvent.change(dialog.getByLabelText('Prazo (opcional)'), { target: { value: '2026-09-01' } });
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(dialog.getByText('Escolha uma data a partir de hoje.')).toBeInTheDocument();

    fireEvent.change(dialog.getByLabelText('Prazo (opcional)'), { target: { value: '2027-04-30' } });
    // Outubro (ainda sem aporte) a abril: 7 meses de aporte.
    expect(dialog.getByText(/Para chegar lá em 7 meses/)).toHaveTextContent('guarde cerca de R$ 1.714,29 por mês');
    await user.click(dialog.getByRole('button', { name: 'Usar ✈️' }));
    expect(dialog.getByLabelText('Emoji')).toHaveValue('✈️');
    await user.click(dialog.getByRole('radio', { name: 'Violeta' }));
    await user.selectOptions(dialog.getByLabelText('Prioridade'), 'alta');
    const accountSelect = dialog.getByLabelText('Conta onde o dinheiro fica (opcional)');
    expect(within(accountSelect).queryByRole('option', { name: /Cartão/ })).not.toBeInTheDocument();
    await user.selectOptions(accountSelect, poupanca.id);
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Meta criada. Agora é só começar a guardar!')).toBeInTheDocument();
    const [goal] = await db.goals.toArray();
    expect(goal).toMatchObject({
      name: 'Viagem para o Chile',
      targetAmount: 1200000,
      targetDate: '2027-04-30',
      icon: '✈️',
      color: '#7c3aed',
      priority: 'alta',
      status: 'ativa',
      accountId: poupanca.id,
    });

    await screen.findByRole('article', { name: 'Viagem para o Chile' });
    const c = card('Viagem para o Chile');
    // Recém-criada e sem aportes: não nasce "Atrasada"; a dica é como começar (12.000 em 7 meses, out a abr).
    expect(c.getByText('No ritmo')).toBeInTheDocument();
    expect(c.queryByText('Atrasada')).not.toBeInTheDocument();
    expect(c.getByText('Prioridade alta')).toBeInTheDocument();
    expect(c.getByText('Aporte mensal necessário').nextElementSibling).toHaveTextContent('R$ 1.714,29');
    expect(c.getByText(/Comece com aportes de/)).toHaveTextContent('R$ 1.714,29 por mês');
    expect(c.getByText(/Guardado em/)).toHaveTextContent('Guardado em 🐷 Poupança');
    expect(c.getByText('Prazo').nextElementSibling).toHaveTextContent('30/04/20277 meses para aportar');
  });

  it('modelo "Reserva de emergência" usa o alvo calculado pela reserva', async () => {
    // Sem histórico, o custo essencial é 50% da renda estimada: 2.500 x 6 meses = 15.000
    await updateSettings({ monthlyIncomeEstimate: 500000 });
    const user = await renderPage();
    const template = await screen.findByRole('button', {
      name: 'Criar meta a partir do modelo Reserva de emergência',
    });
    expect(template).toHaveTextContent('Sugestão: R$ 15.000,00');
    expect(screen.getByRole('button', { name: 'Criar meta a partir do modelo Casa própria' })).toBeInTheDocument();
    await user.click(template);

    const dialog = within(await screen.findByRole('dialog', { name: 'Nova meta' }));
    expect(dialog.getByLabelText('Nome da meta')).toHaveValue('Reserva de emergência');
    expect(dialog.getByLabelText('Valor alvo')).toHaveValue('15.000,00');
    expect(dialog.getByLabelText('Emoji')).toHaveValue('🛟');
    expect(dialog.getByLabelText('Prioridade')).toHaveValue('alta');
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));

    await waitFor(async () => expect(await db.goals.count()).toBe(1));
    expect((await db.goals.toArray())[0]).toMatchObject({
      name: 'Reserva de emergência',
      targetAmount: 1500000,
      targetDate: null,
      priority: 'alta',
    });
    const c = within(await screen.findByRole('article', { name: 'Reserva de emergência' }));
    expect(c.getByText('Sem prazo')).toBeInTheDocument();
    // Com metas cadastradas, os modelos continuam como atalhos rápidos
    expect(screen.getByRole('heading', { name: 'Modelos rápidos' })).toBeInTheDocument();
  });

  it('aportar até concluir: debita da conta, comemora e move para concluídas; resgatar reabre', async () => {
    const banco = await seedAccount('Banco');
    await seedGoal('Notebook', { targetAmount: 300000 });
    const user = await renderPage();
    await screen.findByRole('article', { name: 'Notebook' });

    await user.click(card('Notebook').getByRole('button', { name: 'Aportar em Notebook' }));
    let dialog = within(await screen.findByRole('dialog', { name: 'Aportar em Notebook' }));
    await waitFor(() => expect(dialog.getByLabelText('Valor')).toHaveFocus());
    await user.type(dialog.getByLabelText('Valor'), '1.000');
    await user.type(dialog.getByLabelText('Observação (opcional)'), 'Primeira parte');
    await user.click(dialog.getByRole('button', { name: 'Aportar' }));

    expect(await screen.findByText('Aporte registrado.')).toBeInTheDocument();
    let contributions = await db.goalContributions.toArray();
    expect(contributions).toEqual([
      expect.objectContaining({ amount: 100000, date: '2026-10-15', note: 'Primeira parte', transactionId: null }),
    ]);
    await waitFor(() => expect(card('Notebook').getByText('Falta').nextElementSibling).toHaveTextContent('R$ 2.000,00'));
    expect(card('Notebook').getByText('Sem prazo')).toBeInTheDocument();
    expect(card('Notebook').getByText('Prazo').nextElementSibling).toHaveTextContent('Não definido');
    expect(await db.transactions.count()).toBe(0);

    await user.click(card('Notebook').getByRole('button', { name: 'Aportar em Notebook' }));
    dialog = within(await screen.findByRole('dialog', { name: 'Aportar em Notebook' }));
    await waitFor(() => expect(dialog.getByLabelText('Valor')).toHaveFocus());
    await user.click(dialog.getByRole('button', { name: /Tudo o que falta/ }));
    expect(dialog.getByLabelText('Valor')).toHaveValue('2.000,00');
    await user.selectOptions(dialog.getByLabelText('Debitar de uma conta (opcional)'), banco.id);
    expect(dialog.getByText(/Será criada uma despesa/)).toHaveTextContent(
      'Será criada uma despesa em “Investimentos e reserva” na conta Banco: o valor sai dos seus saldos e do patrimônio.',
    );
    await user.click(dialog.getByRole('button', { name: 'Aportar' }));

    expect(await screen.findByText('🎉 Parabéns! Você concluiu a meta “Notebook”!')).toBeInTheDocument();
    await waitFor(async () => expect((await db.goals.toArray())[0].status).toBe('concluida'));
    const [tx] = await db.transactions.toArray();
    expect(tx).toMatchObject({
      type: 'despesa',
      amount: 200000,
      categoryId: CATEGORY_IDS.investimentos,
      accountId: banco.id,
      description: 'Aporte: Notebook',
      status: 'pago',
    });

    const done = within(await screen.findByRole('region', { name: 'Concluídas' }));
    const doneCard = within(done.getByRole('article', { name: 'Notebook' }));
    expect(doneCard.getByText('Concluída')).toBeInTheDocument();
    expect(doneCard.getByText('Meta concluída! Parabéns!')).toBeInTheDocument();
    expect(doneCard.getByText('Concluída em').nextElementSibling).toHaveTextContent('15/10/2026');
    expect(doneCard.getByRole('progressbar', { name: 'Progresso da meta Notebook' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
    expect(screen.queryByRole('region', { name: 'Em andamento' })).not.toBeInTheDocument();
    await user.click(doneCard.getByRole('button', { name: 'Fechar' }));
    expect(doneCard.queryByText('Meta concluída! Parabéns!')).not.toBeInTheDocument();

    // Resgatar de uma meta concluída a reabre
    await user.click(doneCard.getByRole('button', { name: 'Resgatar de Notebook' }));
    dialog = within(await screen.findByRole('dialog', { name: 'Resgatar de Notebook' }));
    await waitFor(() => expect(dialog.getByLabelText('Valor')).toHaveFocus());
    await user.type(dialog.getByLabelText('Valor'), '3.500');
    await user.click(dialog.getByRole('button', { name: 'Resgatar' }));
    expect(dialog.getByText('O resgate não pode ser maior que o valor guardado.')).toBeInTheDocument();
    await user.clear(dialog.getByLabelText('Valor'));
    await user.type(dialog.getByLabelText('Valor'), '500');
    await user.click(dialog.getByRole('button', { name: 'Resgatar' }));

    expect(await screen.findByText('Resgate registrado.')).toBeInTheDocument();
    await waitFor(async () => expect((await db.goals.toArray())[0].status).toBe('ativa'));
    contributions = await db.goalContributions.toArray();
    expect(contributions.map((c) => c.amount).sort((a, b) => a - b)).toEqual([-50000, 100000, 200000]);
    const active = within(await screen.findByRole('region', { name: 'Em andamento' }));
    expect(active.getByRole('article', { name: 'Notebook' })).toHaveTextContent('R$ 2.500,00 de R$ 3.000,00');
    // resgate não cria lançamento
    expect(await db.transactions.count()).toBe(1);
  });

  it('histórico permite excluir aporte (reabrindo a meta); pausar, retomar e excluir meta', async () => {
    const goal = await seedGoal('Carro', { targetAmount: 100000 });
    await addGoalContribution({ goalId: goal.id, amount: 100000, date: '2026-10-10', note: 'Bônus' });
    const user = await renderPage();

    const done = within(await screen.findByRole('region', { name: 'Concluídas' }));
    const doneCard = within(done.getByRole('article', { name: 'Carro' }));
    // Meta concluída não pode ser pausada
    expect(doneCard.queryByRole('button', { name: 'Pausar meta Carro' })).not.toBeInTheDocument();
    await user.click(doneCard.getByRole('button', { name: 'Histórico (1)' }));
    const history = within(doneCard.getByRole('list', { name: 'Histórico de aportes de Carro' }));
    expect(history.getByText('Aporte · 10/10/2026')).toBeInTheDocument();
    expect(history.getByText('Bônus')).toBeInTheDocument();
    expect(history.getByText('+R$ 1.000,00')).toBeInTheDocument();

    await user.click(history.getByRole('button', { name: 'Excluir aporte de 10/10/2026' }));
    const confirmDelete = within(await screen.findByRole('dialog', { name: 'Excluir aporte de 10/10/2026?' }));
    await user.click(confirmDelete.getByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('Aporte excluído.')).toBeInTheDocument();
    await waitFor(async () => expect(await db.goals.get(goal.id)).toMatchObject({ status: 'ativa' }));
    expect(await db.goalContributions.count()).toBe(0);
    const active = within(await screen.findByRole('region', { name: 'Em andamento' }));
    expect(active.getByRole('article', { name: 'Carro' })).toHaveTextContent('Faça o primeiro aporte');

    await user.click(card('Carro').getByRole('button', { name: 'Pausar meta Carro' }));
    await waitFor(async () => expect((await db.goals.get(goal.id))?.status).toBe('pausada'));
    const paused = within(await screen.findByRole('region', { name: 'Pausadas' }));
    expect(within(paused.getByRole('article', { name: 'Carro' })).getByText('Pausada')).toBeInTheDocument();

    await user.click(card('Carro').getByRole('button', { name: 'Retomar meta Carro' }));
    await waitFor(async () => expect((await db.goals.get(goal.id))?.status).toBe('ativa'));
    expect(await screen.findByText('Meta retomada.')).toBeInTheDocument();

    await user.click(card('Carro').getByRole('button', { name: 'Excluir meta Carro' }));
    const confirmGoal = within(await screen.findByRole('dialog', { name: 'Excluir a meta “Carro”?' }));
    await user.click(confirmGoal.getByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('Meta excluída.')).toBeInTheDocument();
    expect(await screen.findByText('Nenhuma meta ainda')).toBeInTheDocument();
    expect(await db.goals.count()).toBe(0);
  });

  it('editar o alvo para baixo do valor guardado conclui a meta; aumentar reabre', async () => {
    const goal = await seedGoal('Bicicleta', { targetAmount: 200000, priority: 'baixa' });
    await addGoalContribution({ goalId: goal.id, amount: 150000, date: '2026-10-01' });
    const user = await renderPage();
    await screen.findByRole('article', { name: 'Bicicleta' });
    expect(card('Bicicleta').getByText('Prioridade baixa')).toBeInTheDocument();

    await user.click(card('Bicicleta').getByRole('button', { name: 'Editar meta Bicicleta' }));
    let dialog = within(await screen.findByRole('dialog', { name: 'Editar meta' }));
    await waitFor(() => expect(dialog.getByLabelText('Nome da meta')).toHaveFocus());
    expect(dialog.getByLabelText('Valor alvo')).toHaveValue('2.000,00');
    await user.clear(dialog.getByLabelText('Valor alvo'));
    await user.type(dialog.getByLabelText('Valor alvo'), '1.500');
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Meta atualizada.')).toBeInTheDocument();
    await waitFor(async () =>
      expect(await db.goals.get(goal.id)).toMatchObject({ targetAmount: 150000, status: 'concluida' }),
    );
    const done = within(await screen.findByRole('region', { name: 'Concluídas' }));
    expect(done.getByRole('article', { name: 'Bicicleta' })).toBeInTheDocument();

    await user.click(card('Bicicleta').getByRole('button', { name: 'Editar meta Bicicleta' }));
    dialog = within(await screen.findByRole('dialog', { name: 'Editar meta' }));
    await waitFor(() => expect(dialog.getByLabelText('Nome da meta')).toHaveFocus());
    await user.clear(dialog.getByLabelText('Valor alvo'));
    await user.type(dialog.getByLabelText('Valor alvo'), '1.800');
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));
    await waitFor(async () =>
      expect(await db.goals.get(goal.id)).toMatchObject({ targetAmount: 180000, status: 'ativa' }),
    );
    await screen.findByRole('region', { name: 'Em andamento' });
  });

  it('resumo soma o total guardado, as metas e o aporte mensal necessário', async () => {
    const a = await seedGoal('Viagem', { targetAmount: 600000, targetDate: '2027-04-30' }); // 6 meses
    const b = await seedGoal('Curso', { targetAmount: 100000, targetDate: '2026-12-31' }); // 2 meses
    await seedGoal('Sonho', { targetAmount: 1000000, status: 'pausada' });
    await addGoalContribution({ goalId: a.id, amount: 120000, date: '2026-10-01' });
    await addGoalContribution({ goalId: b.id, amount: 20000, date: '2026-10-02' });
    await renderPage();

    const summary = within(await screen.findByRole('region', { name: 'Resumo das metas' }));
    expect(summary.getByText('Total guardado').nextElementSibling).toHaveTextContent('R$ 1.400,00');
    expect(summary.getByText(/^de /)).toHaveTextContent('de R$ 17.000,00');
    // Viagem: (6000 - 1200) / 6 = 800; Curso: (1000 - 200) / 2 = 400; pausada não entra
    expect(summary.getByText('Aporte mensal necessário').nextElementSibling).toHaveTextContent('R$ 1.200,00');
    expect(summary.getByText('2 em andamento')).toBeInTheDocument();

    // Meta criada neste mês: o ritmo divide só pelos meses desde o início dela (antes: 1.200 / 3 = 400 e "atrasada").
    const viagem = card('Viagem');
    expect(viagem.getByText('Média de aportes').nextElementSibling).toHaveTextContent('R$ 1.200,00/mês');
    expect(viagem.getByText('Previsão de conclusão').nextElementSibling).toHaveTextContent('fevereiro de 2027'); // 4.800 / 1.200 = 4 meses
    expect(viagem.getByText('Você está no ritmo certo para cumprir o prazo. Continue assim!')).toBeInTheDocument();
    expect(viagem.queryByText(/aumente os aportes em cerca de/)).not.toBeInTheDocument();
    expect(card('Sonho').getByRole('button', { name: 'Resgatar de Sonho' })).toBeDisabled();
  });

  it('layout no celular: grids com coluna base minmax(0,1fr), sem coluna "auto" que deixa os cards mais largos que a tela', async () => {
    // Estado vazio (modelos em grade).
    const { unmount } = renderWithProviders(<GoalsPage />, { route: '/metas' });
    expect(await screen.findByText('Nenhuma meta ainda')).toBeInTheDocument();
    expect(describeElements(gridsWithoutBaseColumns(document.body))).toEqual([]);
    unmount();

    // Com metas: resumo e cards (nome truncado, badges e botões de ação).
    await seedGoal('Reserva de emergência para imprevistos da família', { targetAmount: 3000000 });
    await seedGoal('Viagem', { targetAmount: 800000, targetDate: '2026-12-31' });
    await renderPage();
    await screen.findByRole('region', { name: 'Resumo das metas' });
    await screen.findByRole('article', { name: 'Viagem' });
    expect(describeElements(gridsWithoutBaseColumns(document.body))).toEqual([]);
  });
});
