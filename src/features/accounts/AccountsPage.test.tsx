import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { addAccount, addRecurring, addTransaction } from '@/db/repo';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { Account } from '@/domain/types';
import { renderWithProviders, resetDb } from '@/test/render';
import AccountsPage from './AccountsPage';

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

async function renderPage() {
  const user = userEvent.setup();
  renderWithProviders(<AccountsPage />, { route: '/contas' });
  await screen.findByRole('heading', { name: 'Contas', level: 1 });
  return user;
}

function accountCard(name: string) {
  return within(screen.getByRole('region', { name }));
}

describe('AccountsPage', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
    await resetDb();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sem contas mostra estado vazio e cria a primeira conta', async () => {
    const user = await renderPage();
    expect(await screen.findByText('Nenhuma conta cadastrada')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cadastrar primeira conta' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Nova conta' }));
    await waitFor(() => expect(dialog.getByLabelText('Nome')).toHaveFocus());
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(dialog.getByText('Informe o nome da conta.')).toBeInTheDocument();

    await user.type(dialog.getByLabelText('Nome'), 'Nubank');
    await user.selectOptions(dialog.getByLabelText('Tipo'), 'poupanca');
    expect(dialog.getByLabelText('Emoji')).toHaveValue('🐷');
    await user.type(dialog.getByLabelText('Saldo inicial'), '-150,25');
    await user.click(dialog.getByRole('radio', { name: 'Violeta' }));
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Conta criada.')).toBeInTheDocument();
    const [acc] = await db.accounts.toArray();
    expect(acc).toMatchObject({
      name: 'Nubank',
      type: 'poupanca',
      initialBalance: -15025,
      icon: '🐷',
      color: '#7c3aed',
      includeInNetWorth: true,
      archived: false,
      creditLimit: null,
      closingDay: null,
      dueDay: null,
    });
    expect(await screen.findByRole('region', { name: 'Nubank' })).toBeInTheDocument();
  });

  it('mostra totais, saldo atual/previsto e o cartão com fatura, limite e datas', async () => {
    const banco = await seedAccount('Banco', { initialBalance: 200000 });
    const cartao = await seedAccount('Cartão Roxo', {
      type: 'cartao_credito',
      icon: '💳',
      initialBalance: -30000,
      creditLimit: 100000,
      closingDay: 5,
      dueDay: 20,
    });
    await addTransaction({
      type: 'despesa',
      amount: 20000,
      date: '2026-10-10',
      description: 'Mercado',
      categoryId: CATEGORY_IDS.mercado,
      accountId: cartao.id,
    });
    await addTransaction({
      type: 'despesa',
      amount: 15000,
      date: '2026-10-25',
      description: 'Luz',
      categoryId: CATEGORY_IDS.contas,
      accountId: banco.id,
      status: 'pendente',
    });
    await renderPage();

    const totals = await screen.findByRole('region', { name: 'Totais' });
    expect(within(totals).getByText('R$ 1.500,00')).toBeInTheDocument(); // 2000 - 500
    expect(within(totals).getByText('R$ 1.350,00')).toBeInTheDocument(); // previsto com a conta de luz
    expect(within(totals).getByText('R$ 500,00')).toBeInTheDocument(); // faturas

    const bank = accountCard('Banco');
    expect(bank.getByText('R$ 2.000,00')).toBeInTheDocument();
    expect(bank.getByText('R$ 1.850,00')).toBeInTheDocument();

    const card = accountCard('Cartão Roxo');
    expect(card.getByText('Fatura atual')).toBeInTheDocument();
    expect(card.getByRole('progressbar', { name: 'Limite usado de Cartão Roxo' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    );
    expect(card.getByText(/Disponível/)).toHaveTextContent('Disponível R$ 500,00');
    expect(card.getByText(/Fecha dia 5/)).toHaveTextContent('Fecha dia 5 (05 nov) · Vence dia 20 (20 out)');
  });

  it('limite do cartão desconta as parcelas futuras (como o Pat); a fatura atual mostra só as pagas', async () => {
    const cartao = await seedAccount('Nubank', { type: 'cartao_credito', icon: '💳', creditLimit: 1000000 });
    await addTransaction({
      type: 'despesa',
      amount: 500000,
      date: '2026-10-15',
      description: 'Notebook',
      categoryId: CATEGORY_IDS.compras,
      accountId: cartao.id,
      installments: 10,
    });
    await renderPage();

    const card = accountCard('Nubank');
    expect(await card.findByText(/^Usado/)).toHaveTextContent('Usado R$ 5.000,00 de R$ 10.000,00');
    expect(card.getByText(/Disponível/)).toHaveTextContent('Disponível R$ 5.000,00');
    expect(card.getByRole('progressbar', { name: 'Limite usado de Nubank' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    );
    expect(card.getByText(/O limite usado inclui/)).toHaveTextContent(
      'O limite usado inclui R$ 4.500,00 em parcelas e lançamentos futuros.',
    );
    expect(card.getByText('Fatura atual').nextElementSibling).toHaveTextContent('R$ 500,00');
  });

  it('“Pagar fatura” abre transferência para o cartão com o valor da fatura', async () => {
    const banco = await seedAccount('Banco', { initialBalance: 200000 });
    const cartao = await seedAccount('Cartão', { type: 'cartao_credito', initialBalance: -45678 });
    const user = await renderPage();
    await user.click(accountCard('Cartão').getByRole('button', { name: 'Pagar fatura de Cartão' }));

    await screen.findByLabelText('Valor');
    const dialog = within(screen.getByRole('dialog', { name: 'Novo lançamento' }));
    expect(dialog.getByRole('radio', { name: 'Transferência' })).toBeChecked();
    expect(dialog.getByLabelText('Valor')).toHaveValue('456,78');
    expect(dialog.getByLabelText('De (origem)')).toHaveValue(banco.id);
    expect(dialog.getByLabelText('Para (destino)')).toHaveValue(cartao.id);
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));

    await waitFor(async () => expect(await db.transactions.count()).toBe(1));
    const [tx] = await db.transactions.toArray();
    expect(tx).toMatchObject({
      type: 'transferencia',
      amount: 45678,
      accountId: banco.id,
      toAccountId: cartao.id,
      description: 'Pagamento da fatura Cartão',
      status: 'pago',
    });
    await waitFor(() =>
      expect(accountCard('Cartão').getByRole('button', { name: 'Pagar fatura de Cartão' })).toBeDisabled(),
    );
  });

  it('“Ajustar saldo” cria lançamento de ajuste com a diferença', async () => {
    const banco = await seedAccount('Banco', { initialBalance: 100000 });
    await addTransaction({
      type: 'despesa',
      amount: 20000,
      date: '2026-10-01',
      description: 'Aluguel',
      categoryId: CATEGORY_IDS.moradia,
      accountId: banco.id,
    });
    const user = await renderPage();
    await user.click(accountCard('Banco').getByRole('button', { name: 'Ajustar saldo de Banco' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Ajustar saldo' }));
    expect(dialog.getByText(/Saldo no app hoje/)).toHaveTextContent('R$ 800,00');

    await user.type(dialog.getByLabelText('Saldo real hoje'), '750');
    expect(dialog.getByText(/Será criada uma despesa de ajuste/)).toHaveTextContent('R$ 50,00');
    await user.click(dialog.getByRole('button', { name: 'Ajustar' }));

    await waitFor(async () => expect(await db.transactions.count()).toBe(2));
    const adj = (await db.transactions.toArray()).find((t) => t.description === 'Ajuste de saldo');
    expect(adj).toMatchObject({
      type: 'despesa',
      amount: 5000,
      categoryId: CATEGORY_IDS.outrosDespesa,
      accountId: banco.id,
      date: '2026-10-15',
      status: 'pago',
    });
    expect(await accountCard('Banco').findByText('R$ 750,00')).toBeInTheDocument();
  });

  it('ajuste para cima vira receita em “Outras receitas”; saldo igual não cria nada', async () => {
    const banco = await seedAccount('Banco', { initialBalance: 1000 });
    const user = await renderPage();
    await user.click(accountCard('Banco').getByRole('button', { name: 'Ajustar saldo de Banco' }));
    let dialog = within(await screen.findByRole('dialog', { name: 'Ajustar saldo' }));
    await user.type(dialog.getByLabelText('Saldo real hoje'), '10');
    expect(dialog.getByText('O saldo já confere. Nenhum ajuste é necessário.')).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Ajustar' }));
    expect(await screen.findByText('O saldo já confere — nada a ajustar.')).toBeInTheDocument();
    expect(await db.transactions.count()).toBe(0);

    await user.click(accountCard('Banco').getByRole('button', { name: 'Ajustar saldo de Banco' }));
    dialog = within(await screen.findByRole('dialog', { name: 'Ajustar saldo' }));
    await user.type(dialog.getByLabelText('Saldo real hoje'), '25,50');
    await user.click(dialog.getByRole('button', { name: 'Ajustar' }));
    await waitFor(async () => expect(await db.transactions.count()).toBe(1));
    const [adj] = await db.transactions.toArray();
    expect(adj).toMatchObject({
      type: 'receita',
      amount: 1550,
      categoryId: CATEGORY_IDS.outrosReceita,
      accountId: banco.id,
    });
  });

  it('“Ajustar saldo” do cartão pede a fatura positiva, como aparece na tela (sem dobrar o valor)', async () => {
    const cartao = await seedAccount('Cartão', {
      type: 'cartao_credito',
      icon: '💳',
      initialBalance: -138384,
    });
    const user = await renderPage();
    await user.click(accountCard('Cartão').getByRole('button', { name: 'Ajustar saldo de Cartão' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Ajustar saldo' }));
    expect(dialog.getByText(/Fatura em aberto no app hoje/)).toHaveTextContent('R$ 1.383,84');

    const input = dialog.getByLabelText('Fatura em aberto hoje');
    await user.type(input, '1.383,84');
    expect(dialog.getByText('O saldo já confere. Nenhum ajuste é necessário.')).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, '1.400');
    expect(dialog.getByText(/Será criada uma despesa de ajuste/)).toHaveTextContent('R$ 16,16');
    await user.click(dialog.getByRole('button', { name: 'Ajustar' }));
    await waitFor(async () => expect(await db.transactions.count()).toBe(1));
    const [adj] = await db.transactions.toArray();
    expect(adj).toMatchObject({ type: 'despesa', amount: 1616, accountId: cartao.id });
  });

  it('“Ajustar saldo” do cartão com crédito a favor vira saldo positivo', async () => {
    await seedAccount('Cartão', { type: 'cartao_credito', icon: '💳', initialBalance: -10000 });
    const user = await renderPage();
    await user.click(accountCard('Cartão').getByRole('button', { name: 'Ajustar saldo de Cartão' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Ajustar saldo' }));
    await user.click(dialog.getByRole('switch', { name: /Tenho crédito no cartão/ }));
    await user.type(dialog.getByLabelText('Crédito a favor hoje'), '50');
    expect(dialog.getByText(/Será criada uma receita de ajuste/)).toHaveTextContent('R$ 150,00');
  });

  it('excluir conta sem uso apaga; com lançamentos arquiva e explica; arquivadas podem ser reativadas', async () => {
    await seedAccount('Vazia');
    const usada = await seedAccount('Usada', { initialBalance: 5000 });
    const comRegra = await seedAccount('Com regra');
    await addTransaction({
      type: 'despesa',
      amount: 1000,
      date: '2026-10-01',
      description: 'Café',
      categoryId: CATEGORY_IDS.restaurantes,
      accountId: usada.id,
    });
    await addRecurring({
      type: 'despesa',
      amount: 3990,
      description: 'Streaming',
      categoryId: CATEGORY_IDS.assinaturas,
      accountId: comRegra.id,
      frequency: 'mensal',
      startDate: '2026-11-01',
      endDate: null,
      autoGenerate: true,
      active: true,
    });
    const user = await renderPage();

    async function deleteAccount(name: string, confirmLabel = 'Excluir') {
      await user.click(accountCard(name).getByRole('button', { name: `Ações da conta ${name}` }));
      await user.click(screen.getByRole('menuitem', { name: 'Excluir ou arquivar' }));
      const confirm = await screen.findByRole('dialog', { name: `Excluir a conta “${name}”?` });
      await user.click(within(confirm).getByRole('button', { name: confirmLabel }));
    }

    await deleteAccount('Vazia');
    expect(await screen.findByText('Conta excluída.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Vazia' })).not.toBeInTheDocument());
    expect(await db.accounts.count()).toBe(2);

    // “Usada” ainda tem saldo (R$ 40,00): o aviso explica que ele sai dos totais.
    await deleteAccount('Usada', 'Arquivar mesmo assim');
    expect(await screen.findByText(/por isso foi arquivada/)).toBeInTheDocument();
    await waitFor(async () => expect((await db.accounts.get(usada.id))?.archived).toBe(true));
    await deleteAccount('Com regra');
    await waitFor(async () => expect((await db.accounts.get(comRegra.id))?.archived).toBe(true));

    expect(screen.queryByRole('region', { name: 'Usada' })).not.toBeInTheDocument();
    expect(await screen.findByText('Todas as contas estão arquivadas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mostrar arquivadas (2)' }));
    const archived = within(screen.getByRole('region', { name: 'Contas arquivadas' }));
    expect(archived.getByText('Usada')).toBeInTheDocument();
    await user.click(accountCard('Usada').getByRole('button', { name: 'Reativar' }));
    await waitFor(async () => expect((await db.accounts.get(usada.id))?.archived).toBe(false));
    expect(await screen.findByText('Conta reativada.')).toBeInTheDocument();
  });

  it('arquivar cartão com fatura e parcelas futuras avisa antes e mostra o saldo que ficou fora dos totais', async () => {
    await seedAccount('Banco', { initialBalance: 200000 });
    const cartao = await seedAccount('Cartão', { type: 'cartao_credito', icon: '💳', creditLimit: 500000 });
    await addTransaction({
      type: 'despesa',
      amount: 150000,
      date: '2026-10-10',
      description: 'Fone',
      categoryId: CATEGORY_IDS.compras,
      accountId: cartao.id,
      installments: 3,
    });
    const user = await renderPage();
    const totals = await screen.findByRole('region', { name: 'Totais' });
    expect(within(totals).getByText('R$ 500,00')).toBeInTheDocument(); // fatura atual (1ª parcela)

    async function openRemoval() {
      await user.click(accountCard('Cartão').getByRole('button', { name: 'Ações da conta Cartão' }));
      await user.click(screen.getByRole('menuitem', { name: 'Excluir ou arquivar' }));
      return within(await screen.findByRole('dialog', { name: 'Excluir a conta “Cartão”?' }));
    }

    let dialog = await openRemoval();
    expect(dialog.getByText(/Esta conta tem fatura em aberto/)).toHaveTextContent(
      'Esta conta tem fatura em aberto de R$ 500,00 e 2 lançamentos futuros ou pendentes (como parcelas).',
    );
    expect(dialog.getByText(/será arquivada/)).toHaveTextContent(/continua no patrimônio líquido/);
    // Oferece pagar a fatura antes de arquivar.
    await user.click(dialog.getByRole('button', { name: 'Pagar a fatura antes' }));
    // o formulário mostra um spinner enquanto carrega os dados (o diálogo é recriado em seguida)
    await screen.findByLabelText('Valor');
    const transfer = within(screen.getByRole('dialog', { name: 'Novo lançamento' }));
    expect(transfer.getByLabelText('Valor')).toHaveValue('500,00');
    await user.click(transfer.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    dialog = await openRemoval();
    await user.click(dialog.getByRole('button', { name: 'Arquivar mesmo assim' }));
    await waitFor(async () => expect((await db.accounts.get(cartao.id))?.archived).toBe(true));
    expect(await screen.findByText(/Conta arquivada com saldo/)).toHaveTextContent(
      'Conta arquivada com saldo: -R$ 500,00 (fora dos totais acima, mas ainda conta no patrimônio líquido).',
    );
    expect(within(totals).getByText('Nenhuma fatura em aberto')).toBeInTheDocument();
  });

  it('conta zerada e sem lançamentos futuros usa a confirmação simples', async () => {
    await seedAccount('Zerada');
    const user = await renderPage();
    await user.click(accountCard('Zerada').getByRole('button', { name: 'Ações da conta Zerada' }));
    await user.click(screen.getByRole('menuitem', { name: 'Excluir ou arquivar' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Excluir a conta “Zerada”?' }));
    expect(dialog.getByText(/para preservar o seu histórico/)).toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: 'Arquivar mesmo assim' })).not.toBeInTheDocument();
  });

  it('edita conta de cartão validando os dias', async () => {
    const cartao = await seedAccount('Cartão', { type: 'cartao_credito', icon: '💳' });
    const user = await renderPage();
    await user.click(accountCard('Cartão').getByRole('button', { name: 'Ações da conta Cartão' }));
    await user.click(screen.getByRole('menuitem', { name: 'Editar' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Editar conta' }));
    // espera o foco inicial do modal (primeiro campo) antes de digitar em outros campos
    await waitFor(() => expect(dialog.getByLabelText('Nome')).toHaveFocus());
    expect(dialog.getByText(/Alterar o saldo inicial muda todo o histórico/)).toBeInTheDocument();
    await user.type(dialog.getByLabelText('Limite'), '3.000');
    await user.type(dialog.getByLabelText('Dia de fechamento'), '35');
    await user.type(dialog.getByLabelText('Dia de vencimento'), '10');
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(dialog.getByText('Informe um dia entre 1 e 31.')).toBeInTheDocument();
    await user.clear(dialog.getByLabelText('Dia de fechamento'));
    await user.type(dialog.getByLabelText('Dia de fechamento'), '3');
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));
    await waitFor(async () =>
      expect(await db.accounts.get(cartao.id)).toMatchObject({
        creditLimit: 300000,
        closingDay: 3,
        dueDay: 10,
      }),
    );
    expect(await screen.findByText('Conta atualizada.')).toBeInTheDocument();
  });
});
