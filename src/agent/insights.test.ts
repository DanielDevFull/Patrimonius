import { describe, expect, it } from 'vitest';
import { cashflowForecast } from '@/analytics';
import { ROUTES } from '@/app/navigation';
import { formatDateBR } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { FinanceData } from '@/domain/types';
import {
  makeAccount,
  makeAsset,
  makeBudget,
  makeContribution,
  makeData,
  makeDebt,
  makeGoal,
  makeRecurring,
  makeValuation,
} from '@/test/factories';
import { generateInsights } from './insights';
import { ACC, MONTH, TODAY, baseTransactions, deepFreeze, makeScenario, tx } from './responder/test-fixtures';
import type { Insight } from './types';

const ids = (list: Insight[]) => list.map((i) => i.id);
const find = (list: Insight[], prefix: string) => list.find((i) => i.id.startsWith(prefix));
const ROUTE_VALUES = Object.values(ROUTES) as string[];

function insightsFor(overrides: Partial<FinanceData> = {}, today = TODAY): Insight[] {
  return generateInsights(makeScenario(overrides), today);
}

describe('generateInsights — cenário saudável', () => {
  const list = insightsFor();

  it('não dispara alertas (nada crítico nem de atenção)', () => {
    expect(list.filter((i) => i.severity === 'critico' || i.severity === 'atencao')).toEqual([]);
  });

  it('reconhece conquistas: meta de poupança, reserva completa e patrimônio em alta', () => {
    expect(ids(list)).toEqual(
      expect.arrayContaining([
        `poupanca-meta:${MONTH}`,
        `reserva-completa:${MONTH}`,
        `patrimonio-cresceu:${MONTH}`,
      ]),
    );
    const savings = find(list, 'poupanca-meta')!;
    expect(savings.severity).toBe('positivo');
    // setembro: (sobra 2.694,10 + aporte 500) / 6.000 = 53,2%
    expect(savings.message).toContain('53,2%');
    expect(savings.message).toContain('setembro de 2026');
  });

  it('todos os insights têm id estável do mês, prioridade 0–100 e ação para uma rota do app', () => {
    for (const i of list) {
      expect(i.id.endsWith(`:${MONTH}`)).toBe(true);
      expect(Number.isInteger(i.priority)).toBe(true);
      expect(i.priority).toBeGreaterThanOrEqual(0);
      expect(i.priority).toBeLessThanOrEqual(100);
      expect(i.title.length).toBeGreaterThan(0);
      expect(i.message).not.toMatch(/undefined|NaN|Infinity/);
      if (i.action) expect(ROUTE_VALUES.some((r) => i.action!.to.split('?')[0] === r)).toBe(true);
    }
  });

  it('ordena por prioridade decrescente', () => {
    const priorities = list.map((i) => i.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
  });
});

describe('generateInsights — fluxo de caixa', () => {
  it('saldo negativo em conta é crítico (cartão de crédito negativo não conta)', () => {
    const list = insightsFor({
      accounts: [
        ...makeScenario().accounts,
        makeAccount({ id: 'acc-carteira', name: 'Carteira', type: 'carteira', initialBalance: -5000 }),
      ],
    });
    const neg = find(list, 'saldo-negativo:acc-carteira')!;
    expect(neg).toMatchObject({ severity: 'critico', area: 'fluxo', action: { to: ROUTES.accounts } });
    expect(neg.message).toContain('-R$ 50,00');
    expect(find(list, `saldo-negativo:${ACC.cartao}`)).toBeUndefined();
  });

  it('previsão de fechar o mês negativo é crítica', () => {
    const list = insightsFor({
      transactions: [
        ...baseTransactions(),
        tx({ amount: 5000000, date: '2026-10-25', description: 'Reforma', status: 'pendente', categoryId: CATEGORY_IDS.moradia }),
      ],
    });
    const f = find(list, 'previsao-negativa')!;
    expect(f).toMatchObject({ severity: 'critico', area: 'fluxo' });
    expect(f.message).toContain('outubro de 2026');
  });

  it('saldo que fica negativo no meio do mês (mas fecha positivo) também alerta', () => {
    const data = makeScenario({
      transactions: [
        ...baseTransactions(),
        tx({ amount: 3000000, date: '2026-10-20', description: 'Entrada do carro', status: 'pendente', categoryId: CATEGORY_IDS.transporte }),
        tx({ type: 'receita', amount: 3000000, date: '2026-10-25', description: 'Venda da moto', status: 'pendente', categoryId: CATEGORY_IDS.outrosReceita }),
      ],
    });
    const list = generateInsights(data, TODAY);
    const forecast = cashflowForecast(data, TODAY);
    expect(forecast.projectedEndBalance).toBeGreaterThan(0);
    expect(find(list, 'previsao-negativa')).toBeUndefined();
    const dip = find(list, 'previsao-saldo-negativo')!;
    expect(dip.severity).toBe('critico');
    // o ponto mais baixo fica entre a saída (dia 20) e a entrada (dia 25)
    expect(forecast.lowestPoint.date >= '2026-10-20' && forecast.lowestPoint.date < '2026-10-25').toBe(true);
    expect(dip.message).toContain(formatDateBR(forecast.lowestPoint.date));
    expect(dip.message).toContain(formatBRL(forecast.lowestPoint.balance));
  });

  it('contas vencidas (crítico) e vencendo em até 3 dias (atenção), inclusive recorrências', () => {
    const list = insightsFor({
      transactions: [
        ...baseTransactions(),
        tx({ amount: 20000, date: '2026-10-10', description: 'Conta de luz', status: 'pendente', categoryId: CATEGORY_IDS.contas }),
      ],
      recurring: [
        makeRecurring({ accountId: ACC.corrente, description: 'Internet', amount: 10000, startDate: '2026-07-17', nextDate: '2026-10-17', categoryId: CATEGORY_IDS.contas }),
        makeRecurring({ accountId: ACC.corrente, description: 'Academia', amount: 9000, startDate: '2026-07-25', nextDate: '2026-10-25' }),
      ],
    });
    const overdue = find(list, 'contas-vencidas')!;
    expect(overdue).toMatchObject({ severity: 'critico', id: `contas-vencidas:2026-10-10:${MONTH}` });
    expect(overdue.message).toContain('Conta de luz (10/10/2026)');
    const soon = find(list, 'contas-vencendo')!;
    expect(soon.severity).toBe('atencao');
    expect(soon.message).toContain('Internet (R$ 100,00, em 17/10/2026)');
    // fora da janela de 3 dias
    expect(soon.message).not.toContain('Academia');
  });
});

describe('generateInsights — orçamentos e gastos', () => {
  it('orçamento estourado é crítico; perto do limite é atenção; ritmo acima do limite também', () => {
    const list = insightsFor({
      budgets: [
        makeBudget({ categoryId: CATEGORY_IDS.restaurantes, amount: 5000 }),
        makeBudget({ categoryId: CATEGORY_IDS.mercado, amount: 35000 }),
        makeBudget({ categoryId: CATEGORY_IDS.assinaturas, amount: 10000 }),
      ],
    });
    const over = find(list, `orcamento-estourado:${CATEGORY_IDS.restaurantes}`)!;
    expect(over).toMatchObject({ severity: 'critico', area: 'orcamento', action: { to: ROUTES.budgets } });
    expect(over.message).toContain('R$ 50,00 acima do orçamento de R$ 50,00');
    const near = find(list, `orcamento-alerta:${CATEGORY_IDS.mercado}`)!;
    expect(near.severity).toBe('atencao');
    expect(near.message).toContain('85,7%');
    expect(near.message).toContain('17 dias');
    // Netflix (55,90 de 100,00): 56% usado e não é recorrência cadastrada => projeção 115,52 > 100
    const pace = find(list, `orcamento-alerta:${CATEGORY_IDS.assinaturas}`)!;
    expect(pace.title).toContain('ritmo acima do orçamento');
  });

  it('categoria ≥ 30% acima da média dos 3 meses e diferença > R$ 100', () => {
    const list = insightsFor({
      transactions: [
        ...baseTransactions(),
        tx({ amount: 40000, date: '2026-10-13', description: 'Jantar', categoryId: CATEGORY_IDS.restaurantes }),
        // Lazer: 240 contra média de 150 (+60%), mas a diferença (R$ 90) é pequena demais
        tx({ amount: 24000, date: '2026-10-13', description: 'Show', categoryId: CATEGORY_IDS.lazer }),
      ],
    });
    const above = find(list, `gasto-acima-media:${CATEGORY_IDS.restaurantes}`)!;
    expect(above.severity).toBe('atencao');
    expect(above.message).toContain('R$ 500,00');
    expect(above.message).toContain('150%');
    expect(above.message).toContain('R$ 200,00');
    expect(find(list, `gasto-acima-media:${CATEGORY_IDS.lazer}`)).toBeUndefined();
  });

  it('não considera investimentos/dívidas como "gasto acima do normal"', () => {
    const list = insightsFor({
      transactions: [
        ...baseTransactions(),
        tx({ amount: 500000, date: '2026-10-13', description: 'Aporte extra', categoryId: CATEGORY_IDS.investimentos }),
      ],
    });
    expect(find(list, `gasto-acima-media:${CATEGORY_IDS.investimentos}`)).toBeUndefined();
    expect(list.filter((i) => i.id.startsWith('gasto-incomum'))).toEqual([]);
  });

  it('gasto incomum: > 3x a mediana da categoria e > R$ 200', () => {
    const history = ['2026-07-15', '2026-08-15', '2026-09-15'].map((date) =>
      tx({ amount: 5000, date, description: 'Loja', categoryId: CATEGORY_IDS.compras }),
    );
    const big = tx({ id: 'tx-tv', amount: 30000, date: '2026-10-13', description: 'Fone novo', categoryId: CATEGORY_IDS.compras });
    const smallButOdd = tx({ id: 'tx-meia', amount: 18000, date: '2026-10-11', description: 'Meias', categoryId: CATEGORY_IDS.compras });
    const list = insightsFor({ transactions: [...baseTransactions(), ...history, big, smallButOdd] });
    const odd = find(list, 'gasto-incomum:tx-tv')!;
    expect(odd).toMatchObject({ severity: 'info', area: 'gastos' });
    expect(odd.message).toContain('“Fone novo”');
    expect(odd.message).toContain('6x');
    expect(find(list, 'gasto-incomum:tx-meia')).toBeUndefined();
  });

  it('gastou menos que no mês anterior até a mesma data (positivo), só a partir do dia 5', () => {
    const extra = tx({ amount: 100000, date: '2026-09-09', description: 'Mercado do mês', categoryId: CATEGORY_IDS.mercado });
    const list = insightsFor({ transactions: [...baseTransactions(), extra] });
    const less = find(list, 'gastos-menores')!;
    expect(less.severity).toBe('positivo');
    expect(less.message).toContain('R$ 1.000,00 a menos');
    const early = generateInsights(makeScenario({ transactions: [...baseTransactions(), extra] }), '2026-10-03');
    expect(find(early, 'gastos-menores')).toBeUndefined();
  });
});

describe('generateInsights — poupança, reserva e 50/30/20', () => {
  it('taxa de poupança do mês anterior abaixo da meta (atenção) com o valor que falta', () => {
    const list = insightsFor({
      transactions: [
        ...baseTransactions(),
        tx({ amount: 200000, date: '2026-09-15', description: 'Notebook', categoryId: CATEGORY_IDS.compras }),
      ],
    });
    const low = find(list, 'poupanca-abaixo')!;
    expect(low).toMatchObject({ severity: 'atencao', area: 'economia', title: 'Poupança abaixo da meta' });
    // (2.694,10 - 2.000 + 500) / 6.000 = 19,9% => faltam R$ 5,90 para 20%
    expect(low.message).toContain('19,9%');
    expect(low.message).toContain('R$ 5,90');
    expect(find(list, 'poupanca-meta')).toBeUndefined();
  });

  it('mês anterior no vermelho tem prioridade maior', () => {
    const list = insightsFor({
      transactions: [
        ...baseTransactions(),
        tx({ amount: 450000, date: '2026-09-15', description: 'Viagem', categoryId: CATEGORY_IDS.lazer }),
      ],
    });
    const red = find(list, 'poupanca-abaixo')!;
    expect(red.title).toBe('Mês passado no vermelho');
    expect(red.priority).toBeGreaterThan(64);
  });

  it('reserva crítica e baixa (atenção); completa (positivo)', () => {
    const tiny = (initialBalance: number) =>
      makeData({
        accounts: [makeAccount({ id: 'c', initialBalance })],
        transactions: [
          tx({ accountId: 'c', type: 'receita', amount: 200000, date: '2026-09-05', categoryId: CATEGORY_IDS.salario }),
          tx({ accountId: 'c', amount: 200000, date: '2026-09-10', categoryId: CATEGORY_IDS.moradia }),
        ],
      });
    const critical = find(generateInsights(tiny(100000), TODAY), 'reserva-baixa')!;
    expect(critical).toMatchObject({ severity: 'atencao', title: 'Reserva de emergência crítica' });
    expect(critical.message).toContain('0,5 mês');
    const low = find(generateInsights(tiny(400000), TODAY), 'reserva-baixa')!;
    expect(low.title).toBe('Reserva de emergência baixa');
    expect(critical.priority).toBeGreaterThan(low.priority);
    expect(find(generateInsights(tiny(2000000), TODAY), 'reserva-completa')?.severity).toBe('positivo');
  });

  it('desvio relevante da regra 50/30/20 no mês anterior', () => {
    const list = insightsFor({
      transactions: [
        ...baseTransactions(),
        tx({ amount: 200000, date: '2026-09-21', description: 'Show', categoryId: CATEGORY_IDS.lazer }),
      ],
    });
    const rule = find(list, 'regra-50-30-20')!;
    expect(rule).toMatchObject({ severity: 'info', title: 'Desejos acima de 30% da renda' });
    expect(rule.message).toContain('40,1%');
    expect(find(insightsFor(), 'regra-50-30-20')).toBeUndefined();
  });
});

describe('generateInsights — dívidas, cartão, metas e patrimônio', () => {
  it('dívida com juros altos (≥ 4% a.m. ou cartão/cheque especial) é crítica', () => {
    const list = insightsFor({
      debts: [
        makeDebt({ id: 'd-cartao', name: 'Rotativo do cartão', type: 'cartao', interestRate: 12, balance: 300000, balanceDate: '2026-09-01' }),
        makeDebt({ id: 'd-cheque', name: 'Cheque especial', type: 'cheque_especial', interestRate: 0, balance: 50000 }),
        makeDebt({ id: 'd-barata', name: 'Consignado', type: 'emprestimo', interestRate: 1.5, balance: 900000 }),
      ],
    });
    const card = find(list, 'divida-cara:d-cartao')!;
    expect(card).toMatchObject({ severity: 'critico', area: 'dividas', action: { to: ROUTES.debts } });
    expect(card.message).toContain('12% ao mês');
    expect(card.message).toContain('R$ 360,00 de juros');
    expect(find(list, 'divida-cara:d-cheque')?.message).toContain('cheque especial');
    expect(find(list, 'divida-cara:d-barata')).toBeUndefined();
  });

  it('uso do cartão acima de 30% do limite, contando parcelas futuras', () => {
    const scenario = makeScenario();
    const tight = scenario.accounts.map((a) => (a.id === ACC.cartao ? { ...a, creditLimit: 200000 } : a));
    const usage = find(insightsFor({ accounts: tight }), `cartao-limite:${ACC.cartao}`)!;
    expect(usage.severity).toBe('atencao');
    expect(usage.message).toContain('R$ 923,60 de R$ 2.000,00');
    expect(find(insightsFor(), 'cartao-limite')).toBeUndefined();
    const withInstallments = find(
      insightsFor({
        transactions: [
          ...baseTransactions(),
          ...['2026-10-12', '2026-11-12', '2026-12-12', '2027-01-12', '2027-02-12'].map((date, i) =>
            tx({
              amount: 40000,
              date,
              accountId: ACC.cartao,
              status: 'pendente',
              description: `TV (${i + 1}/5)`,
              categoryId: CATEGORY_IDS.compras,
              installment: { groupId: 'g', number: i + 1, total: 5 },
            }),
          ),
        ],
      }),
      'cartao-limite',
    );
    expect(withInstallments?.message).toContain('R$ 2.923,60');
  });

  it('metas: atrasada e vencida (atenção); concluída e ≥ 90% (positivo)', () => {
    const goals = [
      // Criada em julho e sem aportes desde então (uma meta criada neste mês ainda não está atrasada).
      makeGoal({ id: 'g-atrasada', name: 'Carro', targetAmount: 1200000, targetDate: '2027-03-31', createdAt: '2026-07-01T12:00:00.000Z' }),
      makeGoal({ id: 'g-vencida', name: 'Curso', targetAmount: 300000, targetDate: '2026-09-30' }),
      makeGoal({ id: 'g-feita', name: 'Celular', targetAmount: 100000, targetDate: null }),
      makeGoal({ id: 'g-quase', name: 'Bicicleta', targetAmount: 100000, targetDate: null }),
    ];
    const list = insightsFor({
      goals,
      goalContributions: [
        makeContribution({ goalId: 'g-vencida', amount: 50000, date: '2026-08-01' }),
        makeContribution({ goalId: 'g-feita', amount: 100000, date: '2026-10-05' }),
        makeContribution({ goalId: 'g-quase', amount: 95000, date: '2026-10-05' }),
      ],
    });
    const late = find(list, 'meta-atrasada:g-atrasada')!;
    expect(late.severity).toBe('atencao');
    expect(late.message).toContain('R$ 2.000,00 por mês'); // 12.000 em 6 meses de aporte (out a mar)
    expect(find(list, 'meta-vencida:g-vencida')?.message).toContain('faltam R$ 2.500,00');
    expect(find(list, 'meta-concluida:g-feita')?.severity).toBe('positivo');
    expect(find(list, 'meta-quase:g-quase')?.message).toContain('95%');
  });

  it('meta recém-criada (neste mês, sem aportes) não gera alerta de atraso', () => {
    const list = insightsFor({
      goals: [makeGoal({ id: 'g-nova', name: 'Carro', targetAmount: 3000000, targetDate: '2030-04-30', createdAt: `${TODAY}T12:00:00.000Z` })],
      goalContributions: [],
    });
    // Antes: "Meta Carro atrasada — aporte ... por mês — sua média recente é R$ 0,00".
    expect(find(list, 'meta-atrasada:g-nova')).toBeUndefined();
  });

  it('meta concluída há muito tempo não vira conquista de novo', () => {
    const list = insightsFor({
      goals: [makeGoal({ id: 'g-antiga', name: 'Celular', targetAmount: 100000, targetDate: null })],
      goalContributions: [makeContribution({ goalId: 'g-antiga', amount: 100000, date: '2026-05-05' })],
    });
    expect(find(list, 'meta-concluida')).toBeUndefined();
  });

  it('venda de um bem arquivado não vira "patrimônio em alta" (nem é atribuída a poupar)', () => {
    // Carro avaliado em maio, vendido em 20/09 por R$ 50.000,00 (receita) e arquivado nessa data.
    const data = makeData({
      accounts: [makeAccount({ id: 'cc', initialBalance: 100000 })],
      transactions: [
        tx({ accountId: 'cc', type: 'receita', amount: 5000000, date: '2026-09-20', categoryId: CATEGORY_IDS.outrosReceita }),
      ],
      assets: [makeAsset({ id: 'car', value: 5000000, archived: true, archivedAt: '2026-09-20' })],
      assetValuations: [makeValuation({ assetId: 'car', value: 5000000, date: '2026-05-01' })],
    });
    // Antes: "cresceu R$ 50.000,00 em setembro ... É o resultado de poupar e reduzir dívidas".
    expect(find(generateInsights(data, '2026-10-05'), 'patrimonio-cresceu')).toBeUndefined();
  });

  it('patrimônio em alta tem texto neutro (não atribui a alta a poupar e reduzir dívidas)', () => {
    const data = makeData({
      accounts: [makeAccount({ id: 'cc', initialBalance: 100000 })],
      transactions: [tx({ accountId: 'cc', type: 'receita', amount: 500000, date: '2026-09-05', categoryId: CATEGORY_IDS.salario })],
    });
    const growth = find(generateInsights(data, '2026-10-05'), 'patrimonio-cresceu');
    expect(growth?.message).toContain('cresceu R$ 5.000,00 em setembro de 2026');
    expect(growth?.message).not.toContain('poupar e reduzir dívidas');
  });

  it('compras do dia 1º não viram alerta de "ritmo acima do orçamento"', () => {
    const data = makeData({
      accounts: [makeAccount({ id: 'cc', initialBalance: 500000 })],
      budgets: [makeBudget({ categoryId: CATEGORY_IDS.mercado, amount: 60000 })],
      transactions: [
        tx({ accountId: 'cc', amount: 9730, date: '2026-10-01', categoryId: CATEGORY_IDS.mercado }),
        tx({ accountId: 'cc', amount: 9730, date: '2026-10-01', categoryId: CATEGORY_IDS.mercado }),
        tx({ accountId: 'cc', amount: 5000, date: '2026-10-01', categoryId: CATEGORY_IDS.mercado }),
      ],
    });
    // Antes: "Mercado: ritmo acima do orçamento — ... deve fechar o mês em R$ 7.582,60".
    expect(find(generateInsights(data, '2026-10-01'), 'orcamento-alerta')).toBeUndefined();
  });

  it('patrimônio que cai não gera conquista', () => {
    const list = insightsFor({
      transactions: [
        ...baseTransactions(),
        tx({ amount: 900000, date: '2026-09-28', description: 'Viagem', categoryId: CATEGORY_IDS.lazer }),
      ],
    });
    expect(find(list, 'patrimonio-cresceu')).toBeUndefined();
  });
});

describe('generateInsights — recorrências e assinaturas', () => {
  it('recorrências detectadas e não cadastradas (info) com ação para Recorrências', () => {
    const list = insightsFor();
    const rec = find(list, 'recorrencias-detectadas')!;
    expect(rec).toMatchObject({ severity: 'info', area: 'recorrencia', action: { to: ROUTES.recurring } });
    expect(rec.message).toContain('Aluguel (R$ 1.500,00)');
  });

  it('recorrência já cadastrada não é sugerida de novo', () => {
    const list = insightsFor({
      recurring: [makeRecurring({ accountId: ACC.corrente, description: 'Aluguel', amount: 150000, categoryId: CATEGORY_IDS.moradia })],
    });
    expect(find(list, 'recorrencias-detectadas')?.message).not.toContain('Aluguel');
  });

  it('assinaturas acima de 5% da renda (info); abaixo disso, nada', () => {
    const subs = ['Spotify', 'Disney', 'HBO', 'iCloud'].map((description) =>
      makeRecurring({ accountId: ACC.cartao, description, amount: 9000, categoryId: CATEGORY_IDS.assinaturas }),
    );
    const list = insightsFor({ recurring: subs });
    const s = find(list, 'assinaturas-caras')!;
    expect(s.severity).toBe('info');
    // 4 x 90 + Netflix detectada (55,90) = 415,90 por mês
    expect(s.message).toContain('R$ 415,90 por mês');
    expect(s.message).toContain('R$ 4.990,80 por ano');
    expect(find(insightsFor(), 'assinaturas-caras')).toBeUndefined();
  });
});

describe('generateInsights — dados', () => {
  it('sem dados: apenas orientações da área "dados" para começar', () => {
    const list = generateInsights(makeData(), TODAY);
    expect(list.map((i) => i.area)).toEqual(['dados', 'dados']);
    expect(ids(list)).toEqual([`dados-sem-contas:${MONTH}`, `dados-sem-lancamentos:${MONTH}`]);
    expect(list[0].action?.to).toBe(ROUTES.accounts);
    expect(list[1].action?.to).toBe(`${ROUTES.transactions}?novo=despesa`);
  });

  it('mesmo com renda estimada informada, sem nenhum dado não há alerta de reserva', () => {
    const base = makeData();
    const list = generateInsights(makeData({ settings: { ...base.settings, monthlyIncomeEstimate: 500000 } }), TODAY);
    expect(list.every((i) => i.area === 'dados')).toBe(true);
  });

  it('contas cadastradas mas sem lançamentos', () => {
    const list = generateInsights(makeData({ accounts: [makeAccount()] }), TODAY);
    expect(ids(list)).toContain(`dados-sem-lancamentos:${MONTH}`);
    expect(ids(list)).not.toContain(`dados-sem-contas:${MONTH}`);
  });

  it('sem lançamentos há 7+ dias, poucos dados e sem renda', () => {
    const data = makeData({
      accounts: [makeAccount({ id: 'c', initialBalance: 100000 })],
      transactions: [
        tx({ accountId: 'c', amount: 3000, date: '2026-10-04', categoryId: CATEGORY_IDS.mercado }),
        tx({ accountId: 'c', amount: 2000, date: '2026-10-05', categoryId: CATEGORY_IDS.restaurantes }),
      ],
    });
    const list = generateInsights(data, TODAY);
    const stale = find(list, 'dados-parado')!;
    expect(stale.id).toBe(`dados-parado:2026-10-05:${MONTH}`);
    expect(stale.message).toContain('10 dias');
    expect(find(list, 'poucos-dados')?.message).toContain('2 lançamentos');
    expect(find(list, 'dados-sem-renda')).toBeDefined();
    // 6 dias ainda não é "parado"
    expect(find(generateInsights(data, '2026-10-11'), 'dados-parado')).toBeUndefined();
  });
});

describe('generateInsights — filtros, limite e determinismo', () => {
  it('remove insights dispensados no mês corrente (e só no mês corrente)', () => {
    const base = makeScenario();
    const target = `reserva-completa:${MONTH}`;
    const dismissedNow = generateInsights(
      { ...base, settings: { ...base.settings, dismissedInsights: { [target]: MONTH } } },
      TODAY,
    );
    expect(ids(dismissedNow)).not.toContain(target);
    const dismissedBefore = generateInsights(
      { ...base, settings: { ...base.settings, dismissedInsights: { [target]: '2026-09' } } },
      TODAY,
    );
    expect(ids(dismissedBefore)).toContain(target);
  });

  it('limita a 12 e mantém os mais importantes', () => {
    const scenario = makeScenario();
    const many = generateInsights(
      makeScenario({
        accounts: [
          ...scenario.accounts.map((a) => (a.id === ACC.cartao ? { ...a, creditLimit: 100000 } : a)),
          makeAccount({ id: 'neg', name: 'Carteira', type: 'carteira', initialBalance: -1000 }),
        ],
        budgets: [
          makeBudget({ categoryId: CATEGORY_IDS.restaurantes, amount: 5000 }),
          makeBudget({ categoryId: CATEGORY_IDS.mercado, amount: 35000 }),
          makeBudget({ categoryId: CATEGORY_IDS.moradia, amount: 100000 }),
        ],
        debts: [makeDebt({ type: 'cartao', interestRate: 14, balance: 200000 })],
        goals: [
          makeGoal({ id: 'g1', name: 'Carro', targetAmount: 5000000, targetDate: '2027-01-31', createdAt: '2026-06-01T12:00:00.000Z' }),
          makeGoal({ id: 'g2', name: 'Casa', targetAmount: 9000000, targetDate: '2027-02-28', createdAt: '2026-06-01T12:00:00.000Z' }),
        ],
        transactions: [
          ...baseTransactions(),
          tx({ amount: 20000, date: '2026-10-09', description: 'Luz', status: 'pendente', categoryId: CATEGORY_IDS.contas }),
          tx({ amount: 400000, date: '2026-09-15', description: 'Notebook', categoryId: CATEGORY_IDS.compras }),
        ],
      }),
      TODAY,
    );
    expect(many).toHaveLength(12);
    expect(many[0].severity).toBe('critico');
    expect(many[0].id).toBe(`saldo-negativo:neg:${MONTH}`);
    expect(many.some((i) => i.severity === 'positivo')).toBe(false);
  });

  it('é determinístico e não altera a entrada', () => {
    const data = deepFreeze(makeScenario());
    const a = generateInsights(data, TODAY);
    const b = generateInsights(data, TODAY);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* Regressões da revisão do agente                                    */
/* ------------------------------------------------------------------ */

describe('generateInsights — regressões', () => {
  it('uso do limite do cartão: fatura em aberto + parcelas futuras; o pagamento agendado não abate', () => {
    const list = insightsFor({
      transactions: [
        ...baseTransactions(),
        tx({ type: 'transferencia', amount: 92360, date: '2026-10-20', accountId: ACC.corrente, toAccountId: ACC.cartao, status: 'pendente', categoryId: null, description: 'Pagamento da fatura' }),
        tx({ amount: 100000, date: '2026-11-12', accountId: ACC.cartao, status: 'pendente', categoryId: CATEGORY_IDS.compras, description: 'TV (2/10)' }),
      ],
    });
    // 923,60 + 1.000,00 = 1.923,60 de 5.000,00 (38,5%). Antes: 1.000,00 (20%), abaixo da própria fatura.
    const usage = find(list, `cartao-limite:${ACC.cartao}`)!;
    expect(usage.message).toContain('Você está usando R$ 1.923,60 de R$ 5.000,00 do limite (38,5%)');
  });

  it('no 1º dia do mês, um gasto pequeno não gera alerta de ritmo do orçamento', () => {
    const list = generateInsights(
      makeScenario({
        transactions: [
          ...baseTransactions().filter((t) => t.date < '2026-10-01'),
          tx({ amount: 3569, date: '2026-10-01', description: 'Uber', categoryId: CATEGORY_IDS.mercado }),
        ],
      }),
      '2026-10-01',
    );
    expect(find(list, 'orcamento-alerta')).toBeUndefined();
  });

  it('gasto fixo mensal (mesma descrição, valor parecido) não é "fora do padrão"', () => {
    const months = ['2026-07', '2026-08', '2026-09'];
    const small = months.flatMap((m) =>
      ['03', '17', '24'].map((d) => tx({ amount: 9000, date: `${m}-${d}`, description: 'Farmácia', categoryId: CATEGORY_IDS.saude })),
    );
    const plano = months.map((m) => tx({ amount: 38900, date: `${m}-10`, description: 'Plano de saúde', categoryId: CATEGORY_IDS.saude }));
    const list = insightsFor({
      transactions: [
        ...baseTransactions(),
        ...small,
        ...plano,
        tx({ id: 'tx-plano-out', amount: 38900, date: '2026-10-10', description: 'Plano de saúde', categoryId: CATEGORY_IDS.saude }),
      ],
    });
    expect(find(list, 'gasto-incomum:tx-plano-out')).toBeUndefined();
  });

  it('mesmo gasto não gera 4 alertas: sem "acima do normal" com orçamento estourado e 1 incomum por categoria', () => {
    const list = insightsFor({
      budgets: [makeBudget({ categoryId: CATEGORY_IDS.restaurantes, amount: 30000 })],
      transactions: [
        ...baseTransactions(),
        tx({ id: 'tx-jantar', amount: 39000, date: '2026-10-01', description: 'Jantar de aniversário', categoryId: CATEGORY_IDS.restaurantes }),
        tx({ id: 'tx-rodizio', amount: 34500, date: '2026-10-02', description: 'Rodízio japonês', categoryId: CATEGORY_IDS.restaurantes }),
      ],
    });
    expect(find(list, `orcamento-estourado:${CATEGORY_IDS.restaurantes}`)).toBeDefined();
    expect(find(list, `gasto-acima-media:${CATEGORY_IDS.restaurantes}`)).toBeUndefined();
    expect(list.filter((i) => i.id.startsWith('gasto-incomum'))).toHaveLength(1);
  });

  it('reserva completa explica a diferença para a meta "Reserva de emergência"', () => {
    const list = insightsFor({
      goals: [makeGoal({ id: 'g-reserva', name: 'Reserva de emergência', targetAmount: 3000000 })],
      goalContributions: [makeContribution({ goalId: 'g-reserva', amount: 1000000, date: '2026-09-01' })],
    });
    const reserve = find(list, 'reserva-completa')!;
    expect(reserve.message).toContain('Sua meta “Reserva de emergência” está em 33,3%');
  });
});

describe('generateInsights — sem meta de poupança (0% nas Configurações)', () => {
  const noGoal = { ...makeScenario().settings, savingsRateTarget: 0 };

  it('não compara a poupança com uma meta de 20% que o usuário não escolheu', () => {
    const list = insightsFor({
      settings: noGoal,
      transactions: [
        ...baseTransactions(),
        tx({ amount: 200000, date: '2026-09-15', description: 'Notebook', categoryId: CATEGORY_IDS.compras }),
      ],
    });
    expect(find(list, 'poupanca-abaixo')).toBeUndefined();
    expect(find(list, 'poupanca-meta')).toBeUndefined();
    expect(list.map((i) => i.message).join(' ')).not.toMatch(/meta de 20%/);
    // Cenário saudável: também não há "meta batida" sem meta.
    expect(find(insightsFor({ settings: noGoal }), 'poupanca-meta')).toBeUndefined();
  });

  it('o mês no vermelho continua sendo avisado', () => {
    const list = insightsFor({
      settings: noGoal,
      transactions: [
        ...baseTransactions(),
        tx({ amount: 450000, date: '2026-09-15', description: 'Viagem', categoryId: CATEGORY_IDS.lazer }),
      ],
    });
    expect(find(list, 'poupanca-abaixo')?.title).toBe('Mês passado no vermelho');
  });
});
