import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateInsights } from '@/agent';
import { financialHealth } from '@/analytics';
import { db } from '@/db/db';
import { loadDemoData } from '@/db/demo';
import { addAccount, addGoal, addTransaction, loadFinanceData, setBudget, type NewTransactionInput } from '@/db/repo';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { Account } from '@/domain/types';
import { describeElements, gridsWithoutBaseColumns } from '@/test/layout';
import { renderWithProviders, resetDb } from '@/test/render';
import DashboardPage from './DashboardPage';

const TODAY = '2026-10-15';

function seedAccount(p: Partial<Account> = {}) {
  return addAccount({
    name: 'Nubank',
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

function tx(accountId: string, p: Partial<NewTransactionInput> & Pick<NewTransactionInput, 'amount' | 'date'>) {
  return addTransaction({
    type: 'despesa',
    description: 'Lançamento',
    categoryId: CATEGORY_IDS.mercado,
    accountId,
    status: 'pago',
    ...p,
  });
}

/** Conta com R$ 1.000 + salário de out (R$ 5.000), mercado (R$ 1.200), luz pendente (R$ 300) e o mês de setembro. */
async function seedMonth() {
  const acc = await seedAccount();
  await tx(acc.id, { type: 'receita', amount: 500000, date: '2026-10-05', description: 'Salário', categoryId: CATEGORY_IDS.salario });
  await tx(acc.id, { amount: 120000, date: '2026-10-10', description: 'Supermercado' });
  await tx(acc.id, {
    amount: 30000,
    date: '2026-10-18',
    description: 'Conta de luz',
    categoryId: CATEGORY_IDS.contas,
    status: 'pendente',
  });
  await tx(acc.id, { type: 'receita', amount: 400000, date: '2026-09-05', description: 'Salário', categoryId: CATEGORY_IDS.salario });
  await tx(acc.id, { amount: 80000, date: '2026-09-12', description: 'Supermercado' });
  return acc;
}

function stat(label: string) {
  const el = screen.getByText(label).parentElement;
  if (!el) throw new Error(`StatCard ${label} não encontrado`);
  return within(el);
}

async function renderPage() {
  const user = userEvent.setup();
  renderWithProviders(<DashboardPage />);
  await screen.findByRole('heading', { level: 1 });
  return user;
}

describe('DashboardPage', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 10, 0, 0));
    await resetDb();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('primeiro uso: mostra a saudação e o checklist de primeiros passos com links', async () => {
    await renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Bom dia, Teste!' })).toBeInTheDocument();
    const steps = within(await screen.findByRole('region', { name: 'Primeiros passos' }));
    expect(steps.getByText('0 de 5 concluídos · tudo fica salvo só neste dispositivo')).toBeInTheDocument();
    expect(steps.getByRole('link', { name: 'Cadastrar contas' })).toHaveAttribute('href', '/contas');
    expect(steps.getByRole('link', { name: 'Novo lançamento' })).toHaveAttribute('href', '/lancamentos?novo=despesa');
    expect(steps.getByRole('link', { name: 'Criar orçamento' })).toHaveAttribute('href', '/orcamentos');
    expect(steps.getByRole('link', { name: 'Criar meta' })).toHaveAttribute('href', '/metas');
    expect(steps.getByRole('link', { name: 'Falar com o Pat' })).toHaveAttribute('href', '/assistente');
    expect(steps.getByRole('link', { name: 'Abrir Configurações' })).toHaveAttribute('href', '/configuracoes');
    // As orientações de cadastro já estão no checklist: no lugar dos insights, o card de apresentação do agente.
    const agent = within(screen.getByRole('region', { name: 'Conheça o Pat' }));
    expect(agent.getByRole('link', { name: 'Conversar com o Pat' })).toHaveAttribute('href', '/assistente');
    expect(screen.queryByRole('region', { name: 'O Pat recomenda' })).not.toBeInTheDocument();
    // Sem contas ainda: não há saldo para mostrar.
    expect(screen.queryByText('Saldo atual')).not.toBeInTheDocument();
    // Os painéis de análise só aparecem depois do primeiro lançamento.
    expect(screen.queryByText('Receitas do mês')).not.toBeInTheDocument();
  });

  it('primeiro uso: cadastrar uma conta marca o passo como concluído e mostra o saldo', async () => {
    await renderPage();
    await screen.findByRole('region', { name: 'Primeiros passos' });
    await seedAccount({ initialBalance: 123456 });
    const steps = within(screen.getByRole('region', { name: 'Primeiros passos' }));
    expect(await steps.findByText('1 de 5 concluídos · tudo fica salvo só neste dispositivo')).toBeInTheDocument();
    expect(steps.getByText('(concluído)')).toBeInTheDocument();
    expect(steps.queryByRole('link', { name: 'Cadastrar contas' })).not.toBeInTheDocument();
    expect(stat('Saldo atual').getByText('R$ 1.234,56')).toBeInTheDocument();
  });

  it('saldo atual não soma contas fora do patrimônio (dinheiro de terceiros)', async () => {
    await seedMonth();
    await seedAccount({ name: 'Conta da empresa', initialBalance: 1000000, includeInNetWorth: false });
    await renderPage();
    expect(await screen.findByText('Receitas do mês')).toBeInTheDocument();
    // Antes: R$ 18.000,00 (somava os R$ 10.000,00 da empresa); Contas → "Total em contas" já mostrava R$ 8.000,00.
    expect(stat('Saldo atual').getByText('R$ 8.000,00')).toBeInTheDocument();
    // O rótulo conta só as contas somadas e avisa que a conta de terceiros ficou de fora (antes: "2 contas · até hoje").
    expect(stat('Saldo atual').getByText('1 conta · até hoje · 1 fora do patrimônio não entra')).toBeInTheDocument();
  });

  it('layout no celular: todo grid tem coluna base minmax(0,1fr), sem coluna implícita "auto" que alarga a página', async () => {
    // Primeiro uso (checklist + saldo).
    await seedAccount();
    const { unmount } = renderWithProviders(<DashboardPage />);
    await screen.findByRole('region', { name: 'Primeiros passos' });
    expect(describeElements(gridsWithoutBaseColumns(document.body))).toEqual([]);
    unmount();

    // Com dados de exemplo (cards com títulos truncados, valores sem quebra de linha).
    await loadDemoData(TODAY);
    await renderPage();
    await screen.findByRole('region', { name: 'Próximos compromissos' });
    await screen.findByRole('region', { name: 'Últimos lançamentos' });
    expect(describeElements(gridsWithoutBaseColumns(document.body))).toEqual([]);
  });

  it('primeiros passos no celular: o botão desce para a linha de baixo em vez de espremer o texto', async () => {
    await renderPage();
    const steps = within(await screen.findByRole('region', { name: 'Primeiros passos' }));
    // Com "min-w-0 flex-1" (base 0) o texto encolhia até ~80 px e quebrava palavra por palavra: a coluna de texto
    // precisa de uma base própria (12rem) para que o flex-wrap leve o botão para a linha seguinte.
    for (const label of ['Cadastre suas contas', 'Registre o primeiro lançamento']) {
      const column = steps.getByText(label).parentElement;
      expect(column).toHaveClass('basis-48', 'grow');
      expect(column).not.toHaveClass('flex-1');
    }
    const demoTip = steps.getByText(/Quer ver como fica antes de digitar seus dados\?/);
    expect(demoTip).toHaveClass('basis-48', 'grow');
    expect(demoTip).not.toHaveClass('flex-1');
  });

  it('recomendações: "Ver todas" mostra no próprio card as que passam das 5 iniciais', async () => {
    await loadDemoData(TODAY);
    const insights = generateInsights(await loadFinanceData(), TODAY);
    expect(insights.length).toBeGreaterThan(5);
    const user = await renderPage();

    const panel = within(await screen.findByRole('region', { name: 'O Pat recomenda' }));
    expect(panel.getAllByRole('listitem')).toHaveLength(5);
    expect(panel.getByText(`Mostrando 5 de ${insights.length} recomendações.`)).toBeInTheDocument();
    const toggle = panel.getByRole('button', { name: `Ver todas (${insights.length})` });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    // Antes não havia como ver as demais: o Assistente mostra no máximo 6.
    expect(panel.getAllByRole('listitem')).toHaveLength(insights.length);
    expect(panel.getByRole('listitem', { name: insights[insights.length - 1].title })).toBeInTheDocument();
    expect(panel.queryByText(/Mostrando 5 de/)).not.toBeInTheDocument();
    const collapse = panel.getByRole('button', { name: 'Mostrar menos' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');

    await user.click(collapse);
    expect(panel.getAllByRole('listitem')).toHaveLength(5);
  });

  it('com dados: KPIs do mês corretos e o seletor de mês muda o resumo, mas não o saldo atual', async () => {
    await seedMonth();
    const user = await renderPage();

    expect(await screen.findByText('Receitas do mês')).toBeInTheDocument();
    // Saldo até hoje: 1.000 + 5.000 − 1.200 + 4.000 − 800 (a conta de luz pendente não entra).
    expect(stat('Saldo atual').getByText('R$ 8.000,00')).toBeInTheDocument();
    expect(stat('Saldo atual').getByText('1 conta · até hoje')).toBeInTheDocument();
    expect(stat('Receitas do mês').getByText('R$ 5.000,00')).toBeInTheDocument();
    expect(stat('Receitas do mês').getByText('Tudo recebido')).toBeInTheDocument();
    // Despesas por competência: pagas + pendentes.
    expect(stat('Despesas do mês').getByText('R$ 1.500,00')).toBeInTheDocument();
    expect(stat('Despesas do mês').getByText('R$ 300,00')).toBeInTheDocument();
    expect(stat('Despesas do mês').getByText(/a pagar/)).toBeInTheDocument();
    expect(stat('Sobra do mês').getByText('R$ 3.500,00')).toBeInTheDocument();
    expect(stat('Sobra do mês').getByText('Taxa de poupança: 70%')).toBeInTheDocument();

    const categories = within(screen.getByRole('region', { name: 'Gastos por categoria' }));
    const legend = within(categories.getByRole('list', { name: 'Legenda dos gastos por categoria' }));
    expect(legend.getByText('Mercado')).toBeInTheDocument();
    expect(legend.getByText('R$ 1.200,00')).toBeInTheDocument();
    expect(legend.getByText('80%')).toBeInTheDocument();
    expect(legend.getByText('Contas da casa')).toBeInTheDocument();
    expect(legend.getByText('20%')).toBeInTheDocument();

    const recent = within(screen.getByRole('list', { name: 'Últimos lançamentos' }));
    // A conta de luz é futura (dia 18): não está entre os últimos lançamentos.
    expect(recent.queryByText('Conta de luz')).not.toBeInTheDocument();
    expect(recent.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Supermercado'),
      expect.stringContaining('Salário'),
      expect.stringContaining('Supermercado'),
      expect.stringContaining('Salário'),
    ]);

    await user.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(await screen.findByText('Resumo de setembro de 2026')).toBeInTheDocument();
    expect(stat('Receitas do mês').getByText('R$ 4.000,00')).toBeInTheDocument();
    expect(stat('Despesas do mês').getByText('R$ 800,00')).toBeInTheDocument();
    expect(stat('Sobra do mês').getByText('R$ 3.200,00')).toBeInTheDocument();
    expect(stat('Sobra do mês').getByText('Taxa de poupança: 80%')).toBeInTheDocument();
    expect(stat('Saldo atual').getByText('R$ 8.000,00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mês atual' }));
    expect(await screen.findByText('Resumo de outubro de 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mês atual' })).not.toBeInTheDocument();
  });

  it('mostra a nota de saúde financeira calculada pelas análises e os 6 componentes', async () => {
    await seedMonth();
    const expected = financialHealth(await loadFinanceData(), TODAY);
    await renderPage();
    const health = within(await screen.findByRole('region', { name: 'Saúde financeira' }));
    expect(health.getByRole('img', { name: new RegExp(`^Nota de saúde financeira: ${expected.score} de 100`) })).toBeInTheDocument();
    expect(health.getAllByRole('progressbar')).toHaveLength(6);
    for (const c of expected.components) {
      expect(health.getByRole('progressbar', { name: `${c.label}: ${Math.round(c.score)} de 100` })).toBeInTheDocument();
    }
  });

  it('dispensar um insight grava o mês corrente e o remove do painel', async () => {
    await seedMonth();
    const insights = generateInsights(await loadFinanceData(), TODAY);
    expect(insights.length).toBeGreaterThan(0);
    const first = insights[0];
    const user = await renderPage();

    const panel = within(await screen.findByRole('region', { name: 'O Pat recomenda' }));
    expect(panel.getAllByRole('listitem').length).toBe(Math.min(5, insights.length));
    expect(panel.getByRole('link', { name: 'Conversar com o Pat' })).toHaveAttribute('href', '/assistente');
    if (first.action) {
      const item = within(panel.getByRole('listitem', { name: first.title }));
      expect(item.getByRole('link', { name: first.action.label })).toHaveAttribute('href', first.action.to);
    }

    await user.click(panel.getAllByRole('button', { name: `Dispensar: ${first.title}` })[0]);
    await waitFor(async () => {
      const settings = await db.settings.get('settings');
      expect(settings?.dismissedInsights[first.id]).toBe('2026-10');
    });
    expect(await screen.findByText('Recomendação dispensada até o fim do mês.')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'O Pat recomenda' })).queryByRole('listitem', { name: first.title }),
      ).not.toBeInTheDocument(),
    );
  });

  it('próximos compromissos: marca a despesa pendente como paga', async () => {
    await seedMonth();
    const user = await renderPage();
    const upcoming = within(await screen.findByRole('region', { name: 'Próximos compromissos' }));
    expect(upcoming.getByText('Conta de luz')).toBeInTheDocument();
    expect(upcoming.getByText('-R$ 300,00')).toBeInTheDocument();

    await user.click(upcoming.getByRole('button', { name: 'Marcar como pago: Conta de luz' }));
    await waitFor(async () => {
      const light = (await db.transactions.toArray()).find((t) => t.description === 'Conta de luz');
      expect(light?.status).toBe('pago');
    });
    expect(await upcoming.findByText('Nada a pagar ou receber nos próximos 7 dias.')).toBeInTheDocument();
  });

  it('previsão: alerta quando o saldo projetado fica negativo no mês', async () => {
    const acc = await seedAccount({ initialBalance: 10000 });
    await tx(acc.id, { amount: 50000, date: '2026-10-20', description: 'Aluguel', categoryId: CATEGORY_IDS.moradia, status: 'pendente' });
    await renderPage();
    const forecast = within(await screen.findByRole('region', { name: 'Previsão do mês' }));
    expect(forecast.getByText('Saldo em caixa projetado até 31/10/2026')).toBeInTheDocument();
    const endBalance = forecast.getByText('Saldo previsto no fim do mês').parentElement as HTMLElement;
    expect(within(endBalance).getByText('-R$ 400,00')).toBeInTheDocument();
    expect(forecast.getByRole('alert')).toHaveTextContent(/saldo pode ficar negativo em 20\/10\/2026, chegando a -R\$ 400,00/);
  });

  it('orçamentos e metas: mostra o orçamento estourado e as metas principais', async () => {
    await seedMonth();
    await setBudget(CATEGORY_IDS.mercado, 100000, null);
    await setBudget(CATEGORY_IDS.contas, 50000, null);
    await addGoal({
      name: 'Reserva de emergência',
      targetAmount: 1000000,
      targetDate: null,
      icon: '🛟',
      color: '#2563eb',
      priority: 'alta',
      status: 'ativa',
      accountId: null,
      notes: '',
    });
    await renderPage();

    const budgets = within(await screen.findByRole('region', { name: 'Orçamentos' }));
    const items = budgets.getAllByRole('listitem');
    // O mais crítico primeiro: mercado (120%) antes de contas (60%).
    expect(items[0]).toHaveTextContent('Mercado');
    expect(within(items[0]).getByText('Estourado')).toBeInTheDocument();
    expect(within(items[0]).getByText('120%')).toBeInTheDocument();
    expect(items[1]).toHaveTextContent('Contas da casa');
    expect(within(items[1]).queryByText('Estourado')).not.toBeInTheDocument();

    const goals = within(screen.getByRole('region', { name: 'Metas' }));
    expect(goals.getByText('Reserva de emergência')).toBeInTheDocument();
    expect(goals.getByText('Sem prazo')).toBeInTheDocument();
  });
});
