import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { updateSettings } from '@/db/repo';
import { renderWithProviders, resetDb } from '@/test/render';
import { draftToAccount, validDrafts } from './drafts';
import OnboardingWizard from './OnboardingWizard';

async function freshInstall() {
  await resetDb();
  await updateSettings({ onboardingDone: false, userName: '' });
}

async function settings() {
  return (await db.settings.get('settings'))!;
}

describe('drafts', () => {
  it('cartão de crédito vira saldo negativo (fatura) e demais mantêm o sinal', () => {
    expect(draftToAccount({ key: 'a', name: ' Cartão ', type: 'cartao_credito', balance: 80000 }, 0)).toMatchObject({
      name: 'Cartão',
      initialBalance: -80000,
      icon: '💳',
      creditLimit: null,
      archived: false,
      includeInNetWorth: true,
    });
    expect(draftToAccount({ key: 'b', name: 'Banco', type: 'corrente', balance: -5000 }, 1).initialBalance).toBe(-5000);
    expect(draftToAccount({ key: 'c', name: 'Carteira', type: 'carteira', balance: null }, 2).initialBalance).toBe(0);
  });

  it('ignora rascunhos sem nome', () => {
    expect(
      validDrafts([
        { key: 'a', name: '  ', type: 'corrente', balance: null },
        { key: 'b', name: 'Banco', type: 'corrente', balance: null },
      ]).map((d) => d.key),
    ).toEqual(['b']);
  });
});

describe('OnboardingWizard', () => {
  beforeEach(freshInstall);

  it('percorre os 5 passos, cria as contas e salva as preferências', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingWizard />);

    expect(await screen.findByRole('heading', { name: 'Boas-vindas ao Patrimonius' })).toBeInTheDocument();
    expect(screen.getByText(/funciona 100% offline/)).toBeInTheDocument();
    expect(screen.getByText('Passo 1 de 5 · Boas-vindas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Vamos começar/ }));

    // Passo 2: nome e renda
    expect(screen.getByText('Passo 2 de 5 · Você')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Seu nome'), 'Ana');
    await user.type(screen.getByLabelText('Renda mensal estimada (líquida)'), '5.000');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    // Passo 3: contas por sugestão de 1 clique
    await user.click(screen.getByRole('button', { name: 'Adicionar Conta corrente' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar Cartão de crédito' }));
    expect(screen.getByRole('button', { name: 'Conta corrente já adicionada' })).toBeDisabled();
    await user.type(screen.getByLabelText('Saldo atual'), '1.234,56');
    await user.type(screen.getByLabelText('Fatura atual em aberto'), '800');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    // Passo 4: objetivos
    expect(screen.getByLabelText('Reserva de emergência')).toHaveValue(6);
    await user.click(screen.getByRole('button', { name: '12 meses' }));
    await user.click(screen.getByRole('button', { name: '30%' }));
    expect(screen.getByText(/guardar 30% significa/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    // Passo 5: resumo
    expect(screen.getByRole('heading', { name: 'Tudo pronto, Ana!' })).toBeInTheDocument();
    expect(screen.getByText('Conta corrente, Cartão de crédito')).toBeInTheDocument();
    expect(screen.getByText('12 meses')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Começar a usar/ }));

    await waitFor(async () => expect((await settings()).onboardingDone).toBe(true));
    const s = await settings();
    expect(s).toMatchObject({
      userName: 'Ana',
      monthlyIncomeEstimate: 500000,
      emergencyFundTargetMonths: 12,
      savingsRateTarget: 30,
    });
    const accounts = await db.accounts.toArray();
    expect(accounts.map((a) => [a.name, a.type, a.initialBalance]).sort()).toEqual([
      ['Cartão de crédito', 'cartao_credito', -80000],
      ['Conta corrente', 'corrente', 123456],
    ]);
  });

  it('não avança sem contas e exige nome nas contas adicionadas', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingWizard />);
    await user.click(await screen.findByRole('button', { name: /Vamos começar/ }));
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Adicione pelo menos uma conta');
    expect(screen.getByText('Passo 3 de 5 · Suas contas')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Adicionar uma conta' }));
    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(screen.getByText('Dê um nome à conta.')).toBeInTheDocument();
    expect(screen.getByText('Passo 3 de 5 · Suas contas')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nome da conta'), 'Nubank');
    await user.selectOptions(screen.getByLabelText('Tipo'), 'poupanca');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(screen.getByText('Passo 4 de 5 · Objetivos')).toBeInTheDocument();
  });

  it('remove uma conta e mantém os dados ao voltar', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingWizard />);
    await user.click(await screen.findByRole('button', { name: /Vamos começar/ }));
    await user.type(screen.getByLabelText('Seu nome'), 'Caio');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    await user.click(screen.getByRole('button', { name: 'Adicionar Carteira' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar Poupança' }));
    await user.click(screen.getByRole('button', { name: 'Remover Carteira' }));
    expect(screen.getAllByLabelText('Nome da conta').map((el) => (el as HTMLInputElement).value)).toEqual(['Poupança']);

    await user.click(screen.getByRole('button', { name: /Voltar/ }));
    expect(screen.getByLabelText('Seu nome')).toHaveValue('Caio');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(screen.getByLabelText('Nome da conta')).toHaveValue('Poupança');
  });

  it('bloqueia metas inválidas no passo de objetivos', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingWizard />);
    await user.click(await screen.findByRole('button', { name: /Vamos começar/ }));
    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    await user.click(screen.getByRole('button', { name: 'Adicionar Carteira' }));
    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    const months = screen.getByLabelText('Reserva de emergência');
    await user.clear(months);
    await user.type(months, '40');
    expect(screen.getByText('Informe um número inteiro de 1 a 24 meses.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continuar/ })).toBeDisabled();
  });

  it('"Pular" está sempre visível e conclui o primeiro uso salvando o que já foi digitado', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingWizard />);
    await user.click(await screen.findByRole('button', { name: /Vamos começar/ }));
    await user.type(screen.getByLabelText('Seu nome'), 'Bia');
    expect(screen.getByRole('button', { name: 'Pular' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Pular' }));
    await waitFor(async () => expect((await settings()).onboardingDone).toBe(true));
    expect((await settings()).userName).toBe('Bia');
    expect(await db.accounts.count()).toBe(0);
  });

  it('"Explorar com dados de exemplo" carrega a demonstração preservando o nome', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingWizard />);
    await user.click(await screen.findByRole('button', { name: /Vamos começar/ }));
    await user.type(screen.getByLabelText('Seu nome'), 'Duda');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    await user.click(screen.getByRole('button', { name: 'Adicionar Conta corrente' }));
    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    const done = screen.getByRole('heading', { name: 'Tudo pronto, Duda!' }).closest('div')!;
    await user.click(within(done).getByRole('button', { name: /Explorar com dados de exemplo/ }));

    await waitFor(async () => expect((await settings()).onboardingDone).toBe(true), { timeout: 4000 });
    expect((await settings()).userName).toBe('Duda');
    const accounts = await db.accounts.toArray();
    expect(accounts).toHaveLength(5);
    expect(accounts.map((a) => a.name)).toContain('Banco Digital');
    expect(await db.transactions.count()).toBeGreaterThan(150);
  });
});
