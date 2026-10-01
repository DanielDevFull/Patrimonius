import { describe, expect, it } from 'vitest';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { FinanceData } from '@/domain/types';
import { makeAccount, makeBudget, makeContribution, makeData, makeGoal } from '@/test/factories';
import { monthlyReport } from './report';
import { TODAY, baseTransactions, deepFreeze, makeScenario, tx } from './responder/test-fixtures';
import type { AgentCard } from './types';

function cardsOf<T extends AgentCard['type']>(cards: AgentCard[], type: T): Extract<AgentCard, { type: T }>[] {
  return cards.filter((c): c is Extract<AgentCard, { type: T }> => c.type === type);
}

function reportFor(month: string, overrides: Partial<FinanceData> = {}) {
  return monthlyReport(makeScenario(overrides), month, TODAY);
}

describe('monthlyReport — mês fechado', () => {
  const report = reportFor('2026-09');
  const text = report.paragraphs.join('\n');

  it('título e mês', () => {
    expect(report.title).toBe('Fechamento de setembro de 2026');
    expect(report.month).toBe('2026-09');
  });

  it('receitas, despesas, sobra e taxa de poupança vs meta', () => {
    expect(report.paragraphs[0]).toBe(
      'Em setembro de 2026 entraram R$ 6.000,00 e saíram R$ 3.305,90. Sobraram R$ 2.694,10. Sua taxa de poupança foi de 53,2% (contando R$ 500,00 investidos), acima da meta de 20%. 👏',
    );
  });

  it('maiores categorias, maior lançamento e regra 50/30/20', () => {
    expect(text).toContain('Os maiores gastos foram 🏠 Moradia (R$ 1.500,00, 45,4%), 🛒 Mercado (R$ 900,00, 27,2%) e 📈 Investimentos e reserva (R$ 500,00, 15,1%).');
    expect(text).toContain('O maior lançamento foi “Aluguel”, de R$ 1.500,00 em 10/09/2026.');
    expect(text).toContain('Pela regra 50/30/20, as necessidades levaram 40% da renda, os desejos 6,8% e os objetivos (poupança e dívidas) 8,3%.');
  });

  it('variação contra o mês anterior (meses iguais)', () => {
    expect(text).toContain('As despesas ficaram praticamente iguais às de agosto de 2026.');
  });

  it('orçamentos e metas do mês', () => {
    expect(text).toContain('O orçamento de Mercado ficou dentro do limite. 👏');
    expect(text).toContain('Você guardou R$ 1.000,00 nas suas metas neste mês.');
    expect(text).toContain('✈️ Viagem está em 20%.');
  });

  it('termina com uma recomendação para o próximo mês', () => {
    const last = report.paragraphs[report.paragraphs.length - 1];
    expect(last.startsWith('Para outubro de 2026: ')).toBe(true);
    // poupança acima da meta e sem estouros => sugere reduzir o maior desejo ou direcionar a sobra
    expect(last).toMatch(/continue assim|tente reduzir/);
  });

  it('cards: estatísticas, categorias, pizza, barras de 6 meses e orçamentos', () => {
    const stats = cardsOf(report.cards, 'stat');
    expect(stats.map((c) => [c.title, c.value])).toEqual([
      ['Receitas', 'R$ 6.000,00'],
      ['Despesas', 'R$ 3.305,90'],
      ['Sobra do mês', '+R$ 2.694,10'],
    ]);
    expect(stats[1].hint).toBe('+0% vs ago/26');
    expect(stats[2].tone).toBe('positive');
    const [pie, bars] = cardsOf(report.cards, 'chart');
    expect(pie.chart).toBe('pie');
    expect(pie.data.reduce((s, d) => s + d.value, 0)).toBe(330590);
    expect(bars.chart).toBe('bar');
    expect(bars.data.map((d) => d.label)).toEqual(['abr/26', 'mai/26', 'jun/26', 'jul/26', 'ago/26', 'set/26']);
    expect(bars.data.map((d) => d.value)).toEqual([0, 0, 0, 330590, 330590, 330590]);
    expect(cardsOf(report.cards, 'progress')[0].items[0]).toMatchObject({ current: 90000, target: 100000, tone: 'warning' });
  });
});

describe('monthlyReport — situações', () => {
  it('mês corrente é um fechamento parcial', () => {
    const report = reportFor('2026-10');
    expect(report.paragraphs[0]).toBe('Outubro de 2026 ainda não terminou: este é um fechamento parcial, até 15/10/2026.');
    expect(report.paragraphs.join(' ')).toContain('lembrando que o mês ainda está em andamento');
    expect(report.paragraphs.join(' ')).toContain('Até agora, o orçamento');
  });

  it('primeiro mês com registros', () => {
    const report = reportFor('2026-07');
    expect(report.paragraphs).toContain('Este é o primeiro mês com registros — no próximo fechamento eu comparo a evolução.');
  });

  it('mês no vermelho: alerta e recomendação para voltar ao azul', () => {
    const report = reportFor('2026-09', {
      transactions: [
        ...baseTransactions(),
        tx({ amount: 800000, date: '2026-09-21', description: 'Viagem de férias', categoryId: CATEGORY_IDS.lazer }),
      ],
    });
    const text = report.paragraphs.join('\n');
    expect(text).toContain('Você gastou R$ 5.305,90 a mais do que ganhou.');
    expect(text).toContain('Comparado a agosto de 2026, as despesas subiram 242% (+R$ 8.000,00).');
    expect(text).toContain('Maiores altas: 🎉 Lazer (+R$ 8.000,00).');
    expect(report.paragraphs[report.paragraphs.length - 1]).toContain('o foco é voltar ao azul');
    expect(cardsOf(report.cards, 'stat')[2]).toMatchObject({ title: 'Resultado do mês', value: '-R$ 5.305,90', tone: 'negative' });
  });

  it('investir mais do que a sobra não é "mês no vermelho" (aporte é poupança)', () => {
    // Setembro: renda 5.000, moradia 3.000 e aporte de 2.500 em Investimentos e reserva.
    const report = monthlyReport(
      makeData({
        accounts: [makeAccount({ id: 'cc', initialBalance: 1000000 })],
        transactions: [
          tx({ accountId: 'cc', type: 'receita', amount: 500000, date: '2026-09-05', categoryId: CATEGORY_IDS.salario }),
          tx({ accountId: 'cc', amount: 300000, date: '2026-09-06', categoryId: CATEGORY_IDS.moradia }),
          tx({ accountId: 'cc', amount: 250000, date: '2026-09-07', categoryId: CATEGORY_IDS.investimentos }),
        ],
      }),
      '2026-09',
      TODAY,
    );
    const text = report.paragraphs.join('\n');
    expect(text).toContain('Sua taxa de poupança foi de 40%');
    expect(text).toContain(
      'Seus aportes em investimentos (R$ 2.500,00) passaram a sobra do mês em R$ 500,00 — a diferença saiu do saldo que você já tinha.',
    );
    expect(text).not.toContain('a mais do que ganhou');
    // Antes: "Para outubro de 2026: o foco é voltar ao azul", junto com a poupança acima da meta.
    expect(report.paragraphs[report.paragraphs.length - 1]).not.toContain('voltar ao azul');
  });

  it('orçamento estourado aparece e vira a recomendação', () => {
    const report = reportFor('2026-09', {
      budgets: [
        makeBudget({ categoryId: CATEGORY_IDS.mercado, amount: 100000 }),
        makeBudget({ categoryId: CATEGORY_IDS.restaurantes, amount: 15000 }),
      ],
    });
    const text = report.paragraphs.join('\n');
    expect(text).toContain('Dos 2 orçamentos, 1 ficou dentro do limite. 🍽️ Restaurantes e delivery (+R$ 50,00) estourou o limite.');
    expect(report.paragraphs[report.paragraphs.length - 1]).toBe(
      'Para outubro de 2026: ajuste o orçamento de Restaurantes e delivery para um valor realista ou corte gastos nessa categoria.',
    );
  });

  it('poupança abaixo da meta: recomenda o valor a separar', () => {
    const report = reportFor('2026-09', {
      transactions: [
        ...baseTransactions(),
        tx({ amount: 250000, date: '2026-09-21', description: 'Notebook', categoryId: CATEGORY_IDS.compras }),
      ],
    });
    // sobra 194,10 + investido 500 = 694,10 de 6.000 (11,6%) => faltam 505,90 para 20%
    expect(report.paragraphs[0]).toContain('abaixo da meta de 20%.');
    expect(report.paragraphs[report.paragraphs.length - 1]).toBe(
      'Para outubro de 2026: separe R$ 505,90 a mais logo que o salário cair para chegar à meta de 20% de poupança.',
    );
  });

  it('sem orçamentos, sugere o primeiro (nunca para investimentos)', () => {
    const report = reportFor('2026-09', { budgets: [] });
    expect(report.paragraphs.join('\n')).toContain('Você ainda não usa orçamentos. Um bom começo: 🏠 Moradia com limite de R$ 1.500,00 por mês');
    expect(cardsOf(report.cards, 'progress')).toEqual([]);
  });

  it('meta concluída no mês é comemorada', () => {
    const report = reportFor('2026-10', {
      goals: [makeGoal({ id: 'g', name: 'Celular', icon: '📱', targetAmount: 100000, targetDate: null })],
      goalContributions: [makeContribution({ goalId: 'g', amount: 100000, date: '2026-10-02' })],
    });
    expect(report.paragraphs.join('\n')).toContain('Meta concluída: 📱 Celular! 🎉');
  });

  it('mês sem receitas explica que não dá para calcular a taxa de poupança', () => {
    const data = makeData({
      accounts: [makeAccount({ id: 'c', initialBalance: 100000 })],
      transactions: [tx({ accountId: 'c', amount: 5000, date: '2026-09-10', categoryId: CATEGORY_IDS.mercado })],
    });
    const report = monthlyReport(data, '2026-09', TODAY);
    expect(report.paragraphs[0]).toContain('Não houve receitas registradas no mês');
    expect(cardsOf(report.cards, 'stat')[2].hint).toBeUndefined();
  });

  it('mês sem dados orienta o usuário e não tem cards', () => {
    const report = reportFor('2026-03');
    expect(report.title).toBe('Fechamento de março de 2026');
    expect(report.paragraphs[0]).toContain('Não há lançamentos em março de 2026.');
    expect(report.cards).toEqual([]);
  });

  it('mês futuro ainda não começou', () => {
    const report = reportFor('2026-12');
    expect(report.paragraphs).toEqual([
      'Dezembro de 2026 ainda não começou. Quando o mês chegar, registre suas receitas e despesas e eu escrevo o fechamento.',
    ]);
  });

  it('é determinístico e não altera a entrada', () => {
    const data = deepFreeze(makeScenario());
    expect(monthlyReport(data, '2026-09', TODAY)).toEqual(monthlyReport(data, '2026-09', TODAY));
  });
});

describe('monthlyReport — regressões', () => {
  it('mês futuro com parcelas agendadas não vira "fechamento" com sobra e recomendação', () => {
    const data = makeScenario({
      transactions: [
        ...baseTransactions(),
        tx({ amount: 35990, date: '2026-11-12', status: 'pendente', description: 'TV (6/10)', categoryId: CATEGORY_IDS.compras }),
      ],
    });
    const report = monthlyReport(data, '2026-11', TODAY);
    expect(report.paragraphs[0]).toBe(
      'Novembro de 2026 ainda não começou. Quando o mês chegar, registre suas receitas e despesas e eu escrevo o fechamento.',
    );
    expect(report.paragraphs.join(' ')).toContain('Já estão agendados para novembro de 2026 R$ 359,90 em despesas');
    expect(report.paragraphs.join(' ')).not.toContain('voltar ao azul');
    expect(report.cards).toEqual([]);
  });

  it('fechamento parcial: "entraram" só conta o que já entrou; o resto é previsto', () => {
    const data = makeScenario({
      transactions: [
        ...baseTransactions(),
        tx({ type: 'receita', amount: 100000, date: '2026-10-25', status: 'pendente', description: 'Freela', categoryId: CATEGORY_IDS.rendaExtra }),
      ],
    });
    const text = monthlyReport(data, '2026-10', TODAY).paragraphs.join('\n');
    expect(text).toContain('Até agora, em outubro de 2026, entraram R$ 6.000,00 e saíram R$ 2.455,90');
    expect(text).toContain('A taxa de poupança prevista para o mês é');
    expect(text).not.toContain('Sua taxa de poupança foi');
  });
});

describe('monthlyReport — sem meta de poupança (0% nas Configurações)', () => {
  const noGoal = { ...makeScenario().settings, savingsRateTarget: 0 };

  it('informa a taxa sem comparar com uma meta de 20% e não recomenda "chegar à meta"', () => {
    const report = reportFor('2026-09', {
      settings: noGoal,
      transactions: [
        ...baseTransactions(),
        tx({ amount: 250000, date: '2026-09-21', description: 'Notebook', categoryId: CATEGORY_IDS.compras }),
      ],
    });
    const text = report.paragraphs.join('\n');
    expect(report.paragraphs[0]).toContain('Sua taxa de poupança foi de 11,6% (contando R$ 500,00 investidos).');
    expect(text).not.toMatch(/meta de 20%/);
    expect(report.paragraphs[report.paragraphs.length - 1]).not.toContain('separe R$ 505,90');
  });
});
