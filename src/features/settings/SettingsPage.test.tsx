import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportBackup } from '@/db/backup';
import { db } from '@/db/db';
import { addAccount, addTransaction, setBudget } from '@/db/repo';
import { CATEGORY_IDS } from '@/domain/defaults';
import { renderWithProviders, resetDb } from '@/test/render';
import SettingsPage from './SettingsPage';

async function settings() {
  return (await db.settings.get('settings'))!;
}

async function renderPage() {
  const user = userEvent.setup();
  renderWithProviders(<SettingsPage />, { route: '/configuracoes' });
  await screen.findByRole('heading', { name: 'Configurações' });
  return user;
}

async function seedAccount() {
  return addAccount({
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
}

function dialog() {
  return within(screen.getByRole('dialog'));
}

describe('SettingsPage', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('mostra todas as seções', async () => {
    await renderPage();
    for (const title of ['Perfil', 'Preferências financeiras', 'Aparência', 'Categorias', 'Dados e privacidade', 'Sobre']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText('Versão 0.1.0')).toBeInTheDocument();
    expect(screen.getByText('100% offline: seus dados nunca saem deste dispositivo.')).toBeInTheDocument();
  });

  it('salva o perfil (nome e agente) com aviso de sucesso', async () => {
    const user = await renderPage();
    const save = screen.getByRole('button', { name: 'Salvar perfil' });
    expect(save).toBeDisabled();
    const name = screen.getByLabelText('Seu nome');
    await user.clear(name);
    await user.type(name, '  Marina ');
    const agent = screen.getByLabelText('Nome do agente');
    await user.clear(agent);
    await user.click(save);
    expect(screen.getByText('Dê um nome ao seu agente financeiro.')).toBeInTheDocument();
    await user.type(agent, 'Lia');
    await user.click(save);
    expect(await screen.findByText('Perfil salvo.')).toBeInTheDocument();
    expect(await settings()).toMatchObject({ userName: 'Marina', agentName: 'Lia' });
  });

  it('valida e salva as preferências financeiras', async () => {
    const user = await renderPage();
    const months = screen.getByLabelText('Meta da reserva de emergência');
    await user.clear(months);
    await user.type(months, '30');
    expect(screen.getByText('Informe um número inteiro de 1 a 24 meses.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar preferências' })).toBeDisabled();
    await user.clear(months);
    await user.type(months, '9');
    const rate = screen.getByLabelText('Meta de poupança');
    await user.clear(rate);
    await user.type(rate, '25');
    await user.type(screen.getByLabelText('Renda mensal estimada (líquida)'), '6.000');
    expect(screen.getByText(/Guardar 25% de/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar preferências' }));
    expect(await screen.findByText('Preferências financeiras salvas.')).toBeInTheDocument();
    expect(await settings()).toMatchObject({
      emergencyFundTargetMonths: 9,
      savingsRateTarget: 25,
      monthlyIncomeEstimate: 600000,
    });
  });

  it('aplica tema e modo ocultar valores na hora', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('radio', { name: 'Escuro' }));
    await waitFor(async () => expect((await settings()).theme).toBe('dark'));
    await user.click(screen.getByRole('switch'));
    await waitFor(async () => expect((await settings()).hideValues).toBe(true));
  });

  describe('categorias', () => {
    it('lista despesas por grupo 50/30/20 e receitas na outra aba', async () => {
      const user = await renderPage();
      const necessities = screen.getByRole('region', { name: 'Necessidades · 50%' });
      expect(within(necessities).getByText('Mercado')).toBeInTheDocument();
      expect(within(screen.getByRole('region', { name: 'Desejos · 30%' })).getByText('Lazer')).toBeInTheDocument();
      expect(screen.queryByText('Salário')).not.toBeInTheDocument();
      await user.click(screen.getByRole('radio', { name: 'Receitas' }));
      expect(screen.getByText('Salário')).toBeInTheDocument();
      expect(screen.queryByText('Mercado')).not.toBeInTheDocument();
    });

    it('mostra a prévia das palavras-chave padrão com acento', async () => {
      await renderPage();
      expect(screen.getByText(/aluguel, condomínio, iptu, reforma…/)).toBeInTheDocument();
      expect(screen.getByText(/farmácia, remédio, médico, consulta…/)).toBeInTheDocument();
      expect(screen.queryByText(/condominio|farmacia/)).not.toBeInTheDocument();
    });

    it('cria categoria com palavras-chave em minúsculas (com acento, sem duplicatas) e impede nome duplicado', async () => {
      const user = await renderPage();
      await user.click(screen.getByRole('button', { name: /Nova/ }));
      const modal = dialog();
      await user.type(modal.getByLabelText('Nome'), 'mercado');
      await user.click(modal.getByRole('button', { name: 'Salvar' }));
      expect(modal.getByText('Já existe uma categoria com esse nome.')).toBeInTheDocument();

      await user.clear(modal.getByLabelText('Nome'));
      await user.type(modal.getByLabelText('Nome'), 'Café da manhã');
      await user.click(modal.getByRole('button', { name: 'Usar ☕' }));
      await user.selectOptions(modal.getByLabelText('Grupo (regra 50/30/20)'), 'necessidades');
      await user.type(modal.getByLabelText('Palavras-chave'), 'Padaria, CAFÉ, padaria, cafe');
      expect(modal.getByLabelText('Palavras-chave que serão salvas')).toHaveTextContent('padariacafé');
      await user.click(modal.getByRole('button', { name: 'Salvar' }));

      expect(await screen.findByText('Categoria criada.')).toBeInTheDocument();
      const created = (await db.categories.toArray()).find((c) => c.name === 'Café da manhã');
      expect(created).toMatchObject({ kind: 'despesa', icon: '☕', group: 'necessidades', keywords: ['padaria', 'café'], archived: false });
    });

    it('edita categoria existente sem permitir trocar o tipo', async () => {
      const user = await renderPage();
      await user.click(screen.getByRole('button', { name: 'Editar Lazer' }));
      const modal = dialog();
      expect(modal.getByText('O tipo não pode ser alterado depois de criada.')).toBeInTheDocument();
      const name = modal.getByLabelText('Nome');
      await user.clear(name);
      await user.type(name, 'Lazer e cultura');
      await user.click(modal.getByRole('button', { name: 'Salvar' }));
      expect(await screen.findByText('Categoria atualizada.')).toBeInTheDocument();
      expect((await db.categories.get(CATEGORY_IDS.lazer))?.name).toBe('Lazer e cultura');
    });

    it('arquiva e reativa', async () => {
      const user = await renderPage();
      await user.click(screen.getByRole('button', { name: 'Arquivar Pets' }));
      await waitFor(async () => expect((await db.categories.get(CATEGORY_IDS.pets))?.archived).toBe(true));
      const toggle = await screen.findByRole('button', { name: 'Arquivadas (1)' });
      await user.click(toggle);
      await user.click(screen.getByRole('button', { name: 'Reativar Pets' }));
      await waitFor(async () => expect((await db.categories.get(CATEGORY_IDS.pets))?.archived).toBe(false));
    });

    it('exclui movendo os lançamentos para a categoria escolhida e remove orçamentos', async () => {
      const acc = await seedAccount();
      await addTransaction({ type: 'despesa', amount: 5000, date: '2026-09-10', description: 'Cinema', categoryId: CATEGORY_IDS.lazer, accountId: acc.id });
      await setBudget(CATEGORY_IDS.lazer, 30000, null);
      const user = await renderPage();
      expect(screen.getByRole('button', { name: 'Outras despesas é usada pelo app e não pode ser excluída' })).toBeDisabled();

      await user.click(screen.getByRole('button', { name: 'Excluir Lazer' }));
      const modal = dialog();
      expect(modal.getByText(/1 lançamento será movido/)).toBeInTheDocument();
      expect(modal.getByText('O orçamento desta categoria será excluído.')).toBeInTheDocument();
      expect(modal.getByLabelText('Mover para')).toHaveValue(CATEGORY_IDS.outrosDespesa);
      await user.selectOptions(modal.getByLabelText('Mover para'), CATEGORY_IDS.compras);
      await user.click(modal.getByRole('button', { name: 'Excluir categoria' }));

      await waitFor(async () => expect(await db.categories.get(CATEGORY_IDS.lazer)).toBeUndefined());
      const [tx] = await db.transactions.toArray();
      expect(tx.categoryId).toBe(CATEGORY_IDS.compras);
      expect(await db.budgets.count()).toBe(0);
    });
  });

  describe('dados e privacidade', () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    let downloads: string[];

    beforeEach(() => {
      downloads = [];
      URL.createObjectURL = vi.fn(() => 'blob:local');
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      });
    });

    afterEach(() => {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      vi.restoreAllMocks();
    });

    it('exporta backup JSON e CSV (avisando quando não há lançamentos)', async () => {
      const user = await renderPage();
      await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
      expect(await screen.findByText('Ainda não há lançamentos para exportar.')).toBeInTheDocument();
      expect(downloads).toEqual([]);

      await user.click(screen.getByRole('button', { name: 'Exportar backup' }));
      await waitFor(() => expect(downloads).toHaveLength(1));
      expect(downloads[0]).toMatch(/^patrimonius-backup-\d{4}-\d{2}-\d{2}\.json$/);

      const acc = await seedAccount();
      await addTransaction({ type: 'despesa', amount: 990, date: '2026-09-10', description: 'Pão', categoryId: CATEGORY_IDS.mercado, accountId: acc.id });
      await screen.findByText(/Neste dispositivo: 1 conta · 1 lançamento ·/);
      await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
      expect(downloads[1]).toMatch(/^patrimonius-lancamentos-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(await screen.findByText('Planilha com 1 lançamento salva.')).toBeInTheDocument();
    });

    it('rejeita arquivo inválido e importa um backup válido mesclando', async () => {
      const acc = await seedAccount();
      const backup = await exportBackup();
      backup.data.accounts = [{ ...acc, id: 'acc-backup', name: 'Conta do backup' }];
      backup.data.categories = [];
      backup.data.settings = [];
      const user = await renderPage();
      const input = screen.getByLabelText('Arquivo de backup');

      await user.upload(input, new File(['{"app":"outro"}'], 'x.json', { type: 'application/json' }));
      expect(await screen.findByText('Este arquivo não é um backup do Patrimonius.')).toBeInTheDocument();

      await user.upload(input, new File([JSON.stringify(backup)], 'meu-backup.json', { type: 'application/json' }));
      const modal = within(await screen.findByRole('dialog'));
      expect(modal.getByText('meu-backup.json')).toBeInTheDocument();
      await user.click(modal.getByRole('radio', { name: /Mesclar/ }));
      await user.click(modal.getByRole('button', { name: 'Mesclar dados' }));

      expect(await screen.findByText(/Backup importado: 1 registros\./)).toBeInTheDocument();
      const names = (await db.accounts.toArray()).map((a) => a.name).sort();
      expect(names).toEqual(['Banco', 'Conta do backup']);
    });

    it('importar substituindo apaga o que não está no backup', async () => {
      const backup = await exportBackup();
      await seedAccount();
      const user = await renderPage();
      await user.upload(
        screen.getByLabelText('Arquivo de backup'),
        new File([JSON.stringify(backup)], 'b.json', { type: 'application/json' }),
      );
      const modal = within(await screen.findByRole('dialog'));
      expect(modal.getByText(/Os dados atuais deste dispositivo serão apagados/)).toBeInTheDocument();
      await user.click(modal.getByRole('button', { name: 'Substituir meus dados' }));
      await waitFor(async () => expect(await db.accounts.count()).toBe(0));
    });

    it('carrega dados de exemplo após confirmação', async () => {
      const user = await renderPage();
      await user.click(screen.getByRole('button', { name: 'Carregar exemplo' }));
      const modal = dialog();
      expect(modal.getByText(/TODOS os dados atuais serão apagados/)).toBeInTheDocument();
      await user.click(modal.getByRole('button', { name: 'Substituir tudo' }));
      expect(await screen.findByText('Dados de exemplo carregados. Explore à vontade!', {}, { timeout: 4000 })).toBeInTheDocument();
      expect(await db.accounts.count()).toBe(5);
      expect((await settings()).userName).toBe('Teste');
    });

    it('apagar tudo exige digitar APAGAR', async () => {
      await seedAccount();
      const user = await renderPage();
      await user.click(screen.getByRole('button', { name: 'Apagar tudo' }));
      const modal = dialog();
      const confirmButton = modal.getByRole('button', { name: 'Apagar tudo' });
      expect(confirmButton).toBeDisabled();
      await user.type(modal.getByLabelText('Digite APAGAR para confirmar'), 'apagar');
      expect(confirmButton).toBeDisabled();
      await user.clear(modal.getByLabelText('Digite APAGAR para confirmar'));
      await user.type(modal.getByLabelText('Digite APAGAR para confirmar'), 'APAGAR');
      expect(confirmButton).toBeEnabled();
      await user.click(confirmButton);
      expect(await screen.findByText('Todos os dados foram apagados.')).toBeInTheDocument();
      expect(await db.accounts.count()).toBe(0);
      const s = await settings();
      expect(s.onboardingDone).toBe(false);
      expect(s.userName).toBe('');
    });
  });
});
