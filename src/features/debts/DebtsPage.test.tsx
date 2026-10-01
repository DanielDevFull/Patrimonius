import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compareStrategies, toPayoffInputs } from '@/analytics';
import { db } from '@/db/db';
import { addAccount, addDebt, addDebtPayment } from '@/db/repo';
import { CATEGORY_IDS } from '@/domain/defaults';
import { formatBRL } from '@/domain/money';
import type { Debt } from '@/domain/types';
import { formatDuration } from '@/domain/format';
import { renderWithProviders, resetDb } from '@/test/render';
import DebtsPage from './DebtsPage';

type DebtSeed = Omit<Debt, 'id' | 'createdAt' | 'updatedAt'>;

function seedDebt(p: Partial<DebtSeed> = {}) {
  return addDebt({
    name: 'Empréstimo',
    creditor: 'Banco',
    type: 'emprestimo',
    originalAmount: 200000,
    balance: 100000,
    balanceDate: '2026-10-01',
    interestRate: 2,
    minimumPayment: 30000,
    dueDay: 10,
    remainingInstallments: null,
    status: 'ativa',
    notes: '',
    ...p,
  });
}

async function renderPage() {
  const user = userEvent.setup();
  renderWithProviders(<DebtsPage />, { route: '/dividas' });
  await screen.findByRole('heading', { name: 'Dívidas', level: 1 });
  return user;
}

const card = async (name: string) => within(await screen.findByRole('region', { name }));

describe('DebtsPage', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
    await resetDb();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('cria uma dívida validando o formulário e convertendo a taxa anual', async () => {
    const user = await renderPage();
    expect(await screen.findByText('Nenhuma dívida cadastrada')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cadastrar dívida' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Nova dívida' }));
    await waitFor(() => expect(dialog.getByLabelText('Nome')).toHaveFocus());

    await user.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(dialog.getByText('Informe um nome para a dívida.')).toBeInTheDocument();
    expect(dialog.getByText('Informe o saldo devedor atual.')).toBeInTheDocument();
    expect(dialog.getByLabelText('Nome')).toHaveFocus();
    expect(await db.debts.count()).toBe(0);

    await user.type(dialog.getByLabelText('Nome'), 'Cartão Roxo');
    await user.type(dialog.getByLabelText('Credor (opcional)'), 'Nubank');
    await user.selectOptions(dialog.getByLabelText('Tipo'), 'cartao');
    await user.type(dialog.getByLabelText('Saldo devedor'), '3.000');
    await user.type(dialog.getByLabelText('Só sabe a taxa ao ano? (%)'), '30');
    expect(dialog.getByText('30% a.a. = 2,2104% a.m.')).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Converter' }));
    expect(dialog.getByLabelText('Juros ao mês (%)')).toHaveValue('2,2104');
    expect(dialog.getByText('Equivale a 30% ao ano.')).toBeInTheDocument();
    await user.type(dialog.getByLabelText('Parcela mínima'), '300');
    await user.type(dialog.getByLabelText('Dia de vencimento'), '20');
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText(/Dívida cadastrada/)).toBeInTheDocument();
    const [debt] = await db.debts.toArray();
    expect(debt).toMatchObject({
      name: 'Cartão Roxo',
      creditor: 'Nubank',
      type: 'cartao',
      originalAmount: 300000,
      balance: 300000,
      balanceDate: '2026-10-15',
      interestRate: 2.2104,
      minimumPayment: 30000,
      dueDay: 20,
      remainingInstallments: null,
      status: 'ativa',
    });

    const c = await card('Cartão Roxo');
    expect(c.getByText('Juros altos')).toBeInTheDocument();
    expect(c.getByText('Vence em breve')).toBeInTheDocument();
    expect(c.getByText('Dia 20 · próximo 20/10/2026 (em 5 dias)')).toBeInTheDocument();
    expect(c.getByText('Saldo devedor atual').nextElementSibling).toHaveTextContent('R$ 3.000,00');
    expect(c.getByText('R$ 66,31')).toBeInTheDocument(); // juros do mês: 3000 × 2,2104%
  });

  it('registra pagamentos debitando da conta até quitar a dívida', async () => {
    const acc = await addAccount({
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
    const debt = await seedDebt();
    const user = await renderPage();

    let c = await card('Empréstimo');
    expect(c.getByText('R$ 1.000,00')).toBeInTheDocument();
    expect(c.getByText(/50% quitado/)).toBeInTheDocument();
    await user.click(c.getByRole('button', { name: 'Registrar pagamento' }));

    let dialog = within(await screen.findByRole('dialog', { name: 'Pagar Empréstimo' }));
    await user.click(dialog.getByRole('button', { name: /Parcela mínima/ }));
    await user.selectOptions(dialog.getByLabelText('Debitar de uma conta (opcional)'), acc.id);
    expect(
      dialog.getByText(/Será criada uma despesa em “Dívidas e empréstimos” na conta Banco/),
    ).toBeInTheDocument();
    await user.type(dialog.getByLabelText('Observação (opcional)'), 'parcela 1');
    await user.click(dialog.getByRole('button', { name: 'Registrar pagamento' }));

    expect(await screen.findByText('Pagamento registrado.')).toBeInTheDocument();
    const [payment] = await db.debtPayments.toArray();
    expect(payment).toMatchObject({ debtId: debt.id, amount: 30000, date: '2026-10-15', note: 'parcela 1' });
    expect(payment.transactionId).not.toBeNull();
    const tx = await db.transactions.get(payment.transactionId!);
    expect(tx).toMatchObject({
      type: 'despesa',
      amount: 30000,
      accountId: acc.id,
      categoryId: CATEGORY_IDS.dividas,
      description: 'Pagamento: Empréstimo',
      status: 'pago',
    });
    c = await card('Empréstimo');
    await waitFor(() => expect(c.getByText('R$ 700,00')).toBeInTheDocument());

    // Quita o restante (sem debitar conta).
    await user.click(c.getByRole('button', { name: 'Registrar pagamento' }));
    dialog = within(await screen.findByRole('dialog', { name: 'Pagar Empréstimo' }));
    await user.click(dialog.getByRole('button', { name: /Quitar tudo/ }));
    expect(dialog.getByText('Este pagamento quita a dívida.')).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Registrar pagamento' }));

    expect(await screen.findByText('🎉 Parabéns! Você quitou “Empréstimo”!')).toBeInTheDocument();
    expect((await db.debts.get(debt.id))?.status).toBe('quitada');
    expect(await db.transactions.count()).toBe(1);
    const quitadas = within(await screen.findByRole('region', { name: 'Dívidas quitadas' }));
    expect(quitadas.getByRole('button', { name: 'Reabrir' })).toBeInTheDocument();
    expect(screen.getByText('Nenhuma dívida em aberto')).toBeInTheDocument();
  });

  it('excluir um pagamento do histórico reabre a dívida quitada e remove a despesa vinculada', async () => {
    const acc = await addAccount({
      name: 'Banco',
      type: 'corrente',
      initialBalance: 0,
      color: '#0f766e',
      icon: '🏦',
      archived: false,
      includeInNetWorth: true,
      creditLimit: null,
      closingDay: null,
      dueDay: null,
    });
    const debt = await seedDebt({ balance: 50000 });
    await addDebtPayment({ debtId: debt.id, amount: 50000, date: '2026-10-05', fromAccountId: acc.id });
    expect((await db.debts.get(debt.id))?.status).toBe('quitada');
    const user = await renderPage();

    const c = await card('Empréstimo');
    expect(c.getByText('Quitada')).toBeInTheDocument();
    await user.click(c.getByRole('button', { name: 'Histórico de pagamentos (1)' }));
    await user.click(c.getByRole('button', { name: 'Excluir pagamento de 05/10/2026' }));
    const confirmDialog = within(
      await screen.findByRole('dialog', { name: 'Excluir o pagamento de 05/10/2026?' }),
    );
    expect(
      confirmDialog.getByText(/A despesa de R\$ 500,00 lançada na conta também será excluída/),
    ).toBeInTheDocument();
    await user.click(confirmDialog.getByRole('button', { name: 'Excluir' }));

    expect(await screen.findByText('Pagamento excluído.')).toBeInTheDocument();
    expect(await db.debtPayments.count()).toBe(0);
    expect(await db.transactions.count()).toBe(0);
    expect((await db.debts.get(debt.id))?.status).toBe('ativa');
    const ativas = within(await screen.findByRole('region', { name: 'Dívidas ativas' }));
    expect(ativas.getByText('R$ 500,00')).toBeInTheDocument();
  });

  it('mostra o resumo e o plano de quitação com as duas estratégias', async () => {
    await seedDebt({
      name: 'Cartão',
      type: 'cartao',
      originalAmount: 200000,
      balance: 200000,
      interestRate: 8,
      minimumPayment: 20000,
    });
    await seedDebt({ name: 'Empréstimo', balance: 100000, interestRate: 2, minimumPayment: 10000 });
    const user = await renderPage();

    const summary = within(await screen.findByRole('region', { name: 'Resumo das dívidas' }));
    expect(summary.getByText('R$ 3.000,00')).toBeInTheDocument();
    expect(summary.getByText('R$ 180,00')).toBeInTheDocument(); // 2000×8% + 1000×2%
    expect(summary.getByText('R$ 300,00')).toBeInTheDocument();
    expect(summary.getByText('6% a.m.')).toBeInTheDocument(); // (2000×8 + 1000×2) / 3000
    expect(screen.getByText(/“Cartão” tem juros altos/)).toBeInTheDocument();

    const plan = within(screen.getByRole('region', { name: 'Plano de quitação' }));
    const budget = plan.getByLabelText('Orçamento mensal para dívidas');
    expect(budget).toHaveValue('330,00'); // mínimos + 10%

    const [debts, payments] = await Promise.all([db.debts.toArray(), db.debtPayments.toArray()]);
    const expected = compareStrategies(toPayoffInputs(debts, payments), 33000);
    expect(expected.avalanche.feasible && expected.snowball.feasible).toBe(true);
    expect(expected.recommended).toBe('avalanche');

    const avalanche = within(plan.getByRole('region', { name: 'Estratégia Avalanche' }));
    const snowball = within(plan.getByRole('region', { name: 'Estratégia Bola de neve' }));
    expect(avalanche.getByText('Recomendada')).toBeInTheDocument();
    expect(snowball.queryByText('Recomendada')).not.toBeInTheDocument();
    expect(avalanche.getByText(formatBRL(expected.avalanche.totalInterest))).toBeInTheDocument();
    expect(snowball.getByText(formatBRL(expected.snowball.totalInterest))).toBeInTheDocument();
    expect(avalanche.getByText(formatDuration(expected.avalanche.months))).toBeInTheDocument();
    expect(
      within(avalanche.getByRole('list'))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(expected.avalanche.payoffOrder.map((p) => expect.stringContaining(p.name)));
    expect(within(snowball.getByRole('list')).getAllByRole('listitem')[0]).toHaveTextContent('Empréstimo');
    const advice = plan.getByText(/Recomendo a/);
    expect(advice).toHaveTextContent(formatBRL(expected.interestSavings));
    expect(advice).toHaveTextContent('a Bola de neve elimina “Empréstimo”');
    expect(plan.getByText('Saldo total ao longo do tempo')).toBeInTheDocument();
    expect(plan.getByText('Ver dados em tabela')).toBeInTheDocument();

    // Orçamento abaixo dos mínimos => aviso de inviável.
    await user.clear(budget);
    await user.type(budget, '250');
    expect(await plan.findByRole('alert')).toHaveTextContent(/não dá para pagar nem as parcelas mínimas/);
    expect(plan.getByRole('alert')).toHaveTextContent('Faltam R$ 50,00 por mês');
    expect(plan.getAllByText('Inviável')).toHaveLength(2);

    await user.click(plan.getByRole('button', { name: 'Usar sugestão (mínimos + 10%)' }));
    expect(budget).toHaveValue('330,00');
    expect(plan.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('quando os juros do cartão engolem a bola de neve, só a avalanche é viável', async () => {
    await seedDebt({
      name: 'Cartão',
      type: 'cartao',
      balance: 300000,
      interestRate: 12,
      minimumPayment: 30000,
    });
    await seedDebt({ name: 'Empréstimo', balance: 100000, interestRate: 2, minimumPayment: 10000 });
    await renderPage();

    const plan = within(await screen.findByRole('region', { name: 'Plano de quitação' }));
    const snowball = within(plan.getByRole('region', { name: 'Estratégia Bola de neve' }));
    expect(snowball.getByText('Inviável')).toBeInTheDocument();
    expect(snowball.getByText(/não são quitadas em até 50 anos/)).toBeInTheDocument();
    const avalanche = within(plan.getByRole('region', { name: 'Estratégia Avalanche' }));
    expect(avalanche.getByText('Recomendada')).toBeInTheDocument();
    expect(plan.getByText(/Só a estratégia/)).toHaveTextContent(
      'Só a estratégia Avalanche consegue quitar tudo',
    );
  });

  it('edita, marca como quitada, reabre e exclui uma dívida', async () => {
    const debt = await seedDebt({ name: 'Carro', type: 'financiamento', interestRate: 1.5 });
    await addDebtPayment({ debtId: debt.id, amount: 20000, date: '2026-10-02' });
    const user = await renderPage();

    let c = await card('Carro');
    await user.click(c.getByRole('button', { name: 'Editar Carro' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Editar dívida' }));
    expect(dialog.getByLabelText('Juros ao mês (%)')).toHaveValue('1,5');
    expect(dialog.getByText(/Saldo atual calculado/)).toHaveTextContent('R$ 800,00');
    await user.clear(dialog.getByLabelText('Juros ao mês (%)'));
    await user.type(dialog.getByLabelText('Juros ao mês (%)'), '3,2');
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Dívida atualizada.')).toBeInTheDocument();
    expect((await db.debts.get(debt.id))?.interestRate).toBe(3.2);

    c = await card('Carro');
    await user.click(c.getByRole('button', { name: 'Marcar como quitada' }));
    let confirmDialog = within(await screen.findByRole('dialog', { name: 'Marcar “Carro” como quitada?' }));
    expect(confirmDialog.getByText(/saldo restante de R\$ 800,00/)).toBeInTheDocument();
    await user.click(confirmDialog.getByRole('button', { name: 'Marcar como quitada' }));
    await waitFor(async () => expect((await db.debts.get(debt.id))?.status).toBe('quitada'));

    const quitadas = within(await screen.findByRole('region', { name: 'Dívidas quitadas' }));
    await user.click(quitadas.getByRole('button', { name: 'Reabrir' }));
    await waitFor(async () => expect((await db.debts.get(debt.id))?.status).toBe('ativa'));

    const ativas = within(await screen.findByRole('region', { name: 'Dívidas ativas' }));
    await user.click(ativas.getByRole('button', { name: 'Excluir Carro' }));
    confirmDialog = within(await screen.findByRole('dialog', { name: 'Excluir a dívida “Carro”?' }));
    expect(confirmDialog.getByText(/histórico de 1 pagamento será apagado/)).toBeInTheDocument();
    await user.click(confirmDialog.getByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('Nenhuma dívida cadastrada')).toBeInTheDocument();
    expect(await db.debts.count()).toBe(0);
    expect(await db.debtPayments.count()).toBe(0);
  });
});
