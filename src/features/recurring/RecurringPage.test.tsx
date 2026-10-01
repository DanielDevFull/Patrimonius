import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { addAccount, addRecurring, addTransaction, setTransactionStatus } from '@/db/repo';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { Account, RecurringRule } from '@/domain/types';
import { renderWithProviders, resetDb } from '@/test/render';
import RecurringPage from './RecurringPage';

function seedAccount(name = 'Banco', p: Partial<Account> = {}) {
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

function seedRule(
  accountId: string,
  p: Partial<Omit<RecurringRule, 'id' | 'createdAt' | 'updatedAt' | 'nextDate'>> = {},
) {
  return addRecurring({
    type: 'despesa',
    amount: 5000,
    description: 'Streaming',
    categoryId: CATEGORY_IDS.assinaturas,
    accountId,
    frequency: 'mensal',
    startDate: '2026-11-01',
    endDate: null,
    autoGenerate: true,
    active: true,
    ...p,
  });
}

async function renderPage() {
  const user = userEvent.setup();
  renderWithProviders(<RecurringPage />, { route: '/recorrencias' });
  await screen.findByRole('heading', { name: 'Recorrências', level: 1 });
  return user;
}

function ruleRow(description: string) {
  const li = screen.getByText(description, { selector: 'span' }).closest('li');
  if (!li) throw new Error(`Regra não encontrada: ${description}`);
  return within(li);
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, description: string, item: string) {
  await user.click(ruleRow(description).getByRole('button', { name: `Ações de ${description}` }));
  await user.click(screen.getByRole('menuitem', { name: item }));
}

describe('RecurringPage', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
    await resetDb();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sem regras mostra estado vazio', async () => {
    await seedAccount();
    await renderPage();
    expect(await screen.findByText('Nenhuma recorrência cadastrada')).toBeInTheDocument();
    expect(screen.queryByText('Detectamos possíveis recorrências')).not.toBeInTheDocument();
  });

  it('mostra totais mensais equivalentes: receitas recorrentes x custo fixo mensal', async () => {
    const banco = await seedAccount();
    await seedRule(banco.id, {
      type: 'receita',
      amount: 500000,
      description: 'Salário',
      categoryId: CATEGORY_IDS.salario,
    });
    await seedRule(banco.id, { amount: 150000, description: 'Aluguel', categoryId: CATEGORY_IDS.moradia });
    await seedRule(banco.id, {
      amount: 120000,
      description: 'Seguro',
      frequency: 'anual',
      categoryId: CATEGORY_IDS.transporte,
    });
    await seedRule(banco.id, {
      amount: 10000,
      description: 'Faxina',
      frequency: 'semanal',
      categoryId: CATEGORY_IDS.moradia,
    });
    await seedRule(banco.id, { amount: 99999, description: 'Antiga', active: false });
    await renderPage();

    const totals = await screen.findByRole('region', { name: 'Totais mensais' });
    expect(within(totals).getByText('R$ 5.000,00')).toBeInTheDocument();
    // 1.500 + 1.200/12 + 100 * 52/12 = 2.033,33
    expect(within(totals).getByText('R$ 2.033,33')).toBeInTheDocument();
    expect(within(totals).getByText('+R$ 2.966,67')).toBeInTheDocument();
    expect(within(totals).getByText('40,7% das receitas recorrentes')).toBeInTheDocument();
    expect(within(totals).getByText('4 regras ativas · 1 pausada')).toBeInTheDocument();

    expect(ruleRow('Seguro').getByText('Transporte • Banco • Anual')).toBeInTheDocument();
    expect(ruleRow('Seguro').getByText(/≈/)).toHaveTextContent('≈ R$ 100,00/mês');
    expect(ruleRow('Antiga').getByText('Pausada')).toBeInTheDocument();
    expect(ruleRow('Aluguel').getByText('Ativa')).toBeInTheDocument();
    expect(ruleRow('Aluguel').getByText('Automática')).toBeInTheDocument();
    expect(ruleRow('Aluguel').getByText('Próxima: 01/11/2026')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Receitas' }));
    expect(screen.getByText('Salário', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByText('Aluguel', { selector: 'span' })).not.toBeInTheDocument();
  });

  it('cria recorrência pelo formulário, gera o pendente do mês e mostra atraso', async () => {
    const banco = await seedAccount();
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Nova recorrência' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Nova recorrência' }));
    await waitFor(() => expect(dialog.getByLabelText('Valor')).toHaveFocus());

    await user.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(dialog.getByText('Informe um valor maior que zero.')).toBeInTheDocument();
    expect(dialog.getByText('Escolha uma categoria.')).toBeInTheDocument();

    await user.type(dialog.getByLabelText('Valor'), '119,90');
    await user.type(dialog.getByLabelText('Descrição'), 'Academia');
    expect(dialog.getByLabelText('Categoria')).toHaveValue(CATEGORY_IDS.assinaturas);
    expect(dialog.getByLabelText('Conta')).toHaveValue(banco.id);
    fireEvent.change(dialog.getByLabelText('Início'), { target: { value: '2026-10-05' } });
    fireEvent.change(dialog.getByLabelText('Término (opcional)'), { target: { value: '2026-09-01' } });
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(dialog.getByText('O término deve ser depois do início.')).toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText('Término (opcional)'), { target: { value: '' } });
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Recorrência criada (1 lançamento pendente gerado).')).toBeInTheDocument();
    const [rule] = await db.recurring.toArray();
    expect(rule).toMatchObject({
      type: 'despesa',
      amount: 11990,
      description: 'Academia',
      categoryId: CATEGORY_IDS.assinaturas,
      accountId: banco.id,
      frequency: 'mensal',
      startDate: '2026-10-05',
      endDate: null,
      autoGenerate: true,
      active: true,
      nextDate: '2026-11-05',
    });
    const [tx] = await db.transactions.toArray();
    expect(tx).toMatchObject({ recurringId: rule.id, date: '2026-10-05', status: 'pendente', amount: 11990 });
    expect(ruleRow('Academia').getByText('Próxima: 05/10/2026')).toBeInTheDocument();
    expect(ruleRow('Academia').getByText('Atrasada')).toBeInTheDocument();
  });

  it('editar aplica o novo valor aos pendentes já gerados', async () => {
    const banco = await seedAccount();
    const rule = await seedRule(banco.id, {
      description: 'Internet',
      categoryId: CATEGORY_IDS.contas,
      amount: 9990,
      startDate: '2026-10-20',
    });
    const user = await renderPage();
    await user.click(await screen.findByText('Internet', { selector: 'span' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Editar recorrência' }));
    expect(dialog.getByRole('switch', { name: /Atualizar o lançamento pendente já gerado/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const amount = dialog.getByLabelText('Valor');
    await user.clear(amount);
    await user.type(amount, '109,90');
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Recorrência atualizada (e 1 lançamento pendente).')).toBeInTheDocument();
    expect((await db.recurring.get(rule.id))?.amount).toBe(10990);
    const [tx] = await db.transactions.toArray();
    expect(tx).toMatchObject({ amount: 10990, date: '2026-10-20', status: 'pendente' });
  });

  it('mudar o dia de início refaz o pendente do mês na nova data, sem duplicar a conta do mês', async () => {
    const banco = await seedAccount();
    const rule = await seedRule(banco.id, {
      description: 'Internet',
      categoryId: CATEGORY_IDS.contas,
      amount: 9990,
      startDate: '2026-08-10',
    });
    const generated = await db.transactions.where('recurringId').equals(rule.id).sortBy('date');
    expect(generated.map((t) => t.date)).toEqual(['2026-08-10', '2026-09-10', '2026-10-10']);
    await setTransactionStatus(generated[0].id, 'pago');
    await setTransactionStatus(generated[1].id, 'pago');

    const user = await renderPage();
    await user.click(await screen.findByText('Internet', { selector: 'span' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Editar recorrência' }));
    fireEvent.change(dialog.getByLabelText('Início'), { target: { value: '2026-08-15' } });
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(
      await screen.findByText(
        'Recorrência atualizada. O lançamento pendente da agenda antiga foi substituído pela nova data.',
      ),
    ).toBeInTheDocument();

    const after = await db.transactions.where('recurringId').equals(rule.id).sortBy('date');
    expect(after.map((t) => `${t.date}:${t.status}`)).toEqual([
      '2026-08-10:pago',
      '2026-09-10:pago',
      '2026-10-15:pendente',
    ]);
    expect(await db.recurring.get(rule.id)).toMatchObject({
      startDate: '2026-08-15',
      nextDate: '2026-11-15',
    });
  });

  it('mudar o dia de início quando a conta do mês já foi paga começa a nova agenda no mês seguinte', async () => {
    const banco = await seedAccount();
    const rule = await seedRule(banco.id, {
      description: 'Internet',
      categoryId: CATEGORY_IDS.contas,
      amount: 9990,
      startDate: '2026-08-10',
    });
    for (const t of await db.transactions.where('recurringId').equals(rule.id).toArray()) {
      await setTransactionStatus(t.id, 'pago');
    }
    const user = await renderPage();
    await user.click(await screen.findByText('Internet', { selector: 'span' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Editar recorrência' }));
    fireEvent.change(dialog.getByLabelText('Início'), { target: { value: '2026-08-15' } });
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Recorrência atualizada.')).toBeInTheDocument();

    const after = await db.transactions.where('recurringId').equals(rule.id).sortBy('date');
    expect(after.map((t) => `${t.date}:${t.status}`)).toEqual([
      '2026-08-10:pago',
      '2026-09-10:pago',
      '2026-10-10:pago',
    ]);
    expect((await db.recurring.get(rule.id))?.nextDate).toBe('2026-11-15');
  });

  it('definir o término exclui os pendentes já gerados depois dele', async () => {
    const banco = await seedAccount();
    const rule = await seedRule(banco.id, {
      description: 'Netflix',
      categoryId: CATEGORY_IDS.assinaturas,
      amount: 3990,
      startDate: '2026-09-14',
    });
    const user = await renderPage();
    await user.click(await screen.findByText('Netflix', { selector: 'span' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Editar recorrência' }));
    fireEvent.change(dialog.getByLabelText('Término (opcional)'), { target: { value: '2026-10-05' } });
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));
    expect(
      await screen.findByText(
        'Recorrência atualizada (e 1 lançamento pendente). 1 lançamento pendente depois do término foi excluído.',
      ),
    ).toBeInTheDocument();

    const after = await db.transactions.where('recurringId').equals(rule.id).sortBy('date');
    expect(after.map((t) => `${t.date}:${t.status}`)).toEqual(['2026-09-14:pendente']);
    expect((await db.recurring.get(rule.id))?.endDate).toBe('2026-10-05');
  });

  it('pausar mantém os lançamentos; reativar não gera os meses em que ficou pausada', async () => {
    const banco = await seedAccount();
    await seedRule(banco.id, {
      description: 'Curso',
      categoryId: CATEGORY_IDS.educacao,
      startDate: '2026-06-10',
      active: false,
    });
    const user = await renderPage();
    expect(await screen.findByText('Pausada')).toBeInTheDocument();

    await openMenu(user, 'Curso', 'Ativar');
    expect(await screen.findByText('Recorrência reativada.')).toBeInTheDocument();
    await waitFor(async () => expect(await db.transactions.count()).toBe(1));
    const [tx] = await db.transactions.toArray();
    expect(tx).toMatchObject({ date: '2026-10-10', status: 'pendente' });
    const [rule] = await db.recurring.toArray();
    expect(rule).toMatchObject({ active: true, nextDate: '2026-11-10' });

    await openMenu(user, 'Curso', 'Pausar');
    expect(
      await screen.findByText('Recorrência pausada. Os lançamentos já gerados foram mantidos.'),
    ).toBeInTheDocument();
    await waitFor(async () => expect((await db.recurring.get(rule.id))?.active).toBe(false));
    expect(await db.transactions.count()).toBe(1);
  });

  it('excluir pergunta se remove os pendentes gerados', async () => {
    const banco = await seedAccount();
    const luz = await seedRule(banco.id, {
      description: 'Luz',
      categoryId: CATEGORY_IDS.contas,
      startDate: '2026-10-01',
    });
    const agua = await seedRule(banco.id, {
      description: 'Água',
      categoryId: CATEGORY_IDS.contas,
      startDate: '2026-10-02',
    });
    await addTransaction({
      type: 'despesa',
      amount: 5000,
      date: '2026-09-02',
      description: 'Água',
      categoryId: CATEGORY_IDS.contas,
      accountId: banco.id,
      recurringId: agua.id,
    });
    const user = await renderPage();
    await screen.findByText('Luz', { selector: 'span' });

    await openMenu(user, 'Luz', 'Excluir');
    let dialog = within(await screen.findByRole('dialog', { name: 'Excluir recorrência?' }));
    expect(dialog.getByText(/Ela tem 1 lançamento pendente gerado/)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Excluir e remover pendentes' }));
    expect(await screen.findByText('Recorrência e lançamentos pendentes excluídos.')).toBeInTheDocument();
    expect(await db.recurring.get(luz.id)).toBeUndefined();
    expect((await db.transactions.toArray()).some((t) => t.description === 'Luz')).toBe(false);

    await openMenu(user, 'Água', 'Excluir');
    dialog = within(await screen.findByRole('dialog', { name: 'Excluir recorrência?' }));
    await user.click(dialog.getByRole('button', { name: 'Excluir e manter pendentes' }));
    expect(await screen.findByText('Recorrência excluída.')).toBeInTheDocument();
    const left = await db.transactions.toArray();
    expect(left).toHaveLength(2);
    expect(left.every((t) => t.recurringId === null)).toBe(true);
  });

  it('detecta possíveis recorrências e “Cadastrar” pré-preenche o formulário', async () => {
    const banco = await seedAccount();
    for (const date of ['2026-07-08', '2026-08-08', '2026-09-08', '2026-10-08']) {
      await addTransaction({
        type: 'despesa',
        amount: 3990,
        date,
        description: 'Netflix',
        categoryId: CATEGORY_IDS.assinaturas,
        accountId: banco.id,
      });
    }
    const user = await renderPage();
    expect(await screen.findByText('Detectamos possíveis recorrências')).toBeInTheDocument();
    expect(screen.getByText(/4 ocorrências • última em 08\/10\/2026/)).toBeInTheDocument();
    // Celular: a coluna de texto tem largura mínima (o flex-wrap leva valor e “Cadastrar” para a linha de baixo)
    // e o nome não é truncado. Antes (`min-w-0 flex-1` + `truncate`) o nome virava “P…” em 360 px.
    const name = screen.getByText('Netflix', { selector: 'p' });
    expect(name).not.toHaveClass('truncate');
    expect(name.parentElement).toHaveClass('basis-48', 'min-w-[min(100%,12rem)]');
    await user.click(screen.getByRole('button', { name: 'Cadastrar Netflix como recorrência' }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Nova recorrência' }));
    expect(dialog.getByLabelText('Valor')).toHaveValue('39,90');
    expect(dialog.getByLabelText('Descrição')).toHaveValue('Netflix');
    expect(dialog.getByLabelText('Categoria')).toHaveValue(CATEGORY_IDS.assinaturas);
    expect(dialog.getByLabelText('Conta')).toHaveValue(banco.id);
    expect(dialog.getByLabelText('Frequência')).toHaveValue('mensal');
    expect(dialog.getByLabelText('Início')).toHaveValue('2026-11-08');
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Recorrência criada.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText('Detectamos possíveis recorrências')).not.toBeInTheDocument(),
    );
    expect(ruleRow('Netflix').getByText('Próxima: 08/11/2026')).toBeInTheDocument();
    // “Suas recorrências” no celular: nome em até 2 linhas e metadados quebrando a linha (antes: `truncate`, ~80 px).
    const ruleName = screen.getByText('Netflix', { selector: 'span' });
    expect(ruleName).toHaveClass('line-clamp-2');
    expect(ruleName).not.toHaveClass('truncate');
    expect(ruleRow('Netflix').getByText(/Assinaturas • Banco • Mensal/)).not.toHaveClass('truncate');
  });
});
