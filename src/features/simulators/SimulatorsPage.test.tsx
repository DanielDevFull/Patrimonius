import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addAccount, addDebt } from '@/db/repo';
import { formatBRL } from '@/domain/money';
import { renderWithProviders, resetDb } from '@/test/render';
import { compoundSimulation } from './simulator-utils';
import SimulatorsPage from './SimulatorsPage';

function seedBank(initialBalance: number) {
  return addAccount({
    name: 'Banco',
    type: 'corrente',
    initialBalance,
    color: '#0f766e',
    icon: '🏦',
    archived: false,
    includeInNetWorth: true,
    creditLimit: null,
    closingDay: null,
    dueDay: null,
  });
}

async function renderPage(route = '/simuladores') {
  const user = userEvent.setup();
  renderWithProviders(<SimulatorsPage />, { route });
  await screen.findByRole('heading', { name: 'Simuladores', level: 1 });
  return user;
}

const panel = async (name: string) => within(await screen.findByRole('tabpanel', { name }));

describe('SimulatorsPage', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
    await resetDb();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aba e painel ligados (aria-controls/aria-labelledby), inclusive por link direto', async () => {
    await renderPage('/simuladores?aba=quitar');
    const tab = screen.getByRole('tab', { name: 'Quitar ou investir?' });
    const tabpanel = await screen.findByRole('tabpanel', { name: 'Quitar ou investir?' });
    expect(tab).toHaveAttribute('aria-controls', tabpanel.id);
    expect(tabpanel).toHaveAttribute('aria-labelledby', tab.id);
  });

  it('juros compostos: calcula o valor final, o investido e os juros em tempo real', async () => {
    const user = await renderPage();
    const p = await panel('Juros compostos');
    expect(screen.getByRole('tab', { name: 'Juros compostos' })).toHaveAttribute('aria-selected', 'true');

    // Padrão: R$ 1.000 + R$ 500/mês a 10% a.a. por 10 anos.
    const expected = compoundSimulation(100000, 50000, 10, 10);
    let result = within(p.getByRole('region', { name: 'Resultado' }));
    expect(result.getByText(formatBRL(expected.final))).toBeInTheDocument();
    expect(result.getByText('R$ 61.000,00')).toBeInTheDocument(); // 1.000 + 120 × 500
    expect(result.getByText(formatBRL(expected.interest))).toBeInTheDocument();
    expect(p.getByText('≈ 0,7974% ao mês')).toBeInTheDocument();

    // Sem juros por 1 ano: 1.000 + 12 × 500 = 7.000.
    await user.clear(p.getByLabelText('Rendimento ao ano (%)'));
    await user.type(p.getByLabelText('Rendimento ao ano (%)'), '0');
    await user.clear(p.getByLabelText('Prazo (anos)'));
    await user.type(p.getByLabelText('Prazo (anos)'), '1');
    result = within(p.getByRole('region', { name: 'Resultado' }));
    expect(result.getAllByText('R$ 7.000,00')).toHaveLength(2); // valor final = total investido
    expect(result.getByText('R$ 0,00')).toBeInTheDocument();

    // Aporte maior: 2.000/mês a 12,6825% a.a. (1% a.m.) por 1 ano, sem valor inicial.
    await user.clear(p.getByLabelText('Valor inicial'));
    await user.clear(p.getByLabelText('Aporte mensal'));
    await user.type(p.getByLabelText('Aporte mensal'), '2.000');
    await user.clear(p.getByLabelText('Rendimento ao ano (%)'));
    await user.type(p.getByLabelText('Rendimento ao ano (%)'), '12,6825');
    const yearly = compoundSimulation(0, 200000, 12.6825, 1);
    result = within(p.getByRole('region', { name: 'Resultado' }));
    expect(result.getByText(formatBRL(yearly.final))).toBeInTheDocument();
    expect(yearly.final).toBeGreaterThan(2400000);
    expect(yearly.final).toBeLessThan(2540000);

    // Prazo inválido.
    await user.clear(p.getByLabelText('Prazo (anos)'));
    await user.type(p.getByLabelText('Prazo (anos)'), '0');
    expect(p.getByText('Use de 1 a 100 anos.')).toBeInTheDocument();
    expect(p.queryByRole('region', { name: 'Resultado' })).not.toBeInTheDocument();
  });

  it('quanto tempo até…: meses até o objetivo e sugestão de aporte maior', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('tab', { name: 'Quanto tempo até…' }));
    const p = await panel('Quanto tempo até…');
    expect(p.getByText('Informe o valor do objetivo para calcular.')).toBeInTheDocument();

    await user.type(p.getByLabelText('Objetivo'), '12.000');
    expect(p.getByRole('alert')).toHaveTextContent('não chega lá em 100 anos');

    await user.type(p.getByLabelText('Aporte mensal'), '1.000');
    await user.clear(p.getByLabelText('Rendimento ao ano (%)'));
    await user.type(p.getByLabelText('Rendimento ao ano (%)'), '0');
    expect(p.getByText('1 ano')).toBeInTheDocument();
    expect(p.getByText(/Previsão: Outubro de 2027/)).toBeInTheDocument();
    // Com R$ 100 a mais: 1.100/mês => 11 meses (12.100 >= 12.000).
    expect(p.getByText(/a mais por mês, você chegaria em 11 meses \(1 mês antes\)/)).toBeInTheDocument();

    await user.type(p.getByLabelText('Já tenho'), '12.000');
    expect(p.getByText('🎉 Você já tem o valor do objetivo!')).toBeInTheDocument();
  });

  it('posso comprar?: veredito com base no saldo previsto do mês', async () => {
    await seedBank(500000);
    const user = await renderPage('/simuladores?aba=comprar');
    const p = await panel('Posso comprar?');
    expect(screen.getByRole('tab', { name: 'Posso comprar?' })).toHaveAttribute('aria-selected', 'true');

    await user.type(p.getByLabelText('Valor da compra'), '100');
    let verdict = within(p.getByRole('region', { name: 'Veredito' }));
    expect(verdict.getByText('Pode comprar')).toBeInTheDocument();
    expect(verdict.getByText(/Seu saldo previsto para o fim do mês é/)).toHaveTextContent(
      'Seu saldo previsto para o fim do mês é R$ 5.000,00; depois da compra, ficaria em R$ 4.900,00.',
    );
    // Valores dentro das razões respeitam o modo "ocultar valores".
    expect(verdict.getAllByText('R$ 5.000,00')[0]).toHaveClass('money');

    await user.clear(p.getByLabelText('Valor da compra'));
    await user.type(p.getByLabelText('Valor da compra'), '6.000');
    verdict = within(p.getByRole('region', { name: 'Veredito' }));
    expect(verdict.getByText('Melhor não agora')).toBeInTheDocument();
    expect(verdict.getByText(/ficaria negativo em/)).toHaveTextContent('ficaria negativo em R$ 1.000,00');

    // Parcelado em 3x: 1ª parcela de R$ 2.000 cabe no saldo, mas consome mais da metade da folga.
    await user.clear(p.getByLabelText('Parcelas'));
    await user.type(p.getByLabelText('Parcelas'), '3');
    verdict = within(p.getByRole('region', { name: 'Veredito' }));
    expect(verdict.getByText('Pode comprar')).toBeInTheDocument();
    expect(p.getByText('1ª parcela (de 3)')).toBeInTheDocument();
  });

  it('reserva de emergência: meta pelo custo informado e quando completa', async () => {
    await seedBank(300000);
    const user = await renderPage('/simuladores?aba=reserva');
    const p = await panel('Reserva de emergência');
    expect(p.getByText(/Ainda não há gastos essenciais suficientes/)).toBeInTheDocument();
    expect(p.getByLabelText('Meta (meses de custo)')).toHaveValue(6);

    await user.type(p.getByLabelText('Custo essencial por mês'), '1.000');
    const status = within(p.getByRole('region', { name: 'Situação da reserva' }));
    expect(status.getByText('Parcial')).toBeInTheDocument(); // 3 meses cobertos: parcial (baixa é < 3)
    expect(status.getByText(/Cobre 3 meses/)).toBeInTheDocument();
    expect(status.getByText('R$ 6.000,00')).toBeInTheDocument();

    // Faltam 3.000: sugestão de R$ 250/mês completa em 12 meses.
    await user.click(p.getByRole('button', { name: /Completar em 12 meses/ }));
    expect(p.getByLabelText('Quanto posso guardar por mês')).toHaveValue('250,00');
    expect(p.getByText('1 ano')).toBeInTheDocument();
    expect(p.getByText(/Previsão: Outubro de 2027/)).toBeInTheDocument();

    // Meta menor (3 meses) => já completa.
    await user.clear(p.getByLabelText('Meta (meses de custo)'));
    await user.type(p.getByLabelText('Meta (meses de custo)'), '3');
    expect(p.getByText(/Sua reserva de emergência está completa/)).toBeInTheDocument();
  });

  it('quitar ou investir?: usa a taxa de uma dívida e explica o "investimento garantido"', async () => {
    await addDebt({
      name: 'Cheque especial',
      creditor: 'Banco',
      type: 'cheque_especial',
      originalAmount: 100000,
      balance: 100000,
      balanceDate: '2026-10-01',
      interestRate: 8,
      minimumPayment: 0,
      dueDay: null,
      remainingInstallments: null,
      status: 'ativa',
      notes: '',
    });
    const user = await renderPage('/simuladores?aba=quitar');
    const p = await panel('Quitar ou investir?');

    await user.selectOptions(
      p.getByLabelText('Usar uma dívida cadastrada'),
      p.getByRole('option', { name: /Cheque especial/ }),
    );
    expect(p.getByLabelText('Juros da dívida (% ao mês)')).toHaveValue('8');
    expect(p.getByText(/Quitar a dívida é o melhor “investimento”/)).toBeInTheDocument();
    expect(p.getByText(/garantido/)).toBeInTheDocument();
    const comparison = within(p.getByRole('region', { name: 'Comparação' }));
    expect(comparison.getByText('151,82% a.a.')).toBeInTheDocument(); // 1,08^12 - 1
    expect(comparison.getByText('8,5% a.a. líquido')).toBeInTheDocument(); // 10% - 15% de IR

    await user.clear(p.getByLabelText('Juros da dívida (% ao mês)'));
    await user.type(p.getByLabelText('Juros da dívida (% ao mês)'), '0,5');
    expect(p.getByLabelText('Usar uma dívida cadastrada')).toHaveValue('');
    expect(p.getByText(/Investir rende mais/)).toBeInTheDocument();
  });
});
