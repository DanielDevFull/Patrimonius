import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { addAccount, addAsset, addDebt, addTransaction } from '@/db/repo';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { Account, Asset } from '@/domain/types';
import { renderWithProviders, resetDb } from '@/test/render';
import NetWorthPage from './NetWorthPage';

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

function seedAsset(name: string, p: Partial<Asset> = {}, valuationDate = '2026-09-01') {
  return addAsset(
    {
      name,
      type: 'veiculo',
      value: 5000000,
      acquisitionValue: null,
      acquisitionDate: null,
      notes: '',
      archived: false,
      ...p,
    },
    valuationDate,
  );
}

async function renderPage() {
  const user = userEvent.setup();
  renderWithProviders(<NetWorthPage />, { route: '/patrimonio' });
  await screen.findByRole('heading', { name: 'Patrimônio', level: 1 });
  return user;
}

const hero = () => within(screen.getByRole('region', { name: 'Patrimônio líquido' }));

describe('NetWorthPage', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
    await resetDb();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('cadastra um bem com valor de aquisição e mostra a valorização', async () => {
    const user = await renderPage();
    expect(await screen.findByText('Nenhum bem cadastrado')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cadastrar bem' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Novo bem' }));

    await user.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(dialog.getByText('Informe o nome do bem.')).toBeInTheDocument();
    expect(dialog.getByText('Informe o valor atual estimado.')).toBeInTheDocument();

    await user.type(dialog.getByLabelText('Nome'), 'Apartamento');
    await user.selectOptions(dialog.getByLabelText('Tipo'), 'imovel');
    await user.type(dialog.getByLabelText('Valor atual estimado'), '500.000');
    await user.type(dialog.getByLabelText('Valor de aquisição (opcional)'), '400.000');
    await user.type(dialog.getByLabelText('Data de aquisição (opcional)'), '2020-05-10');
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Bem cadastrado.')).toBeInTheDocument();
    const [asset] = await db.assets.toArray();
    expect(asset).toMatchObject({
      name: 'Apartamento',
      type: 'imovel',
      value: 50000000,
      acquisitionValue: 40000000,
      acquisitionDate: '2020-05-10',
      archived: false,
    });
    const valuations = await db.assetValuations.toArray();
    expect(valuations).toHaveLength(1);
    expect(valuations[0]).toMatchObject({ assetId: asset.id, value: 50000000, date: '2026-10-15' });

    const card = within(await screen.findByRole('region', { name: 'Apartamento' }));
    expect(card.getByText(/\+25% desde a aquisição/)).toBeInTheDocument();
    expect(card.getByText('Avaliado em 15/10/2026')).toBeInTheDocument();
    await waitFor(() => expect(hero().getAllByText('R$ 500.000,00').length).toBeGreaterThan(0));
  });

  it('atualiza o valor de um bem, mostra a variação e o histórico de avaliações', async () => {
    const car = await seedAsset('Carro');
    const user = await renderPage();

    let card = within(await screen.findByRole('region', { name: 'Carro' }));
    await user.click(card.getByRole('button', { name: 'Atualizar valor' }));
    let dialog = within(await screen.findByRole('dialog', { name: 'Atualizar valor: Carro' }));
    await user.click(dialog.getByRole('button', { name: 'Salvar avaliação' }));
    expect(dialog.getByText('Informe o novo valor.')).toBeInTheDocument();

    await user.type(dialog.getByLabelText('Novo valor'), '45.000');
    expect(dialog.getByText(/Desvalorização de/)).toHaveTextContent('Desvalorização de R$ 5.000,00 (-10%)');
    await user.click(dialog.getByRole('button', { name: 'Salvar avaliação' }));

    expect(await screen.findByText('Valor atualizado.')).toBeInTheDocument();
    expect((await db.assets.get(car.id))?.value).toBe(4500000);
    expect(await db.assetValuations.where('assetId').equals(car.id).count()).toBe(2);

    card = within(await screen.findByRole('region', { name: 'Carro' }));
    await waitFor(() => expect(card.getByText(/-10% desde a 1ª avaliação/)).toBeInTheDocument());
    expect(card.getByText(/2 avaliações/)).toBeInTheDocument();

    // Avaliação retroativa: entra no histórico sem mudar o valor atual.
    await user.click(card.getByRole('button', { name: 'Atualizar valor' }));
    dialog = within(await screen.findByRole('dialog', { name: 'Atualizar valor: Carro' }));
    const history = within(dialog.getByRole('region', { name: 'Histórico de avaliações' }));
    expect(history.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringMatching(/15\/10\/2026.*R\$ 45\.000,00.*-10%/),
      expect.stringMatching(/01\/09\/2026.*R\$ 50\.000,00/),
    ]);
    await user.type(dialog.getByLabelText('Novo valor'), '52.000');
    const date = dialog.getByLabelText('Data da avaliação');
    await user.clear(date);
    await user.type(date, '2026-08-01');
    expect(dialog.getByText(/Anterior à última avaliação \(15\/10\/2026\)/)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Salvar avaliação' }));
    expect(await screen.findByText('Avaliação antiga registrada no histórico.')).toBeInTheDocument();
    expect((await db.assets.get(car.id))?.value).toBe(4500000);
    expect(await db.assetValuations.where('assetId').equals(car.id).count()).toBe(3);
  });

  it('mostra patrimônio líquido, ativos x passivos, composição e variação do mês', async () => {
    const banco = await seedAccount('Banco', { initialBalance: 1000000 });
    await seedAccount('Cartão Roxo', { type: 'cartao_credito', initialBalance: -30000 });
    await addTransaction({
      type: 'receita',
      amount: 50000,
      date: '2026-10-05',
      description: 'Freela',
      categoryId: CATEGORY_IDS.salario,
      accountId: banco.id,
    });
    await seedAsset('Carro', { value: 4000000 });
    await addDebt({
      name: 'Empréstimo',
      creditor: 'Banco',
      type: 'emprestimo',
      originalAmount: 200000,
      balance: 200000,
      balanceDate: '2026-01-01',
      interestRate: 2,
      minimumPayment: 20000,
      dueDay: 10,
      remainingInstallments: null,
      status: 'ativa',
      notes: '',
    });
    await renderPage();

    // Ativos: 10.500 (banco) + 40.000 (carro) = 50.500; passivos: 300 (cartão) + 2.000 (dívida) = 2.300.
    await waitFor(() => expect(hero().getByText('R$ 48.200,00')).toBeInTheDocument());
    expect(hero().getByText('R$ 50.500,00')).toBeInTheDocument();
    expect(hero().getByText('R$ 2.300,00')).toBeInTheDocument();
    expect(hero().getByText(/desde set\/26/)).toHaveTextContent('+R$ 500,00 desde set/26');

    const composition = within(screen.getByRole('region', { name: 'Composição do patrimônio' }));
    expect(composition.getByText('Contas e investimentos')).toBeInTheDocument();
    expect(composition.getByText('Veículo')).toBeInTheDocument();
    expect(composition.getByText('Cartões de crédito')).toBeInTheDocument();
    expect(composition.getByText('Dívidas')).toBeInTheDocument();
    expect(composition.queryByText('Contas no negativo')).not.toBeInTheDocument();
    expect(composition.getByRole('progressbar', { name: /Dívidas: 87% dos passivos/ })).toBeInTheDocument();
    expect(composition.getByRole('link', { name: 'Ver dívidas' })).toHaveAttribute('href', '/dividas');

    expect(screen.getByText('Evolução')).toBeInTheDocument();
    expect(screen.getByText('Ver dados em tabela')).toBeInTheDocument();
  });

  it('arquiva, desarquiva e exclui um bem', async () => {
    const car = await seedAsset('Carro');
    const user = await renderPage();
    await waitFor(() => expect(hero().getAllByText('R$ 50.000,00').length).toBeGreaterThan(0));

    await user.click(screen.getByRole('button', { name: 'Arquivar Carro' }));
    expect(await screen.findByText('Bem arquivado: ele deixa de contar no patrimônio.')).toBeInTheDocument();
    await waitFor(() => expect(hero().getAllByText('R$ 0,00').length).toBeGreaterThan(0));
    expect((await db.assets.get(car.id))?.archived).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Arquivados (1)' }));
    await user.click(await screen.findByRole('button', { name: 'Desarquivar Carro' }));
    await waitFor(async () => expect((await db.assets.get(car.id))?.archived).toBe(false));
    // Espera a tela refletir (o card volta para a lista de bens ativos).
    await waitFor(() => expect(screen.queryByRole('button', { name: /Arquivados/ })).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Excluir Carro' }));
    const confirmDialog = within(await screen.findByRole('dialog', { name: 'Excluir “Carro”?' }));
    expect(confirmDialog.getByText(/histórico de 1 avaliação/)).toBeInTheDocument();
    await user.click(confirmDialog.getByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('Bem excluído.')).toBeInTheDocument();
    expect(await db.assets.count()).toBe(0);
    expect(await db.assetValuations.count()).toBe(0);
  });

  it('edita um bem sem permitir mudar o valor diretamente', async () => {
    const car = await seedAsset('Carro');
    const user = await renderPage();
    await user.click(await screen.findByRole('button', { name: 'Editar Carro' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Editar bem' }));
    expect(dialog.getByLabelText('Valor atual estimado')).toBeDisabled();
    await user.clear(dialog.getByLabelText('Nome'));
    await user.type(dialog.getByLabelText('Nome'), 'Carro da família');
    await user.type(dialog.getByLabelText('Valor de aquisição (opcional)'), '60.000');
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Bem atualizado.')).toBeInTheDocument();
    expect(await db.assets.get(car.id)).toMatchObject({
      name: 'Carro da família',
      value: 5000000,
      acquisitionValue: 6000000,
    });
    const card = within(await screen.findByRole('region', { name: 'Carro da família' }));
    expect(card.getByText(/-16,7% desde a aquisição/)).toBeInTheDocument();
  });
});
