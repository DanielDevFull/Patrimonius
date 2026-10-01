import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { addAccount, addChatMessage } from '@/db/repo';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { Account } from '@/domain/types';
import { renderWithProviders, resetDb } from '@/test/render';
import AssistantPage from './AssistantPage';
import { readAgentPayload } from './chat-utils';

const TODAY = '2026-10-15';
/** Resposta do agente leva ~400ms (indicador "digitando…") + gravações no banco. */
const REPLY = { timeout: 4000 };

function seedAccount(name: string, p: Partial<Account> = {}) {
  return addAccount({
    name,
    type: 'corrente',
    initialBalance: 100000,
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

async function renderPage({ strict = false }: { strict?: boolean } = {}) {
  const user = userEvent.setup();
  const page = <AssistantPage />;
  renderWithProviders(strict ? <StrictMode>{page}</StrictMode> : page, { route: '/assistente' });
  await screen.findByRole('heading', { level: 1, name: /Assistente/ });
  return user;
}

/** Espera a saudação inicial do Pat (primeira visita). */
async function waitGreeting() {
  await screen.findByText(/Oi, Teste!/, undefined, REPLY);
}

function messageField() {
  return screen.getByLabelText('Mensagem para o Pat');
}

async function sendMessage(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(messageField(), `${text}{Enter}`);
}

async function chatMessages() {
  const all = await db.chat.toArray();
  return all.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

describe('AssistantPage', { timeout: 20000 }, () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
    await resetDb();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('primeira visita grava e mostra a saudação uma única vez (inclusive no StrictMode)', async () => {
    await renderPage({ strict: true });
    await waitGreeting();
    expect(screen.getByText(/Eu sou o Pat/)).toBeInTheDocument();
    // Sem contas: o Pat sugere cadastrar uma.
    expect(screen.getByRole('button', { name: 'Cadastrar conta' })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 100));
    const msgs = await chatMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe('agent');
    expect(readAgentPayload(msgs[0].payload)?.reply.intent).toBe('saudacao');
    expect(screen.getByText('O Pat roda no seu dispositivo — nada é enviado para a internet.')).toBeInTheDocument();
  });

  it('com histórico salvo não grava nova saudação', async () => {
    await addChatMessage('user', 'oi');
    await new Promise((r) => setTimeout(r, 5));
    await addChatMessage('agent', 'Olá de novo!', null);
    await renderPage();
    expect(await screen.findByText('Olá de novo!')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 100));
    expect(await db.chat.count()).toBe(2);
    expect(screen.queryByText(/Oi, Teste!/)).not.toBeInTheDocument();
  });

  it('"gastei 50 no mercado hoje" mostra a confirmação e, ao confirmar, cria o lançamento', async () => {
    const banco = await seedAccount('Banco');
    const user = await renderPage();
    await waitGreeting();

    await sendMessage(user, 'gastei 50 no mercado hoje');
    expect(messageField()).toHaveValue('');
    expect(await screen.findByText('gastei 50 no mercado hoje')).toBeInTheDocument();
    expect(await screen.findByText('Pat está digitando…')).toBeInTheDocument();

    const card = within(await screen.findByRole('region', { name: 'Registrar despesa: confirmação' }, REPLY));
    expect(screen.queryByText('Pat está digitando…')).not.toBeInTheDocument();
    expect(card.getByText('R$ 50,00')).toBeInTheDocument();
    expect(card.getByText('🛒 Mercado')).toBeInTheDocument();
    expect(card.getByText('🏦 Banco')).toBeInTheDocument();
    expect(card.getByText('15/10/2026')).toBeInTheDocument();
    expect(await db.transactions.count()).toBe(0);

    await user.click(card.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText(/Pronto! Registrei a despesa de/, undefined, REPLY)).toBeInTheDocument();
    const txs = await db.transactions.toArray();
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({
      type: 'despesa',
      amount: 5000,
      categoryId: CATEGORY_IDS.mercado,
      accountId: banco.id,
      date: TODAY,
      status: 'pago',
      installment: null,
    });
    // A ação fica marcada como feita (sem botões) e persistida no histórico.
    expect(card.getByText('Registrado')).toBeInTheDocument();
    expect(card.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
    const proposal = (await chatMessages()).find((m) => readAgentPayload(m.payload)?.reply.actions[0]?.type === 'create_transaction');
    expect(readAgentPayload(proposal?.payload)?.done).toEqual([0]);
  });

  it('com mais de uma conta pede a escolha da conta antes de confirmar', async () => {
    await seedAccount('Banco');
    const nubank = await seedAccount('Nubank', { icon: '💜' });
    const user = await renderPage();
    await waitGreeting();

    await sendMessage(user, 'gastei 50 no mercado hoje');
    const card = within(await screen.findByRole('region', { name: 'Registrar despesa: confirmação' }, REPLY));
    const confirmButton = card.getByRole('button', { name: 'Confirmar' });
    expect(confirmButton).toBeDisabled();

    await user.selectOptions(card.getByLabelText('Conta ou cartão'), nubank.id);
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    await screen.findByText(/Pronto! Registrei a despesa/, undefined, REPLY);
    const [tx] = await db.transactions.toArray();
    expect(tx.accountId).toBe(nubank.id);
    expect(screen.getByText(/em 💜 Nubank/)).toBeInTheDocument();
  });

  it('Cancelar descarta a proposta sem criar lançamento', async () => {
    await seedAccount('Banco');
    const user = await renderPage();
    await waitGreeting();
    await sendMessage(user, 'gastei 50 no mercado hoje');
    const card = within(await screen.findByRole('region', { name: 'Registrar despesa: confirmação' }, REPLY));

    await user.click(card.getByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByText(/Tudo bem, não registrei nada/, undefined, REPLY)).toBeInTheDocument();
    expect(card.getByText('Cancelado')).toBeInTheDocument();
    expect(card.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
    expect(await db.transactions.count()).toBe(0);
  });

  it('Editar abre o formulário pré-preenchido e salvar registra o lançamento', async () => {
    const banco = await seedAccount('Banco');
    const user = await renderPage();
    await waitGreeting();
    await sendMessage(user, 'gastei 50 no mercado hoje');
    const card = within(await screen.findByRole('region', { name: 'Registrar despesa: confirmação' }, REPLY));

    await user.click(card.getByRole('button', { name: 'Editar' }));
    // O formulário troca o modal de carregamento pelo definitivo: busca o diálogo depois do campo aparecer.
    await screen.findByLabelText('Valor', undefined, REPLY);
    const dialog = within(screen.getByRole('dialog', { name: 'Novo lançamento' }));
    expect(dialog.getByLabelText('Valor')).toHaveValue('50,00');
    expect(dialog.getByLabelText('Categoria')).toHaveValue(CATEGORY_IDS.mercado);
    expect(dialog.getByLabelText('Conta ou cartão')).toHaveValue(banco.id);
    await user.clear(dialog.getByLabelText('Descrição'));
    await user.type(dialog.getByLabelText('Descrição'), 'Feira da semana');
    await user.click(dialog.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText(/Pronto! Registrei a despesa de/, undefined, REPLY)).toBeInTheDocument();
    expect(screen.getByText(/Feira da semana \(🛒 Mercado\)/)).toBeInTheDocument();
    const txs = await db.transactions.toArray();
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ amount: 5000, description: 'Feira da semana', accountId: banco.id });
    await waitFor(() => expect(card.getByText('Registrado')).toBeInTheDocument());
  });

  it('clicar em uma sugestão envia a mensagem', async () => {
    await seedAccount('Banco');
    const user = await renderPage();
    await waitGreeting();

    const chips = within(await screen.findByRole('group', { name: 'Sugestões de perguntas' }));
    const first = chips.getAllByRole('button')[0];
    const question = first.textContent ?? '';
    expect(question).not.toBe('');
    await user.click(first);

    const log = within(screen.getByRole('log'));
    expect(await log.findByText(question, { selector: 'div' })).toBeInTheDocument();
    await waitFor(async () => expect(await db.chat.count()).toBe(3), REPLY);
    const msgs = await chatMessages();
    expect(msgs[1]).toMatchObject({ role: 'user', text: question });
    expect(msgs[2].role).toBe('agent');
  });

  it('exemplos do painel "Pergunte ao Pat" enviam a pergunta', async () => {
    await seedAccount('Banco');
    const user = await renderPage();
    await waitGreeting();
    const panel = within(screen.getByRole('complementary', { name: 'Painel do Pat' }));
    expect(panel.getByText('Pergunte ao Pat')).toBeInTheDocument();
    expect(panel.getByRole('region', { name: 'Registrar' })).toBeInTheDocument();
    expect(panel.getByRole('region', { name: 'Planejar' })).toBeInTheDocument();

    await user.click(panel.getByRole('button', { name: '“Qual meu saldo?”' }));
    await waitFor(async () => expect(await db.chat.count()).toBe(3), REPLY);
    const msgs = await chatMessages();
    expect(msgs[1]).toMatchObject({ role: 'user', text: 'Qual meu saldo?' });
    expect(readAgentPayload(msgs[2].payload)?.reply.intent).toBe('consultar_saldo');
  });

  it('Shift+Enter quebra a linha sem enviar; Enter envia', async () => {
    const user = await renderPage();
    await waitGreeting();
    await user.type(messageField(), 'linha 1{Shift>}{Enter}{/Shift}linha 2');
    expect(messageField()).toHaveValue('linha 1\nlinha 2');
    expect(await db.chat.count()).toBe(1);
    // Botão de envio só habilita com texto.
    expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeEnabled();

    await user.type(messageField(), '{Enter}');
    await waitFor(async () => expect(await db.chat.count()).toBe(3), REPLY);
    expect((await chatMessages())[1].text).toBe('linha 1\nlinha 2');
    expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeDisabled();
  });

  it('não interpreta HTML: "<b>x</b>" aparece literal (usuário e agente)', async () => {
    await addChatMessage('agent', 'Veja: <b>x</b> e **negrito** de R$ 10,00', null);
    const user = await renderPage();
    const log = screen.getByRole('log');
    expect(await within(log).findByText(/Veja: <b>x<\/b> e/)).toBeInTheDocument();
    expect(within(log).getByText('negrito').tagName).toBe('STRONG');
    expect(log.querySelector('b')).toBeNull();

    await sendMessage(user, '<b>x</b>');
    expect(await within(log).findByText('<b>x</b>')).toBeInTheDocument();
    expect(log.querySelector('b')).toBeNull();
    await waitFor(async () => expect(await db.chat.count()).toBe(3), REPLY);
  });

  it('limpar conversa pede confirmação, apaga o histórico e recomeça com a saudação', async () => {
    await addChatMessage('user', 'mensagem antiga');
    const user = await renderPage();
    expect(await screen.findByText('mensagem antiga')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Limpar conversa' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Limpar conversa?' }));
    await user.click(dialog.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('mensagem antiga')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Limpar conversa' }));
    const confirm = within(await screen.findByRole('dialog', { name: 'Limpar conversa?' }));
    await user.click(confirm.getByRole('button', { name: 'Limpar conversa' }));

    await waitFor(() => expect(screen.queryByText('mensagem antiga')).not.toBeInTheDocument());
    await waitGreeting();
    const msgs = await chatMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe('agent');
  });

  it('confirma orçamento proposto pelo Pat', async () => {
    await seedAccount('Banco');
    const user = await renderPage();
    await waitGreeting();
    await sendMessage(user, 'orçamento de 800 para mercado');
    const button = await screen.findByRole('button', { name: 'Definir orçamento' }, REPLY);
    expect(await db.budgets.count()).toBe(0);

    await user.click(button);

    expect(await screen.findByText(/Pronto! Defini o orçamento/, undefined, REPLY)).toBeInTheDocument();
    const budgets = await db.budgets.toArray();
    expect(budgets).toHaveLength(1);
    expect(budgets[0]).toMatchObject({ categoryId: CATEGORY_IDS.mercado, amount: 80000 });
    expect(screen.getByText('Orçamento de Mercado definido')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Definir orçamento' })).not.toBeInTheDocument();
  });

  it('dispensa um insight até o fim do mês', async () => {
    const user = await renderPage();
    await waitGreeting();
    const panel = within(screen.getByRole('complementary', { name: 'Painel do Pat' }));
    const dismiss = panel.getAllByRole('button', { name: /^Dispensar: / })[0];
    const title = (dismiss.getAttribute('aria-label') ?? '').replace('Dispensar: ', '');

    await user.click(dismiss);

    await waitFor(async () => {
      const settings = await db.settings.get('settings');
      expect(Object.values(settings?.dismissedInsights ?? {})).toEqual(['2026-10']);
    });
    await waitFor(() => expect(panel.queryByRole('button', { name: `Dispensar: ${title}` })).not.toBeInTheDocument());
  });

  it('ação de navegação leva para a página indicada', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/assistente" element={<AssistantPage />} />
        <Route path="/contas" element={<p>Página de contas</p>} />
      </Routes>,
      { route: '/assistente' },
    );
    await waitGreeting();
    await user.click(screen.getByRole('button', { name: 'Cadastrar conta' }));
    expect(await screen.findByText('Página de contas')).toBeInTheDocument();
  });

  it('payload antigo/malformado não quebra a tela nem oferece navegação externa', async () => {
    await addChatMessage('agent', 'Mensagem de um backup antigo', {
      reply: { text: 'x', actions: [{ type: 'navigate', label: 'Site externo', to: 'https://exemplo.com' }], cards: [{ type: 'stat' }] },
      done: 'nada',
    });
    await renderPage();
    expect(await screen.findByText('Mensagem de um backup antigo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Site externo' })).not.toBeInTheDocument();
  });
});
