import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { addAccount, addTransaction, setBudget, updateSettings } from '@/db/repo';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { ID, ISODate } from '@/domain/types';
import { renderWithProviders, resetDb } from '@/test/render';
import BudgetsPage from './BudgetsPage';

let accountId: ID;

async function expense(categoryId: ID, amount: number, date: ISODate) {
  await addTransaction({ type: 'despesa', amount, date, description: 'Gasto', categoryId, accountId });
}

async function renderPage() {
  const user = userEvent.setup();
  renderWithProviders(<BudgetsPage />, { route: '/orcamentos' });
  await screen.findByRole('heading', { name: 'Orçamentos', level: 1 });
  return user;
}

function row(name: string) {
  return within(screen.getByRole('listitem', { name }));
}

async function sortedBudgets() {
  const all = await db.budgets.toArray();
  return all
    .map(({ categoryId, amount, month }) => ({ categoryId, amount, month }))
    .sort((a, b) => a.categoryId.localeCompare(b.categoryId) || String(a.month).localeCompare(String(b.month)));
}

describe('BudgetsPage', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
    await resetDb();
    const acc = await addAccount({
      name: 'Banco',
      type: 'corrente',
      initialBalance: 1000000,
      color: '#0f766e',
      icon: '🏦',
      archived: false,
      includeInNetWorth: true,
      creditLimit: null,
      closingDay: null,
      dueDay: null,
    });
    accountId = acc.id;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('estado vazio explica o orçamento; cria um padrão e depois um valor só para o mês', async () => {
    const user = await renderPage();
    expect(await screen.findByText('Nenhum orçamento em outubro de 2026')).toBeInTheDocument();
    expect(screen.getByText(/limite de gastos que você define para cada categoria/)).toBeInTheDocument();
    // sem histórico, não há sugestões automáticas para oferecer
    expect(screen.queryByRole('button', { name: 'Ver sugestões automáticas' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Criar manualmente' }));
    let dialog = within(await screen.findByRole('dialog', { name: 'Novo orçamento' }));
    await waitFor(() => expect(dialog.getByLabelText('Categoria')).toHaveFocus());
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(dialog.getByText('Informe um valor maior que zero.')).toBeInTheDocument();

    await user.selectOptions(dialog.getByLabelText('Categoria'), CATEGORY_IDS.mercado);
    await user.type(dialog.getByLabelText('Valor mensal'), '800');
    expect(dialog.getByRole('radio', { name: 'Todos os meses (padrão)' })).toBeChecked();
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Orçamento criado.')).toBeInTheDocument();
    expect(await sortedBudgets()).toEqual([{ categoryId: CATEGORY_IDS.mercado, amount: 80000, month: null }]);
    await screen.findByRole('listitem', { name: 'Mercado' });
    expect(row('Mercado').getByText('Padrão')).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Mercado' })).toHaveTextContent('R$ 0,00 de R$ 800,00');

    // Editar: valor diferente só para outubro (o padrão continua)
    await user.click(row('Mercado').getByRole('button', { name: 'Editar orçamento de Mercado' }));
    dialog = within(await screen.findByRole('dialog', { name: 'Orçamento de Mercado' }));
    await waitFor(() => expect(dialog.getByLabelText('Valor mensal')).toHaveFocus());
    expect(dialog.getByLabelText('Valor mensal')).toHaveValue('800,00');
    await user.clear(dialog.getByLabelText('Valor mensal'));
    await user.type(dialog.getByLabelText('Valor mensal'), '600');
    await user.click(dialog.getByRole('radio', { name: 'Somente outubro de 2026' }));
    expect(dialog.getByText(/Os outros meses continuam com o padrão de/)).toHaveTextContent('R$ 800,00');
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Orçamento atualizado.')).toBeInTheDocument();
    expect(await sortedBudgets()).toEqual([
      { categoryId: CATEGORY_IDS.mercado, amount: 60000, month: '2026-10' },
      { categoryId: CATEGORY_IDS.mercado, amount: 80000, month: null },
    ]);
    await waitFor(() => expect(row('Mercado').getByText('Só este mês')).toBeInTheDocument());
    expect(screen.getByRole('listitem', { name: 'Mercado' })).toHaveTextContent('R$ 0,00 de R$ 600,00');

    // Novembro usa o padrão
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(await screen.findByText('Novembro de 2026')).toBeInTheDocument();
    await waitFor(() => expect(row('Mercado').getByText('Padrão')).toBeInTheDocument());
    expect(screen.getByRole('listitem', { name: 'Mercado' })).toHaveTextContent('R$ 0,00 de R$ 800,00');
  });

  it('mostra visão geral, status, projeção e gastos fora do orçamento', async () => {
    await setBudget(CATEGORY_IDS.mercado, 50000, null);
    await setBudget(CATEGORY_IDS.restaurantes, 20000, '2026-10');
    await expense(CATEGORY_IDS.mercado, 30000, '2026-10-05');
    await expense(CATEGORY_IDS.restaurantes, 25000, '2026-10-08');
    await expense(CATEGORY_IDS.lazer, 10000, '2026-10-09');
    await expense(CATEGORY_IDS.mercado, 99999, '2026-09-20'); // outro mês: não entra
    const user = await renderPage();

    const overview = within(await screen.findByRole('region', { name: 'Visão geral do mês' }));
    expect(overview.getByText('Gasto no mês').nextElementSibling).toHaveTextContent('R$ 550,00 de R$ 700,00');
    expect(overview.getByText('Restante').nextElementSibling).toHaveTextContent('R$ 150,00');
    expect(overview.getByText('Gastos fora do orçamento').nextElementSibling).toHaveTextContent('R$ 100,00');
    expect(overview.getByRole('progressbar', { name: 'Uso total dos orçamentos' })).toHaveAttribute(
      'aria-valuenow',
      '79',
    );
    // 17 dias restantes (15 a 31): 15000 / 17 = 882 centavos por dia
    expect(overview.getByText(/Faltam 17 dias/)).toHaveTextContent('R$ 8,82 por dia');

    // Ordenados por % usado: restaurantes (125%) antes de mercado (60%)
    const items = within(screen.getByRole('list', { name: 'Orçamentos por categoria' })).getAllByRole('listitem');
    expect(items.map((li) => li.querySelector('h3')?.textContent)).toEqual(['Restaurantes e delivery', 'Mercado']);

    const rest = row('Restaurantes e delivery');
    expect(rest.getByText('Estourado')).toBeInTheDocument();
    expect(rest.getByText('Só este mês')).toBeInTheDocument();
    expect(rest.getByText(/Excedeu/)).toHaveTextContent('Excedeu R$ 50,00');

    const mercado = row('Mercado');
    // 300 em 15 dias => 620 no mês: acima do limite de 500 => alerta
    expect(mercado.getByText('Atenção')).toBeInTheDocument();
    expect(mercado.getByText(/Restam/)).toHaveTextContent('Restam R$ 200,00');
    expect(mercado.getByText(/Projeção para o fim do mês/)).toHaveTextContent(
      'Projeção para o fim do mês: R$ 620,00 — no ritmo atual, deve passar R$ 120,00 do limite',
    );
    expect(mercado.getByRole('progressbar', { name: 'Uso do orçamento de Mercado' })).toHaveAttribute(
      'aria-valuenow',
      '60',
    );

    // Atalho para orçar uma categoria com gasto fora do orçamento
    const outside = within(screen.getByRole('region', { name: 'Gastos fora do orçamento' }));
    expect(outside.getByText('Lazer')).toBeInTheDocument();
    await user.click(outside.getByRole('button', { name: 'Definir orçamento para Lazer' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Novo orçamento' }));
    expect(dialog.getByLabelText('Categoria')).toHaveValue(CATEGORY_IDS.lazer);
    expect(dialog.getByText(/Gasto em outubro de 2026/)).toHaveTextContent('R$ 100,00');

    // Em um mês passado não há projeção
    await user.click(dialog.getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByRole('button', { name: 'Mês anterior' }));
    await screen.findByText('Setembro de 2026');
    await waitFor(() => expect(row('Mercado').getByText('Estourado')).toBeInTheDocument());
    expect(screen.queryByText(/Projeção para o fim do mês/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Faltam \d+ dias/)).not.toBeInTheDocument();
  });

  it('aplica sugestões como orçamento padrão com valores editados', async () => {
    for (const [month, value] of [
      ['07', 60000],
      ['08', 70000],
      ['09', 80000],
    ] as const) {
      await expense(CATEGORY_IDS.mercado, value, `2026-${month}-10`);
      await expense(CATEGORY_IDS.lazer, 30000, `2026-${month}-12`);
    }
    await expense(CATEGORY_IDS.restaurantes, 15050, '2026-09-15');
    await setBudget(CATEGORY_IDS.lazer, 25000, null);
    const user = await renderPage();

    await user.click(await screen.findByRole('button', { name: 'Sugerir orçamentos' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Sugerir orçamentos' }));
    const mercado = dialog.getByRole('checkbox', { name: /Mercado/ });
    await waitFor(() => expect(mercado).toHaveFocus());
    const lazer = dialog.getByRole('checkbox', { name: /Lazer/ });
    const restaurantes = dialog.getByRole('checkbox', { name: /Restaurantes e delivery/ });
    expect(mercado).toBeChecked();
    expect(restaurantes).toBeChecked();
    expect(lazer).not.toBeChecked(); // já tem orçamento
    expect(dialog.getByText(/Padrão atual/)).toHaveTextContent('Padrão atual: R$ 250,00');
    expect(dialog.getByLabelText('Valor para Mercado')).toHaveValue('700,00');
    expect(dialog.getByLabelText('Valor para Restaurantes e delivery')).toHaveValue('60,00'); // média 50,17 -> 60
    expect(dialog.getByLabelText('Valor para Lazer')).toBeDisabled();
    expect(dialog.getByRole('button', { name: 'Aplicar 2 orçamentos' })).toBeEnabled();

    await user.clear(dialog.getByLabelText('Valor para Mercado'));
    await user.type(dialog.getByLabelText('Valor para Mercado'), '750');
    await user.click(restaurantes);
    await user.click(lazer);
    expect(dialog.getByText(/Total selecionado/)).toHaveTextContent('R$ 1.050,00');
    await user.click(dialog.getByRole('button', { name: 'Aplicar 2 orçamentos' }));

    expect(await screen.findByText('2 orçamentos aplicados como padrão.')).toBeInTheDocument();
    expect(await sortedBudgets()).toEqual([
      { categoryId: CATEGORY_IDS.lazer, amount: 30000, month: null },
      { categoryId: CATEGORY_IDS.mercado, amount: 75000, month: null },
    ]);
    await screen.findByRole('listitem', { name: 'Mercado' });
    expect(screen.queryByRole('listitem', { name: 'Restaurantes e delivery' })).not.toBeInTheDocument();
  });

  it('sem histórico, a sugestão explica que faltam dados', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Sugerir orçamentos' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Sugerir orçamentos' }));
    expect(dialog.getByText('Ainda não há histórico suficiente')).toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: /Aplicar/ })).not.toBeInTheDocument();
  });

  it('copia os orçamentos específicos do mês anterior (e avisa quando não há o que copiar)', async () => {
    await setBudget(CATEGORY_IDS.mercado, 40000, '2026-09');
    await setBudget(CATEGORY_IDS.lazer, 10000, '2026-09');
    await setBudget(CATEGORY_IDS.lazer, 99999, '2026-10');
    const user = await renderPage();

    await user.click(screen.getByRole('button', { name: 'Mês anterior' }));
    await screen.findByText('Setembro de 2026');
    await user.click(screen.getByRole('button', { name: 'Copiar do mês anterior' }));
    expect(await screen.findByText(/agosto de 2026 não tem orçamentos específicos/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Próximo mês' }));
    await screen.findByText('Outubro de 2026');
    await user.click(screen.getByRole('button', { name: 'Copiar do mês anterior' }));
    const confirm = within(await screen.findByRole('dialog', { name: 'Copiar orçamentos de setembro de 2026?' }));
    expect(confirm.getByText(/2 orçamentos específicos serão copiados para outubro de 2026/)).toBeInTheDocument();
    await user.click(confirm.getByRole('button', { name: 'Copiar' }));

    expect(await screen.findByText('2 orçamentos copiados.')).toBeInTheDocument();
    const october = (await sortedBudgets()).filter((b) => b.month === '2026-10');
    expect(october).toEqual([
      { categoryId: CATEGORY_IDS.lazer, amount: 10000, month: '2026-10' },
      { categoryId: CATEGORY_IDS.mercado, amount: 40000, month: '2026-10' },
    ]);
  });

  it('transformar um valor do mês em padrão substitui o específico; remover pede confirmação', async () => {
    await setBudget(CATEGORY_IDS.mercado, 50000, null);
    await setBudget(CATEGORY_IDS.mercado, 30000, '2026-10');
    await setBudget(CATEGORY_IDS.transporte, 20000, '2026-10');
    const user = await renderPage();

    await screen.findByRole('listitem', { name: 'Mercado' });
    expect(row('Mercado').getByText('Só este mês')).toBeInTheDocument();
    await user.click(row('Mercado').getByRole('button', { name: 'Editar orçamento de Mercado' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Orçamento de Mercado' }));
    await waitFor(() => expect(dialog.getByLabelText('Valor mensal')).toHaveFocus());
    expect(dialog.getByRole('radio', { name: 'Somente outubro de 2026' })).toBeChecked();
    await user.click(dialog.getByRole('radio', { name: 'Todos os meses (padrão)' }));
    expect(dialog.getByText(/substitui o valor específico de outubro de 2026/)).toBeInTheDocument();
    await user.clear(dialog.getByLabelText('Valor mensal'));
    await user.type(dialog.getByLabelText('Valor mensal'), '450');
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));

    await waitFor(async () =>
      expect(await sortedBudgets()).toEqual([
        { categoryId: CATEGORY_IDS.mercado, amount: 45000, month: null },
        { categoryId: CATEGORY_IDS.transporte, amount: 20000, month: '2026-10' },
      ]),
    );
    await waitFor(() => expect(row('Mercado').getByText('Padrão')).toBeInTheDocument());

    // Remover o específico de transporte (sem padrão): some da lista
    await user.click(row('Transporte').getByRole('button', { name: 'Remover orçamento de Transporte' }));
    let confirm = within(await screen.findByRole('dialog', { name: 'Remover o orçamento de Transporte?' }));
    expect(confirm.getByText(/Remove o orçamento de outubro de 2026/)).toBeInTheDocument();
    await user.click(confirm.getByRole('button', { name: 'Cancelar' }));
    expect(await db.budgets.count()).toBe(2);

    await user.click(row('Transporte').getByRole('button', { name: 'Remover orçamento de Transporte' }));
    confirm = within(await screen.findByRole('dialog', { name: 'Remover o orçamento de Transporte?' }));
    await user.click(confirm.getByRole('button', { name: 'Remover' }));
    expect(await screen.findByText('Orçamento removido.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('listitem', { name: 'Transporte' })).not.toBeInTheDocument());

    // Remover o padrão avisa que vale para todos os meses
    await user.click(row('Mercado').getByRole('button', { name: 'Remover orçamento de Mercado' }));
    confirm = within(await screen.findByRole('dialog', { name: 'Remover o orçamento de Mercado?' }));
    expect(confirm.getByText(/Este é o orçamento padrão/)).toBeInTheDocument();
    await user.click(confirm.getByRole('button', { name: 'Remover' }));
    expect(await screen.findByText('Nenhum orçamento em outubro de 2026')).toBeInTheDocument();
    expect(await db.budgets.count()).toBe(0);
  });

  it('regra 50/30/20 usa a renda estimada e compara com a soma dos orçamentos', async () => {
    const user = await renderPage();
    const rule = () => within(screen.getByRole('region', { name: 'Regra 50/30/20' }));
    expect(rule().getByText(/registre suas receitas ou informe sua renda mensal/)).toBeInTheDocument();

    await updateSettings({ monthlyIncomeEstimate: 1000000 });
    await setBudget(CATEGORY_IDS.moradia, 300000, null);
    await setBudget(CATEGORY_IDS.mercado, 250000, null);
    await setBudget(CATEGORY_IDS.investimentos, 250000, null);

    // 10.000 - (3.000 + 2.500 + 2.500): espera os três orçamentos chegarem à tela
    await waitFor(() => expect(rule().getByText(/Ainda sem destino definido/)).toHaveTextContent('R$ 2.000,00'));
    expect(rule().getByText(/Renda de referência/)).toHaveTextContent('R$ 10.000,00');
    expect(rule().getByText('(renda mensal estimada nas configurações)')).toBeInTheDocument();

    const needs = within(rule().getByRole('listitem', { name: 'Necessidades (50%)' }));
    expect(needs.getByText('Acima do ideal')).toBeInTheDocument();
    expect(needs.getByText(/^Orçado/)).toHaveTextContent('Orçado R$ 5.500,00');
    expect(needs.getByText(/^Ideal/)).toHaveTextContent('Ideal R$ 5.000,00');
    expect(needs.getByText(/acima do sugerido/)).toHaveTextContent('R$ 500,00 acima do sugerido');

    const wants = within(rule().getByRole('listitem', { name: 'Desejos (30%)' }));
    expect(wants.getByText('Sem orçamento')).toBeInTheDocument();

    const goals = within(rule().getByRole('listitem', { name: 'Objetivos financeiros (20%)' }));
    expect(goals.getByText('Dentro do ideal')).toBeInTheDocument();

    await user.click(rule().getByText('Como funciona a regra?'));
    expect(rule().getByText(/pelo menos 20%/)).toBeVisible();
  });
});
