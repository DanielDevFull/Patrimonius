import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { suggestCategory } from '@/agent/categorizer';
import { db } from '@/db/db';
import { addAccount, addTransaction } from '@/db/repo';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { Account } from '@/domain/types';
import { renderWithProviders, resetDb } from '@/test/render';
import { TransactionFormModal } from './TransactionForm';

// Mesmo categorizador, só observado (para contar quantas vezes a sugestão é recalculada).
vi.mock('@/agent/categorizer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/agent/categorizer')>();
  return { ...actual, suggestCategory: vi.fn(actual.suggestCategory) };
});

const TODAY = '2026-10-15';

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

function renderForm(props: Partial<Parameters<typeof TransactionFormModal>[0]> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(<TransactionFormModal open onClose={onClose} onSaved={onSaved} {...props} />);
  return { user, onClose, onSaved };
}

const dialog = () => within(screen.getByRole('dialog'));

describe('TransactionFormModal', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
    await resetDb();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('cria despesa simples com categoria sugerida automaticamente', async () => {
    const banco = await seedAccount('Banco');
    const { user, onClose, onSaved } = renderForm();

    const amount = await screen.findByLabelText('Valor');
    await waitFor(() => expect(amount).toHaveFocus());
    await user.type(amount, '45,90');
    await user.type(screen.getByLabelText('Descrição'), 'Supermercado do bairro');
    expect(screen.getByLabelText('Categoria')).toHaveValue(CATEGORY_IDS.mercado);
    expect(screen.getByText('Sugerida automaticamente pelo Pat')).toBeInTheDocument();
    expect(screen.getByLabelText('Conta ou cartão')).toHaveValue(banco.id);
    expect(screen.getByLabelText('Data')).toHaveValue(TODAY);
    expect(screen.getByRole('radio', { name: 'Pago' })).toBeChecked();
    await user.type(screen.getByLabelText('Tags'), 'casa, Casa, mensal');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const txs = await db.transactions.toArray();
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({
      type: 'despesa',
      amount: 4590,
      description: 'Supermercado do bairro',
      categoryId: CATEGORY_IDS.mercado,
      accountId: banco.id,
      toAccountId: null,
      date: TODAY,
      status: 'pago',
      tags: ['casa', 'mensal'],
      installment: null,
      recurringId: null,
    });
    expect(onSaved).toHaveBeenCalledWith([expect.objectContaining({ id: txs[0].id, amount: 4590 })]);
    expect(await screen.findByText('Despesa salva.')).toBeInTheDocument();
  });

  it('digitar a descrição recalcula a sugestão no máximo uma vez por tecla (só com o valor adiado)', async () => {
    await seedAccount('Banco');
    const { user } = renderForm();
    const description = await screen.findByLabelText('Descrição');
    vi.mocked(suggestCategory).mockClear();
    await user.type(description, 'Mercado');
    await waitFor(() => expect(screen.getByLabelText('Categoria')).toHaveValue(CATEGORY_IDS.mercado));
    const calls = vi.mocked(suggestCategory).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.length).toBeLessThanOrEqual('Mercado'.length);
    expect(calls.at(-1)?.[0]).toBe('Mercado');
  });

  it('valida campos em pt-BR e usa o nome da categoria quando a descrição fica vazia', async () => {
    await seedAccount('Banco');
    const { user, onClose } = renderForm();
    await screen.findByLabelText('Valor');

    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByText('Informe um valor maior que zero.')).toBeInTheDocument();
    expect(screen.getByText('Escolha uma categoria.')).toBeInTheDocument();
    expect(screen.getByLabelText('Valor')).toHaveFocus();
    expect(await db.transactions.count()).toBe(0);
    expect(onClose).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Valor'), '30');
    await user.selectOptions(screen.getByLabelText('Categoria'), CATEGORY_IDS.transporte);
    expect(screen.queryByText('Informe um valor maior que zero.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [tx] = await db.transactions.toArray();
    expect(tx).toMatchObject({
      amount: 3000,
      description: 'Transporte',
      categoryId: CATEGORY_IDS.transporte,
    });
  });

  it('ano digitado errado na data (ex.: 0226) não salva um lançamento escondido', async () => {
    await seedAccount('Banco');
    const { user, onClose } = renderForm();
    await user.type(await screen.findByLabelText('Valor'), '150');
    await user.type(screen.getByLabelText('Descrição'), 'Mercado');
    const date = screen.getByLabelText('Data');
    expect(date).toHaveAttribute('min', '1900-01-01');
    expect(date).toHaveAttribute('max', '2036-12-31');
    fireEvent.change(date, { target: { value: '0226-01-10' } });
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByText('Confira o ano da data.')).toBeInTheDocument();
    expect(screen.getByLabelText('Data')).toHaveFocus();
    expect(await db.transactions.count()).toBe(0);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-01-10' } });
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect((await db.transactions.toArray())[0]).toMatchObject({ date: '2026-01-10', amount: 15000 });
  });

  it('data futura deixa a situação pendente por padrão', async () => {
    await seedAccount('Banco');
    renderForm();
    await screen.findByLabelText('Valor');
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-10-20' } });
    expect(screen.getByRole('radio', { name: 'Pendente' })).toBeChecked();
  });

  it('cria compra parcelada em 3x com soma exata e parcelas seguintes pendentes', async () => {
    const banco = await seedAccount('Banco');
    const { user, onSaved } = renderForm();
    await user.type(await screen.findByLabelText('Valor'), '100');
    await user.type(screen.getByLabelText('Descrição'), 'Fone de ouvido');
    await user.selectOptions(screen.getByLabelText('Categoria'), CATEGORY_IDS.compras);
    const installments = screen.getByLabelText('Parcelas');
    await user.clear(installments);
    await user.type(installments, '49');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByText('Informe de 1 a 48 parcelas.')).toBeInTheDocument();

    await user.clear(installments);
    await user.type(installments, '3');
    expect(screen.getByLabelText('Valor total')).toBeInTheDocument();
    expect(screen.getByText(/3x de/)).toHaveTextContent('3x de R$ 33,33 (1ª parcela de R$ 33,34)');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(async () => expect(await db.transactions.count()).toBe(3));
    const txs = (await db.transactions.toArray()).sort(
      (a, b) => a.installment!.number - b.installment!.number,
    );
    expect(txs.map((t) => t.amount)).toEqual([3334, 3333, 3333]);
    expect(txs.reduce((s, t) => s + t.amount, 0)).toBe(10000);
    expect(txs.map((t) => t.description)).toEqual([
      'Fone de ouvido (1/3)',
      'Fone de ouvido (2/3)',
      'Fone de ouvido (3/3)',
    ]);
    expect(txs.map((t) => t.date)).toEqual(['2026-10-15', '2026-11-15', '2026-12-15']);
    expect(txs.map((t) => t.status)).toEqual(['pago', 'pendente', 'pendente']);
    expect(new Set(txs.map((t) => t.installment!.groupId)).size).toBe(1);
    expect(txs.every((t) => t.accountId === banco.id)).toBe(true);
    expect(onSaved.mock.calls[0][0]).toHaveLength(3);
    expect(await screen.findByText('Compra parcelada em 3x salva.')).toBeInTheDocument();
  });

  it('cria transferência entre contas diferentes (sem categoria)', async () => {
    const banco = await seedAccount('Banco');
    const poupanca = await seedAccount('Poupança', { type: 'poupanca', icon: '🐷' });
    const { user, onClose } = renderForm();
    await screen.findByLabelText('Valor');
    await user.click(screen.getByRole('radio', { name: 'Transferência' }));
    expect(screen.queryByLabelText('Categoria')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Parcelas')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /Repetir todo mês/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('De (origem)')).toHaveValue(banco.id);
    expect(screen.getByLabelText('Para (destino)')).toHaveValue(poupanca.id);

    await user.type(screen.getByLabelText('Valor'), '250');
    await user.selectOptions(screen.getByLabelText('Para (destino)'), banco.id);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByText('Origem e destino precisam ser contas diferentes.')).toBeInTheDocument();
    expect(await db.transactions.count()).toBe(0);

    await user.selectOptions(screen.getByLabelText('Para (destino)'), poupanca.id);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [tx] = await db.transactions.toArray();
    expect(tx).toMatchObject({
      type: 'transferencia',
      amount: 25000,
      accountId: banco.id,
      toAccountId: poupanca.id,
      categoryId: null,
      description: 'Transferência para Poupança',
      status: 'pago',
    });
  });

  it('“Repetir todo mês” cria a recorrência e marca como pago o lançamento da data', async () => {
    const banco = await seedAccount('Banco');
    const { user, onSaved } = renderForm({ initial: { type: 'receita' } });
    await user.type(await screen.findByLabelText('Valor'), '5.000');
    await user.type(screen.getByLabelText('Descrição'), 'Salário');
    expect(screen.getByLabelText('Categoria')).toHaveValue(CATEGORY_IDS.salario);
    // Data em agosto (mês passado): registra agosto como recebido e só gera a partir do mês corrente —
    // setembro não vira pendente vencido.
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-08-05' } });
    await user.click(screen.getByRole('switch', { name: /Repetir todo mês/ }));
    expect(screen.queryByLabelText('Parcelas')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(async () => expect(await db.recurring.count()).toBe(1));
    const [rule] = await db.recurring.toArray();
    expect(rule).toMatchObject({
      type: 'receita',
      amount: 500000,
      description: 'Salário',
      categoryId: CATEGORY_IDS.salario,
      accountId: banco.id,
      frequency: 'mensal',
      startDate: '2026-08-05',
      endDate: null,
      autoGenerate: true,
      active: true,
      nextDate: '2026-11-05',
    });
    await waitFor(async () =>
      expect((await db.transactions.toArray()).find((t) => t.date === '2026-08-05')?.status).toBe('pago'),
    );
    const txs = (await db.transactions.toArray()).sort((a, b) => a.date.localeCompare(b.date));
    expect(txs.map((t) => [t.date, t.status, t.recurringId])).toEqual([
      ['2026-08-05', 'pago', rule.id],
      ['2026-10-05', 'pendente', rule.id],
    ]);
    expect(onSaved.mock.calls[0][0].map((t: { date: string }) => t.date)).toEqual([
      '2026-08-05',
      '2026-10-05',
    ]);
    expect(await screen.findByText('Recorrência mensal criada (2 lançamentos gerados).')).toBeInTheDocument();
  });

  it('“Salvar e novo” mantém tipo, conta e data e limpa o resto', async () => {
    await seedAccount('Banco');
    const poupanca = await seedAccount('Poupança', { type: 'poupanca' });
    const { user, onClose } = renderForm();
    await screen.findByLabelText('Valor');
    await user.click(screen.getByRole('radio', { name: 'Receita' }));
    await user.type(screen.getByLabelText('Valor'), '120');
    await user.type(screen.getByLabelText('Descrição'), 'Freela de design');
    await user.selectOptions(screen.getByLabelText('Categoria'), CATEGORY_IDS.rendaExtra);
    await user.selectOptions(screen.getByLabelText('Conta'), poupanca.id);
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-10-10' } });
    await user.type(screen.getByLabelText('Observações'), 'cliente novo');
    await user.click(screen.getByRole('button', { name: 'Salvar e novo' }));

    await waitFor(async () => expect(await db.transactions.count()).toBe(1));
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText('Valor')).toHaveValue(''));
    expect(screen.getByLabelText('Valor')).toHaveFocus();
    expect(screen.getByLabelText('Descrição')).toHaveValue('');
    expect(screen.getByLabelText('Observações')).toHaveValue('');
    expect(screen.getByLabelText('Categoria')).toHaveValue('');
    expect(screen.getByRole('radio', { name: 'Receita' })).toBeChecked();
    expect(screen.getByLabelText('Conta')).toHaveValue(poupanca.id);
    expect(screen.getByLabelText('Data')).toHaveValue('2026-10-10');
    const [tx] = await db.transactions.toArray();
    expect(tx).toMatchObject({
      type: 'receita',
      amount: 12000,
      accountId: poupanca.id,
      notes: 'cliente novo',
    });
  });

  it('sem contas: oferece criar a “Carteira” e libera o formulário', async () => {
    const { user } = renderForm();
    expect(await screen.findByText('Cadastre uma conta primeiro')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ir para Contas' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Criar conta “Carteira”' }));

    const amount = await screen.findByLabelText('Valor');
    const [account] = await db.accounts.toArray();
    expect(account).toMatchObject({ name: 'Carteira', type: 'carteira', initialBalance: 0, archived: false });
    expect(screen.getByLabelText('Conta ou cartão')).toHaveValue(account.id);
    expect(amount).toBeInTheDocument();
  });

  it('editar uma parcela altera só aquela parcela', async () => {
    const banco = await seedAccount('Banco');
    const parts = await addTransaction({
      type: 'despesa',
      amount: 30000,
      date: '2026-10-01',
      description: 'Bicicleta',
      categoryId: CATEGORY_IDS.compras,
      accountId: banco.id,
      installments: 3,
    });
    const second = parts[1];
    const { user, onClose, onSaved } = renderForm({ transaction: second });

    expect(await screen.findByRole('heading', { name: 'Editar parcela' })).toBeInTheDocument();
    expect(screen.getByText('Parcela 2 de 3: as alterações valem só para esta parcela.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Parcelas')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar e novo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Transferência' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Valor')).toHaveValue('100,00');
    expect(screen.getByLabelText('Descrição')).toHaveValue('Bicicleta (2/3)');

    const amount = screen.getByLabelText('Valor');
    await user.clear(amount);
    await user.type(amount, '120');
    await user.click(dialog().getByRole('radio', { name: 'Pago' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const after = (await db.transactions.toArray()).sort(
      (a, b) => a.installment!.number - b.installment!.number,
    );
    expect(after.map((t) => t.amount)).toEqual([10000, 12000, 10000]);
    expect(after.map((t) => t.status)).toEqual(['pago', 'pago', 'pendente']);
    expect(after[1].installment).toEqual(second.installment);
    expect(onSaved).toHaveBeenCalledWith([expect.objectContaining({ id: second.id, amount: 12000 })]);
    expect(await screen.findByText('Parcela atualizada.')).toBeInTheDocument();
  });

  it('pré-preenchimento (ex.: vindo do assistente) é respeitado sem sugerir outra categoria', async () => {
    const banco = await seedAccount('Banco');
    const { user, onClose } = renderForm({
      initial: {
        type: 'despesa',
        amount: 8990,
        description: 'ifood',
        categoryId: CATEGORY_IDS.lazer,
        accountId: banco.id,
        status: 'pendente',
        date: '2026-10-12',
      },
    });
    expect(await screen.findByLabelText('Valor')).toHaveValue('89,90');
    expect(screen.getByLabelText('Categoria')).toHaveValue(CATEGORY_IDS.lazer);
    expect(screen.queryByText('Sugerida automaticamente pelo Pat')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Pendente' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [tx] = await db.transactions.toArray();
    expect(tx).toMatchObject({
      amount: 8990,
      categoryId: CATEGORY_IDS.lazer,
      status: 'pendente',
      date: '2026-10-12',
    });
  });

  it('ignora categoria de outro tipo e conta inexistente vindas do pré-preenchimento', async () => {
    await seedAccount('Banco');
    const { user, onClose } = renderForm({
      initial: {
        type: 'receita',
        amount: 1000,
        categoryId: CATEGORY_IDS.mercado,
        accountId: 'conta-que-nao-existe',
      },
    });
    await screen.findByLabelText('Valor');
    expect(screen.getByLabelText('Categoria')).toHaveValue('');
    expect(screen.getByLabelText('Conta')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByText('Escolha uma categoria.')).toBeInTheDocument();
    expect(screen.getByText('Escolha uma conta.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(await db.transactions.count()).toBe(0);
  });
});
