import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { addAccount, addTransaction, type NewTransactionInput } from '@/db/repo';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { Account } from '@/domain/types';
import { renderWithProviders, resetDb } from '@/test/render';
import TransactionsPage from './TransactionsPage';

function seedAccount(name: string, p: Partial<Account> = {}) {
  return addAccount({
    name,
    type: 'corrente',
    initialBalance: 0,
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

function tx(accountId: string, p: Partial<NewTransactionInput>) {
  return addTransaction({
    type: 'despesa',
    amount: 1000,
    date: '2026-10-15',
    description: 'Lançamento',
    categoryId: CATEGORY_IDS.mercado,
    accountId,
    ...p,
  });
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

async function renderPage(route = '/lancamentos') {
  const user = userEvent.setup();
  renderWithProviders(
    <>
      <TransactionsPage />
      <LocationProbe />
    </>,
    { route },
  );
  await screen.findByRole('heading', { name: 'Lançamentos' });
  return user;
}

/** Linha (li) da lista que contém o texto. */
function row(text: string) {
  const li = screen.getByText(text).closest('li');
  if (!li) throw new Error(`Linha não encontrada: ${text}`);
  return within(li);
}

/** Espera o formulário (que carrega os próprios dados) ficar pronto dentro do diálogo. */
async function formDialog(name: string) {
  await screen.findByLabelText(/^Valor/);
  return within(screen.getByRole('dialog', { name }));
}

function listDescriptions() {
  return screen
    .queryAllByRole('listitem')
    .map((li) => li.querySelector('.truncate')?.textContent ?? '')
    .filter(Boolean);
}

describe('TransactionsPage', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
    await resetDb();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sem lançamentos mostra estado vazio com chamada para o primeiro lançamento', async () => {
    await seedAccount('Banco');
    const user = await renderPage();
    expect(await screen.findByText('Nenhum lançamento ainda')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar primeiro lançamento' }));
    const dialog = await formDialog('Novo lançamento');
    expect(dialog.getByRole('tab', { name: 'Despesa' })).toHaveAttribute('aria-selected', 'true');
  });

  it('?novo=receita abre o formulário de receita e remove o parâmetro da URL', async () => {
    await seedAccount('Banco');
    await renderPage('/lancamentos?novo=receita');
    const dialog = await formDialog('Novo lançamento');
    expect(dialog.getByRole('tab', { name: 'Receita' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/lancamentos$/));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('?novo com valor desconhecido é ignorado', async () => {
    await seedAccount('Banco');
    await renderPage('/lancamentos?novo=foo');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/lancamentos$/));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('mostra resumo do mês e lista agrupada por dia com subtotal e selos', async () => {
    const banco = await seedAccount('Banco');
    const poupanca = await seedAccount('Poupança', { type: 'poupanca' });
    await tx(banco.id, {
      type: 'receita',
      amount: 500000,
      description: 'Salário',
      categoryId: CATEGORY_IDS.salario,
      date: '2026-10-05',
    });
    await tx(banco.id, { amount: 4590, description: 'Mercado do mês', date: '2026-10-15' });
    await tx(banco.id, {
      amount: 2000,
      description: 'Conta de luz',
      categoryId: CATEGORY_IDS.contas,
      date: '2026-10-14',
      status: 'pendente',
    });
    await tx(banco.id, {
      type: 'transferencia',
      amount: 10000,
      description: 'Guardar',
      categoryId: null,
      toAccountId: poupanca.id,
      date: '2026-10-15',
    });
    await tx(banco.id, {
      amount: 30000,
      description: 'Celular',
      categoryId: CATEGORY_IDS.compras,
      date: '2026-09-20',
      installments: 3,
    });
    await tx(banco.id, { amount: 999, description: 'Mês passado', date: '2026-09-30' });
    await renderPage();

    const summary = await screen.findByRole('region', { name: 'Resumo do mês' });
    expect(within(summary).getByText('R$ 5.000,00')).toBeInTheDocument();
    // Despesas: 45,90 + 20,00 + parcela 2/3 de 100,00 (pendente, outubro)
    expect(within(summary).getByText('R$ 165,90')).toBeInTheDocument();
    expect(within(summary).getByText('+R$ 4.834,10')).toBeInTheDocument();
    expect(within(summary).getByText('2 lançamentos a confirmar')).toBeInTheDocument();

    const today = screen.getByRole('region', { name: 'Hoje · quinta-feira' });
    expect(within(today).getByText('Mercado do mês')).toBeInTheDocument();
    expect(within(today).getByText('Guardar')).toBeInTheDocument();
    expect(within(today).getByText('Banco → Poupança')).toBeInTheDocument();
    // transferência não entra no subtotal do dia
    expect(
      within(today).getByText('-R$ 45,90', { selector: '[aria-label="Saldo do dia"] *' }),
    ).toBeInTheDocument();

    const yesterday = screen.getByRole('region', { name: 'Ontem · quarta-feira' });
    expect(within(yesterday).getByText('Pendente · atrasado')).toBeInTheDocument();
    expect(within(yesterday).getByText('Contas da casa • Banco')).toBeInTheDocument();

    expect(
      row('Celular (2/3)').getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Parcela 2/3'),
    ).toBeInTheDocument();
    expect(row('Celular (2/3)').getByText('Pendente')).toBeInTheDocument();
    expect(screen.queryByText('Mês passado')).not.toBeInTheDocument();
    expect(screen.getByText('5 lançamentos')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(await screen.findByText('Mês passado')).toBeInTheDocument();
    expect(screen.queryByText('Mercado do mês')).not.toBeInTheDocument();
  });

  it('filtra por tipo, conta, categoria, situação e busca normalizada', async () => {
    const banco = await seedAccount('Banco');
    const cartao = await seedAccount('Cartão Roxo', { type: 'cartao_credito' });
    await tx(banco.id, {
      amount: 1500,
      description: 'Café da manhã',
      categoryId: CATEGORY_IDS.restaurantes,
      date: '2026-10-10',
    });
    await tx(cartao.id, {
      amount: 8000,
      description: 'Feira',
      categoryId: CATEGORY_IDS.mercado,
      date: '2026-10-11',
      tags: ['Família'],
    });
    await tx(banco.id, {
      type: 'receita',
      amount: 90000,
      description: 'Freela',
      categoryId: CATEGORY_IDS.rendaExtra,
      date: '2026-10-12',
      status: 'pendente',
    });
    const user = await renderPage();
    await screen.findByText('Café da manhã');
    expect(listDescriptions()).toEqual(['Freela', 'Feira', 'Café da manhã']);

    const search = screen.getByRole('searchbox', { name: 'Buscar lançamentos' });
    await user.type(search, 'CAFE manha');
    expect(listDescriptions()).toEqual(['Café da manhã']);
    expect(screen.getByText(/^1 lançamento ·/)).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, 'familia');
    expect(listDescriptions()).toEqual(['Feira']);
    await user.click(screen.getByRole('button', { name: /Limpar filtros/ }));
    expect(listDescriptions()).toHaveLength(3);

    await user.selectOptions(screen.getByLabelText('Filtrar por tipo'), 'receita');
    expect(listDescriptions()).toEqual(['Freela']);
    await user.selectOptions(screen.getByLabelText('Filtrar por tipo'), 'todos');

    await user.selectOptions(screen.getByLabelText('Filtrar por conta'), cartao.id);
    expect(listDescriptions()).toEqual(['Feira']);
    await user.selectOptions(screen.getByLabelText('Filtrar por conta'), 'todas');

    await user.selectOptions(screen.getByLabelText('Filtrar por categoria'), CATEGORY_IDS.restaurantes);
    expect(listDescriptions()).toEqual(['Café da manhã']);
    await user.selectOptions(screen.getByLabelText('Filtrar por categoria'), 'todas');

    await user.selectOptions(screen.getByLabelText('Filtrar por situação'), 'pendente');
    expect(listDescriptions()).toEqual(['Freela']);
    await user.type(search, 'xyz');
    expect(screen.getByText('Nenhum lançamento encontrado')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(listDescriptions()).toHaveLength(3);
  });

  it('clique no item abre a edição; o menu marca como pago e duplica', async () => {
    const banco = await seedAccount('Banco');
    const [luz] = await tx(banco.id, {
      amount: 2000,
      description: 'Conta de luz',
      categoryId: CATEGORY_IDS.contas,
      status: 'pendente',
    });
    const user = await renderPage();

    await user.click(await screen.findByText('Conta de luz'));
    const dialog = await formDialog('Editar lançamento');
    expect(dialog.getByLabelText('Descrição')).toHaveValue('Conta de luz');
    await user.click(dialog.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(row('Conta de luz').getByRole('button', { name: 'Ações de Conta de luz' }));
    await user.click(screen.getByRole('menuitem', { name: 'Marcar como pago' }));
    await waitFor(async () => expect((await db.transactions.get(luz.id))?.status).toBe('pago'));
    expect(await screen.findByText('Marcado como pago.')).toBeInTheDocument();

    await user.click(row('Conta de luz').getByRole('button', { name: 'Ações de Conta de luz' }));
    await user.click(screen.getByRole('menuitem', { name: 'Duplicar' }));
    const copy = await formDialog('Novo lançamento');
    expect(copy.getByLabelText('Valor')).toHaveValue('20,00');
    expect(copy.getByLabelText('Categoria')).toHaveValue(CATEGORY_IDS.contas);
    expect(copy.getByLabelText('Data')).toHaveValue('2026-10-15');
    await user.click(copy.getByRole('button', { name: 'Salvar' }));
    await waitFor(async () => expect(await db.transactions.count()).toBe(2));
  });

  it('exclui lançamento simples após confirmação', async () => {
    const banco = await seedAccount('Banco');
    await tx(banco.id, { description: 'Padaria' });
    const user = await renderPage();
    await user.click(row('Padaria').getByRole('button', { name: 'Ações de Padaria' }));
    await user.click(screen.getByRole('menuitem', { name: 'Excluir' }));
    const confirm = await screen.findByRole('dialog', { name: 'Excluir lançamento?' });
    await user.click(within(confirm).getByRole('button', { name: 'Excluir' }));
    await waitFor(async () => expect(await db.transactions.count()).toBe(0));
    expect(await screen.findByText('Lançamento excluído.')).toBeInTheDocument();
  });

  it('excluir parcela pergunta o alcance: esta e as próximas', async () => {
    const banco = await seedAccount('Banco');
    await tx(banco.id, {
      amount: 40000,
      description: 'Sofá',
      categoryId: CATEGORY_IDS.compras,
      date: '2026-08-15',
      installments: 4,
    });
    const user = await renderPage();
    await user.click(await screen.findByText('Sofá (3/4)'));
    const edit = await formDialog('Editar parcela');
    await user.click(edit.getByRole('button', { name: 'Cancelar' }));

    await user.click(row('Sofá (3/4)').getByRole('button', { name: 'Ações de Sofá (3/4)' }));
    await user.click(screen.getByRole('menuitem', { name: 'Excluir' }));
    const modal = await screen.findByRole('dialog', { name: 'Excluir parcela' });
    expect(within(modal).getByText('Parcela 3 de 4. O que você quer excluir?')).toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: 'Só esta parcela' })).toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: 'Todas as 4 parcelas' })).toBeInTheDocument();
    await user.click(within(modal).getByRole('button', { name: 'Esta e as próximas (2)' }));

    await waitFor(async () => expect(await db.transactions.count()).toBe(2));
    const left = (await db.transactions.toArray()).map((t) => t.installment!.number).sort();
    expect(left).toEqual([1, 2]);
    expect(await screen.findByText('2 parcelas excluídas.')).toBeInTheDocument();
  });

  it('cria lançamento pelo botão do cabeçalho e ele aparece na lista', async () => {
    await seedAccount('Banco');
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Nova despesa' }));
    const dialog = await formDialog('Novo lançamento');
    await user.type(dialog.getByLabelText('Valor'), '12,50');
    await user.type(dialog.getByLabelText('Descrição'), 'Uber');
    expect(dialog.getByLabelText('Categoria')).toHaveValue(CATEGORY_IDS.transporte);
    fireEvent.change(dialog.getByLabelText('Data'), { target: { value: '2026-10-13' } });
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Uber')).toBeInTheDocument();
    expect(row('Uber').getByText('Transporte • Banco')).toBeInTheDocument();
    expect(row('Uber').getByText('-R$ 12,50')).toBeInTheDocument();
  });
});
