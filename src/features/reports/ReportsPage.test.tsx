import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { monthlyReport } from '@/agent';
import { addAccount, addTransaction, loadFinanceData, type NewTransactionInput } from '@/db/repo';
import { CATEGORY_IDS } from '@/domain/defaults';
import { renderWithProviders, resetDb } from '@/test/render';
import ReportsPage from './ReportsPage';

const TODAY = '2026-10-15';

async function seed() {
  const acc = await addAccount({
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
  });
  const add = (p: Partial<NewTransactionInput> & Pick<NewTransactionInput, 'amount' | 'date' | 'description'>) =>
    addTransaction({ type: 'despesa', categoryId: CATEGORY_IDS.mercado, accountId: acc.id, status: 'pago', ...p });
  await add({ type: 'receita', amount: 500000, date: '2026-10-05', description: 'Salário', categoryId: CATEGORY_IDS.salario });
  await add({ amount: 120000, date: '2026-10-10', description: 'Supermercado' });
  await add({ amount: 30000, date: '2026-10-20', description: 'Cinema; pipoca', categoryId: CATEGORY_IDS.lazer, status: 'pendente' });
  await add({ type: 'receita', amount: 400000, date: '2026-09-05', description: 'Salário', categoryId: CATEGORY_IDS.salario });
  await add({ amount: 80000, date: '2026-09-12', description: 'Supermercado' });
  await add({ amount: 50000, date: '2026-08-12', description: 'Supermercado' });
  // Fora do período padrão (6 meses: mai–out), dentro de 12 meses.
  await add({ amount: 10000, date: '2026-03-10', description: 'Compra antiga' });
}

async function renderPage(route = '/relatorios') {
  const user = userEvent.setup();
  renderWithProviders(<ReportsPage />, { route });
  await screen.findByRole('heading', { level: 1, name: 'Relatórios' });
  return user;
}

/** Linha de tabela cujo cabeçalho (1ª célula) é `header`. */
function rowOf(table: HTMLElement, header: string) {
  const row = within(table)
    .getAllByRole('row')
    .find((r) => within(r).queryByRole('rowheader')?.textContent?.trim() === header);
  if (!row) throw new Error(`Linha ${header} não encontrada`);
  return row;
}

function cellTexts(row: HTMLElement) {
  return within(row)
    .getAllByRole('cell')
    .map((c) => c.textContent?.trim());
}

describe('ReportsPage', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
    await resetDb();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('abre no fechamento do mês com o relatório narrativo do agente e navega entre meses', async () => {
    await seed();
    const expected = monthlyReport(await loadFinanceData(), '2026-10', TODAY);
    const user = await renderPage();

    expect(screen.getByRole('tab', { name: 'Fechamento do mês' })).toHaveAttribute('aria-selected', 'true');
    const panel = within(screen.getByRole('tabpanel', { name: 'Fechamento do mês' }));
    expect(await panel.findByRole('heading', { name: 'Fechamento de outubro de 2026' })).toBeInTheDocument();
    for (const paragraph of expected.paragraphs) {
      expect(panel.getByText((_, el) => el?.tagName === 'P' && el.textContent === paragraph)).toBeInTheDocument();
    }
    // Valores dentro do texto ficam marcados para o modo "ocultar valores".
    expect(panel.getAllByText('R$ 5.000,00').some((el) => el.classList.contains('money'))).toBe(true);

    expect(panel.getByRole('button', { name: 'Próximo mês' })).toBeDisabled();
    await user.click(panel.getByRole('button', { name: 'Mês anterior' }));
    expect(await panel.findByRole('heading', { name: 'Fechamento de setembro de 2026' })).toBeInTheDocument();
  });

  it('fluxo de caixa: tabela mês a mês com taxa de poupança e saldo acumulado; período altera as linhas', async () => {
    await seed();
    const user = await renderPage();
    await user.click(screen.getByRole('tab', { name: 'Fluxo de caixa' }));
    expect(screen.getByRole('tab', { name: 'Fluxo de caixa' })).toHaveAttribute('aria-selected', 'true');

    const table = await screen.findByRole('table', { name: 'Fluxo de caixa mensal' });
    expect(within(table).getAllByRole('rowheader').map((h) => h.textContent)).toEqual([
      'mai/26',
      'jun/26',
      'jul/26',
      'ago/26',
      'set/26',
      'out/26',
      'Total',
    ]);
    expect(cellTexts(rowOf(table, 'ago/26'))).toEqual(['R$ 0,00', 'R$ 500,00', '-R$ 500,00', '—', '-R$ 500,00']);
    expect(cellTexts(rowOf(table, 'set/26'))).toEqual(['R$ 4.000,00', 'R$ 800,00', '+R$ 3.200,00', '80%', 'R$ 2.700,00']);
    // Outubro: receitas 5.000; despesas 1.200 pagas + 300 pendentes.
    expect(cellTexts(rowOf(table, 'out/26'))).toEqual([
      'R$ 5.000,00',
      'R$ 1.500,00',
      '+R$ 3.500,00',
      '70%',
      'R$ 6.200,00',
    ]);
    expect(cellTexts(rowOf(table, 'Total'))).toEqual([
      'R$ 9.000,00',
      'R$ 2.800,00',
      '+R$ 6.200,00',
      '68,9%',
      'R$ 6.200,00',
    ]);

    await user.click(screen.getByRole('tab', { name: '3 meses' }));
    const short = await screen.findByRole('table', { name: 'Fluxo de caixa mensal' });
    await waitFor(() =>
      expect(within(short).getAllByRole('rowheader').map((h) => h.textContent)).toEqual([
        'ago/26',
        'set/26',
        'out/26',
        'Total',
      ]),
    );
    expect(screen.getByText('De agosto de 2026 a outubro de 2026')).toBeInTheDocument();
  });

  it('categorias: tabela categorias x meses com total e média, tendência da categoria escolhida', async () => {
    await seed();
    const user = await renderPage('/relatorios?aba=categorias');
    expect(screen.getByRole('tab', { name: 'Categorias' })).toHaveAttribute('aria-selected', 'true');

    const table = await screen.findByRole('table', { name: /Despesas por categoria de maio de 2026 a outubro de 2026/ });
    // Mercado: 500 (ago) + 800 (set) + 1.200 (out) = 2.500; média em 6 meses = 416,67.
    expect(cellTexts(rowOf(table, '🛒 Mercado'))).toEqual([
      '—',
      '—',
      '—',
      'R$ 500,00',
      'R$ 800,00',
      'R$ 1.200,00',
      'R$ 2.500,00',
      'R$ 416,67',
    ]);
    expect(cellTexts(rowOf(table, '🎉 Lazer')).slice(-3)).toEqual(['R$ 300,00', 'R$ 300,00', 'R$ 50,00']);
    expect(cellTexts(rowOf(table, 'Total')).slice(-2)).toEqual(['R$ 2.800,00', 'R$ 466,67']);

    const trend = within(screen.getByRole('region', { name: 'Tendência mensal' }));
    const select = trend.getByLabelText('Categoria');
    expect(select).toHaveValue(CATEGORY_IDS.mercado);
    expect(trend.getByText('Total no período').nextElementSibling).toHaveTextContent('R$ 2.500,00');
    expect(trend.getByText('Maior mês').nextElementSibling).toHaveTextContent('out/26 · R$ 1.200,00');

    await user.selectOptions(select, CATEGORY_IDS.lazer);
    expect(trend.getByText('Total no período').nextElementSibling).toHaveTextContent('R$ 300,00');

    await user.click(screen.getByRole('tab', { name: 'Receitas' }));
    const income = await screen.findByRole('table', { name: /Receitas por categoria/ });
    expect(cellTexts(rowOf(income, '💼 Salário')).slice(-2)).toEqual(['R$ 9.000,00', 'R$ 1.500,00']);
  });

  it('50/30/20: real x ideal por grupo com status e explicação', async () => {
    await seed();
    const user = await renderPage();
    await user.click(screen.getByRole('tab', { name: '50/30/20' }));
    const needs = within(await screen.findByRole('listitem', { name: 'Necessidades (50%)' }));
    expect(needs.getByText('Dentro do ideal')).toBeInTheDocument();
    expect(needs.getByText(/24% da renda/)).toBeInTheDocument();
    const goals = within(screen.getByRole('listitem', { name: 'Objetivos financeiros (20%)' }));
    expect(goals.getByText('Abaixo do ideal')).toBeInTheDocument();
    expect(goals.getByText(/Faltaram/)).toHaveTextContent('Faltaram R$ 1.000,00 para chegar aos 20%.');
    expect(screen.getByRole('heading', { name: 'Como funciona a regra 50/30/20' })).toBeInTheDocument();
  });

  it('comparativo: variação por categoria com setas e totais', async () => {
    await seed();
    const user = await renderPage();
    await user.click(screen.getByRole('tab', { name: 'Comparativo' }));
    const table = await screen.findByRole('table', { name: /Comparativo de despesas por categoria/ });
    const headers = within(table).getAllByRole('rowheader').map((h) => h.textContent?.trim());
    expect(headers).toEqual(['🛒 Mercado', '🎉 Lazer', 'Total']);

    const market = rowOf(table, '🛒 Mercado');
    expect(cellTexts(market).slice(0, 2)).toEqual(['R$ 800,00', 'R$ 1.200,00']);
    const change = within(market).getAllByRole('cell')[2];
    expect(change).toHaveTextContent('↑Aumento deR$ 400,00(50%)');
    expect(within(change).getByText('↑').parentElement).toHaveClass('text-rose-600');
    expect(within(rowOf(table, '🎉 Lazer')).getAllByRole('cell')[2]).toHaveTextContent('(novo)');
  });

  it('exporta os lançamentos do período em CSV (separador ;, vírgula decimal, BOM)', async () => {
    await seed();
    const blobs: Blob[] = [];
    const names: string[] = [];
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((b: Blob) => {
        blobs.push(b);
        return 'blob:patrimonius-test';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    const user = await renderPage();

    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(await screen.findByText('CSV exportado com 6 lançamentos.')).toBeInTheDocument();
    expect(names).toEqual(['patrimonius-lancamentos-2026-05-a-2026-10.csv']);
    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toBe('text/csv;charset=utf-8');
    const bytes = new Uint8Array(await blobs[0].arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder().decode(bytes.slice(3)).split('\r\n');
    expect(lines[0]).toBe('Data;Descrição;Tipo;Categoria;Conta;Conta de destino;Valor;Status;Parcela;Tags;Observações');
    expect(lines).toContain('10/10/2026;Supermercado;Despesa;Mercado;Nubank;;-1200,00;Pago;;;');
    expect(lines).toContain('05/10/2026;Salário;Receita;Salário;Nubank;;5000,00;Pago;;;');
    // Campo com separador vai entre aspas.
    expect(lines).toContain('20/10/2026;"Cinema; pipoca";Despesa;Lazer;Nubank;;-300,00;Pendente;;;');
    expect(lines.some((l) => l.includes('Compra antiga'))).toBe(false);
    expect(lines.filter(Boolean)).toHaveLength(7);

    await user.click(screen.getByRole('tab', { name: '12 meses' }));
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(await screen.findByText('CSV exportado com 7 lançamentos.')).toBeInTheDocument();
    expect(names[1]).toBe('patrimonius-lancamentos-2025-11-a-2026-10.csv');
  });

  it('não gera arquivo quando o período não tem lançamentos', async () => {
    const create = vi.fn(() => 'blob:x');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(await screen.findByText('Não há lançamentos no período selecionado.')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });
});
