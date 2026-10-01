import { describe, expect, it } from 'vitest';
import {
  affordability,
  cashflowForecast,
  compareStrategies,
  emergencyFund,
  financialHealth,
  netWorth,
  toPayoffInputs,
} from '@/analytics';
import { ROUTES } from '@/app/navigation';
import { CATEGORY_IDS } from '@/domain/defaults';
import { formatBRL } from '@/domain/money';
import type { FinanceData } from '@/domain/types';
import {
  makeAccount,
  makeBudget,
  makeContribution,
  makeData,
  makeDebt,
  makeGoal,
  makeRecurring,
} from '@/test/factories';
import { greeting, respond } from './responder';
import { ACC, GOAL_VIAGEM, TODAY, baseTransactions, makeScenario, tx } from './responder/test-fixtures';
import type { AgentAction, AgentCard, AgentReply, ConversationState } from './types';

function ask(text: string, data: FinanceData = makeScenario(), state: ConversationState = {}) {
  return respond(text, data, TODAY, state);
}

function reply(text: string, data?: FinanceData): AgentReply {
  return ask(text, data).reply;
}

function action<T extends AgentAction['type']>(r: AgentReply, type: T): Extract<AgentAction, { type: T }> {
  const found = r.actions.find((a) => a.type === type);
  if (!found) throw new Error(`ação ${type} não encontrada em ${JSON.stringify(r.actions)}`);
  return found as Extract<AgentAction, { type: T }>;
}

function card<T extends AgentCard['type']>(r: AgentReply, type: T, title?: string): Extract<AgentCard, { type: T }> {
  const found = r.cards.find((c) => c.type === type && (title === undefined || c.title === title));
  if (!found) throw new Error(`card ${type} ${title ?? ''} não encontrado em ${JSON.stringify(r.cards.map((c) => c.title))}`);
  return found as Extract<AgentCard, { type: T }>;
}

/** A dívida mais cara é a maior: avalanche e bola de neve atacam em ordens diferentes. */
const DEBTS = [
  makeDebt({ id: 'd-rotativo', name: 'Rotativo do cartão', type: 'cartao', interestRate: 6, balance: 1000000, minimumPayment: 70000, balanceDate: '2026-09-01' }),
  makeDebt({ id: 'd-emprestimo', name: 'Empréstimo pessoal', type: 'emprestimo', interestRate: 2, balance: 300000, minimumPayment: 30000, balanceDate: '2026-09-01' }),
];

describe('respond — registrar despesa', () => {
  it('monta o rascunho com valor, categoria, data relativa e pede a conta quando há várias', () => {
    const r = reply('gastei 45,90 no ifood ontem');
    expect(r.intent).toBe('registrar_despesa');
    expect(r.text).toContain('Entendi: despesa de R$ 45,90 em 🍽️ Restaurantes e delivery, ontem.');
    expect(r.text).toContain('Em qual conta?');
    expect(r.text).toMatch(/Confirma\?$/);
    expect(action(r, 'create_transaction').draft).toEqual({
      type: 'despesa',
      amount: 4590,
      date: '2026-10-14',
      description: 'Ifood',
      categoryId: CATEGORY_IDS.restaurantes,
      accountId: null,
      toAccountId: null,
      status: 'pago',
      installments: 1,
    });
    expect(r.suggestions).toContain('Quanto gastei com Restaurantes e delivery este mês?');
  });

  it('usa a conta citada e escreve a frase da conta em pt-BR', () => {
    const r = reply('gastei 45,90 no ifood ontem na conta corrente');
    expect(r.text).toContain('ontem, na Conta corrente. Confirma?');
    expect(action(r, 'create_transaction').draft.accountId).toBe(ACC.corrente);
  });

  it('com uma única conta adequada, usa essa conta', () => {
    const data = makeScenario({ accounts: [makeAccount({ id: 'unica', name: 'Itaú', type: 'corrente' })] });
    const r = reply('uber 23,50', data);
    expect(action(r, 'create_transaction').draft).toMatchObject({ accountId: 'unica', categoryId: CATEGORY_IDS.transporte });
    expect(r.text).toContain('na conta Itaú');
  });

  it('compra parcelada no cartão: parcelas, 1ª parcela e conta do cartão', () => {
    const r = reply('comprei uma tv de 3 mil em 10x no cartão');
    expect(r.text).toContain('compra parcelada de R$ 3.000,00 (10x de R$ 300,00) em 🛍️ Compras, 1ª parcela hoje, no Cartão Nubank');
    expect(action(r, 'create_transaction').draft).toMatchObject({
      amount: 300000,
      installments: 10,
      accountId: ACC.cartao,
      date: TODAY,
    });
  });

  it('se falou em cartão e a menção não casou com uma conta, usa o cartão de crédito', () => {
    const data = makeScenario({
      accounts: [
        makeAccount({ id: 'cc', name: 'Banco X', type: 'corrente' }),
        makeAccount({ id: 'visa', name: 'Visa Platinum', type: 'cartao_credito' }),
        makeAccount({ id: 'master', name: 'Master Black', type: 'cartao_credito' }),
      ],
    });
    const r = reply('gastei 80 na farmácia no crédito', data);
    expect(action(r, 'create_transaction').draft.accountId).toBe('visa');
  });

  it('sem valor: pergunta "Qual foi o valor?" sem ação e guarda o contexto', () => {
    const { reply: r, state } = ask('paguei a conta de luz');
    expect(r.text).toContain('Qual foi o valor?');
    expect(r.text).toContain('💡 Contas da casa');
    expect(r.actions).toEqual([]);
    expect(state).toEqual({ lastIntent: 'registrar_despesa', lastCategoryId: CATEGORY_IDS.contas });
  });

  it('mostra o impacto no orçamento da categoria', () => {
    const r = reply('gastei 80 no mercado');
    expect(r.text).toContain('Com ela, você usa 38% do orçamento de Mercado.');
    expect(card(r, 'progress').items[0]).toMatchObject({ current: 38000, target: 100000, tone: 'positive' });
    const over = reply('gastei 800 no mercado');
    expect(over.text).toContain('⚠️ Com ela, Mercado passa do orçamento: R$ 1.100,00 de R$ 1.000,00.');
    expect(card(over, 'progress').items[0].tone).toBe('negative');
  });

  it('categoria não reconhecida cai em "Outras despesas" e avisa', () => {
    const r = reply('gastei 50 no xyzwk');
    expect(action(r, 'create_transaction').draft.categoryId).toBe(CATEGORY_IDS.outrosDespesa);
    expect(r.text).toContain('Não reconheci a categoria');
  });

  it('usa o histórico para categorizar descrições conhecidas', () => {
    const data = makeScenario({
      transactions: [
        ...baseTransactions(),
        tx({ amount: 3000, date: '2026-10-02', description: 'Padaria do Zé', categoryId: CATEGORY_IDS.restaurantes }),
        tx({ amount: 3000, date: '2026-10-09', description: 'Padaria do Zé', categoryId: CATEGORY_IDS.restaurantes }),
      ],
    });
    const r = reply('gastei 30 na padaria do zé', data);
    expect(action(r, 'create_transaction').draft.categoryId).toBe(CATEGORY_IDS.restaurantes);
  });

  it('data futura vira lançamento pendente', () => {
    const r = reply('paguei 100 de luz amanhã');
    expect(action(r, 'create_transaction').draft).toMatchObject({ date: '2026-10-16', status: 'pendente' });
    expect(r.text).toContain('pendente');
  });

  it('sem contas cadastradas: explica e oferece ir para Contas', () => {
    const r = reply('gastei 50 no mercado', makeData());
    expect(r.actions).toEqual([{ type: 'navigate', label: 'Cadastrar conta', to: ROUTES.accounts }]);
    expect(r.text).toContain('primeiro cadastre uma conta');
  });
});

describe('respond — registrar receita e transferência', () => {
  it('receita: categoria de receita e ação de registro', () => {
    const r = reply('recebi 5000 de salário');
    expect(r.intent).toBe('registrar_receita');
    expect(r.text).toContain('Entendi: receita de R$ 5.000,00 em 💼 Salário, hoje.');
    const a = action(r, 'create_transaction');
    expect(a.label).toBe('Registrar receita');
    expect(a.draft).toMatchObject({ type: 'receita', amount: 500000, categoryId: CATEGORY_IDS.salario, installments: 1 });
  });

  it('receita nunca vai para o cartão de crédito por padrão', () => {
    const data = makeScenario({
      accounts: [
        makeAccount({ id: 'cc', name: 'Banco X', type: 'corrente' }),
        makeAccount({ id: 'card', name: 'Cartão', type: 'cartao_credito' }),
      ],
    });
    expect(action(reply('freela 300', data), 'create_transaction').draft.accountId).toBe('cc');
  });

  it('transferência entre contas', () => {
    const r = reply('transferi 500 da corrente para a poupança');
    expect(r.intent).toBe('registrar_transferencia');
    expect(r.text).toContain('Entendi: transferência de R$ 500,00 de Conta corrente para Poupança, hoje.');
    expect(action(r, 'create_transaction').draft).toEqual({
      type: 'transferencia',
      amount: 50000,
      date: TODAY,
      description: 'Transferência para Poupança',
      categoryId: null,
      accountId: ACC.corrente,
      toAccountId: ACC.poupanca,
      status: 'pago',
      installments: 1,
    });
  });

  it('pagamento de fatura vai para o cartão e dá a dica do rotativo', () => {
    const r = reply('paguei a fatura de 1.200');
    expect(r.text).toContain('pagamento de fatura de R$ 1.200,00');
    expect(r.text).toContain('rotativo');
    expect(action(r, 'create_transaction').draft).toMatchObject({
      toAccountId: ACC.cartao,
      description: 'Pagamento da fatura Cartão Nubank',
    });
  });

  it('sem contas citadas pede origem e destino', () => {
    const r = reply('transferi 200');
    expect(r.text).toContain('Escolha a conta de origem e de destino antes de confirmar.');
    expect(action(r, 'create_transaction').draft).toMatchObject({ accountId: null, toAccountId: null });
  });

  it('com uma conta só, explica que precisa de duas', () => {
    const r = reply('transferi 200', makeScenario({ accounts: [makeAccount()] }));
    expect(r.actions).toEqual([{ type: 'navigate', label: 'Cadastrar conta', to: ROUTES.accounts }]);
  });
});

describe('respond — consultas de saldo, gastos e receitas', () => {
  it('saldo geral: disponível, faturas, total e lista por conta', () => {
    const r = reply('qual meu saldo?');
    expect(r.intent).toBe('consultar_saldo');
    expect(r.text).toContain('Você tem **R$ 27.550,00** disponíveis nas contas.');
    expect(r.text).toContain('As faturas de cartão somam R$ 923,60.');
    expect(r.text).toContain('Saldo total: **R$ 26.626,40**.');
    const list = card(r, 'list', 'Saldos por conta');
    expect(list.items.map((i) => i.value)).toEqual(['R$ 17.550,00', 'R$ 10.000,00', '-R$ 923,60']);
    expect(list.items[2].tone).toBe('negative');
  });

  it('saldo de uma conta e fatura do cartão com limite disponível', () => {
    expect(reply('quanto tenho na poupança').text).toContain('O saldo de Poupança é **R$ 10.000,00**.');
    const card = reply('saldo do nubank');
    expect(card.text).toContain('A fatura em aberto do Cartão Nubank é **R$ 923,60**.');
    expect(card.text).toContain('Limite disponível: R$ 4.076,40 de R$ 5.000,00');
  });

  it('gastos por categoria no mês: total, média, orçamento e lista de lançamentos', () => {
    const { reply: r, state } = ask('quanto gastei com mercado este mês?');
    expect(r.intent).toBe('consultar_gastos');
    expect(r.text).toContain('Este mês, você gastou **R$ 300,00** com 🛒 Mercado em 1 lançamento.');
    expect(r.text).toContain('Sua média nos 3 meses anteriores é R$ 900,00 — 66,7% abaixo');
    expect(r.text).toContain('Isso é 30% do orçamento de R$ 1.000,00; restam R$ 700,00.');
    expect(card(r, 'stat').value).toBe('R$ 300,00');
    expect(card(r, 'list', 'Maiores lançamentos').items).toHaveLength(1);
    expect(r.suggestions[0]).toBe('E no mês passado?');
    expect(state).toMatchObject({ lastIntent: 'consultar_gastos', lastCategoryId: CATEGORY_IDS.mercado });
    expect(state.lastPeriod?.label).toBe('este mês');
  });

  it('gastos do mês sem categoria: total, principais categorias e gráfico de pizza', () => {
    const r = reply('quanto gastei este mês?');
    expect(r.text).toContain('Este mês, você gastou **R$ 2.455,90** em 5 lançamentos.');
    expect(r.text).toContain('Onde mais pesou: 🏠 Moradia (R$ 1.500,00)');
    const pie = card(r, 'chart');
    expect(pie.chart).toBe('pie');
    expect(pie.data.reduce((s, d) => s + d.value, 0)).toBe(245590);
  });

  it('sem gastos no filtro, orienta como registrar', () => {
    const r = reply('quanto gastei com pets este mês?');
    expect(r.text).toContain('não encontrei despesas com 🐾 Pets');
    expect(r.cards).toEqual([]);
  });

  it('pendentes aparecem destacados', () => {
    const data = makeScenario({
      transactions: [
        ...baseTransactions(),
        tx({ amount: 20000, date: '2026-10-20', description: 'Luz', status: 'pendente', categoryId: CATEGORY_IDS.contas }),
      ],
    });
    expect(reply('quanto gastei com luz este mês?', data).text).toContain('R$ 200,00 ainda está pendente (a pagar)');
  });

  it('receitas do mês', () => {
    const r = reply('quanto ganhei esse mês');
    expect(r.intent).toBe('consultar_receitas');
    expect(r.text).toContain('Este mês, você recebeu **R$ 6.000,00** em 1 lançamento.');
    expect(r.text).toContain('Está em linha com a sua média');
  });
});

describe('respond — resumo, comparação e maiores gastos', () => {
  it('resumo do mês corrente com sobra, taxa de poupança, maiores gastos e previsão', () => {
    const r = reply('resumo do mês');
    expect(r.intent).toBe('resumo_mes');
    expect(r.text).toContain('Resumo de outubro de 2026 até agora: entraram **R$ 6.000,00** e saíram **R$ 2.455,90**.');
    expect(r.text).toContain('Sobra de **R$ 3.544,10**');
    expect(r.text).toContain('67,4% da renda');
    expect(r.text).toContain('acima da sua meta de 20%');
    expect(r.text).toContain(formatBRL(cashflowForecast(makeScenario(), TODAY).projectedEndBalance));
    expect(r.cards.filter((c) => c.type === 'stat').map((c) => c.title)).toEqual(['Receitas', 'Despesas', 'Resultado do mês']);
  });

  it('resumo de mês passado e de mês sem dados', () => {
    expect(reply('como foi o mês passado').text).toContain('Resumo de setembro de 2026: entraram **R$ 6.000,00** e saíram **R$ 3.305,90**.');
    expect(reply('resumo de março').text).toContain('Ainda não há receitas nem despesas em março de 2026');
  });

  it('compara o mês corrente com o anterior, inclusive até a mesma data', () => {
    const r = reply('compara com o mês passado');
    expect(r.intent).toBe('comparar_meses');
    expect(r.text).toContain('Outubro de 2026 (até agora): despesas de **R$ 2.455,90**');
    expect(r.text).toContain('Setembro de 2026: despesas de **R$ 3.305,90**');
    expect(r.text).toContain('Até o dia 15, você gastou o mesmo que no mesmo período de setembro de 2026.');
    expect(card(r, 'chart').data).toHaveLength(6);
  });

  it('compara uma categoria entre os meses com gráfico de tendência', () => {
    const r = reply('comparar gastos com mercado');
    expect(r.text).toContain('Com 🛒 Mercado: **R$ 300,00** em outubro de 2026 (até agora) contra **R$ 900,00** em setembro de 2026.');
    expect(r.text).toContain('Queda de 66,7%');
    expect(card(r, 'chart').data.map((d) => d.value)).toEqual([0, 0, 90000, 90000, 90000, 30000]);
  });

  it('maiores gastos: categorias, maior lançamento e dica sobre desejos', () => {
    const r = reply('onde estou gastando mais?');
    expect(r.intent).toBe('maiores_gastos');
    expect(r.text).toContain('principalmente para 🏠 Moradia (R$ 1.500,00, 61,1%)');
    expect(r.text).toContain('O maior lançamento foi “Aluguel” (R$ 1.500,00, em 10/10/2026).');
    expect(r.text).toContain('🍽️ Restaurantes e delivery é o seu maior gasto com desejos: cortar 20% ali libera R$ 20,00 por mês.');
    expect(card(r, 'list', 'Maiores lançamentos').items[0].label).toBe('Aluguel');
  });
});

describe('respond — orçamentos', () => {
  it('situação geral dos orçamentos com progresso', () => {
    const r = reply('como está meu orçamento?');
    expect(r.intent).toBe('status_orcamento');
    expect(r.text).toContain('você usou **R$ 300,00** de **R$ 1.000,00** orçados (30%)');
    expect(r.text).toContain('✅ Todos dentro do limite.');
    expect(card(r, 'progress').items).toEqual([
      expect.objectContaining({ label: '🛒 Mercado', current: 30000, target: 100000, tone: 'positive' }),
    ]);
  });

  it('orçamento estourado e em alerta aparecem no texto', () => {
    const data = makeScenario({
      budgets: [
        makeBudget({ categoryId: CATEGORY_IDS.restaurantes, amount: 5000 }),
        makeBudget({ categoryId: CATEGORY_IDS.mercado, amount: 35000 }),
      ],
    });
    const r = reply('estourei o orçamento?', data);
    expect(r.text).toContain('⛔ Estourado: 🍽️ Restaurantes e delivery (+R$ 50,00).');
    expect(r.text).toContain('⚠️ Em alerta: 🛒 Mercado (85,7%).');
    expect(r.text).toContain('reveja o limite de Restaurantes e delivery');
  });

  it('categoria sem orçamento: sugere valor pela média e propõe set_budget', () => {
    const r = reply('quanto posso gastar com lazer?');
    expect(r.text).toContain('🎉 Lazer ainda não tem orçamento.');
    expect(action(r, 'set_budget')).toMatchObject({ categoryId: CATEGORY_IDS.lazer, amount: 15000, month: null });
  });

  it('sem nenhum orçamento: sugere os primeiros com base no histórico', () => {
    const r = reply('como está meu orçamento?', makeScenario({ budgets: [] }));
    expect(r.text).toContain('Você ainda não definiu orçamentos.');
    expect(r.text).toContain('🏠 Moradia: R$ 1.500,00 (média de R$ 1.500,00)');
    const budgets = r.actions.filter((a) => a.type === 'set_budget');
    expect(budgets.map((a) => (a.type === 'set_budget' ? a.categoryId : ''))).toEqual([CATEGORY_IDS.moradia, CATEGORY_IDS.mercado]);
  });

  it('definir orçamento padrão: ação set_budget e comparação com a média', () => {
    const r = reply('definir orçamento de 800 para mercado');
    expect(r.intent).toBe('definir_orcamento');
    expect(r.text).toContain('Combinado: orçamento de **R$ 800,00** para 🛒 Mercado (vale para todos os meses).');
    expect(r.text).toContain('Hoje o limite é R$ 1.000,00.');
    expect(r.text).toContain('cortar uns R$ 100,00 por mês');
    expect(action(r, 'set_budget')).toEqual({
      type: 'set_budget',
      label: 'Definir orçamento',
      categoryId: CATEGORY_IDS.mercado,
      amount: 80000,
      month: null,
    });
  });

  it('orçamento só para um mês', () => {
    const r = reply('limite de 300 em lazer este mês');
    expect(r.text).toContain('só para outubro de 2026');
    expect(action(r, 'set_budget')).toMatchObject({ categoryId: CATEGORY_IDS.lazer, amount: 30000, month: '2026-10' });
  });

  it('sem categoria: pergunta qual, sem ação', () => {
    const r = reply('orçamento de 500');
    expect(r.intent).toBe('definir_orcamento');
    expect(r.text).toContain('Para qual categoria é o orçamento de R$ 500,00?');
    expect(r.actions).toEqual([]);
    expect(r.suggestions[0]).toBe('Orçamento de 500,00 para Moradia');
  });
});

describe('respond — metas', () => {
  it('criar meta com prazo: aporte mensal e ação create_goal', () => {
    const r = reply('criar meta viagem de 10 mil até dezembro de 2027');
    expect(r.intent).toBe('criar_meta');
    expect(r.text).toContain('Ótimo objetivo, Ana! Meta ✈️ “Viagem”: **R$ 10.000,00** até 31/12/2027.');
    expect(r.text).toContain('guarde **R$ 714,29** por mês durante 14 meses');
    expect(r.text).toContain('Cabe na sua sobra média');
    expect(action(r, 'create_goal').draft).toMatchObject({
      name: 'Viagem',
      targetAmount: 1000000,
      targetDate: '2027-12-31',
      icon: '✈️',
      priority: 'media',
      status: 'ativa',
    });
  });

  it('meta de reserva: prioridade alta e aviso de que é orientação geral', () => {
    const r = reply('criar meta reserva de emergência de 20 mil em 10 meses');
    expect(action(r, 'create_goal').draft).toMatchObject({ icon: '🛟', priority: 'alta' });
    expect(r.text).toContain('não uma recomendação de investimento');
  });

  it('criar meta sem dados pede objetivo e valor', () => {
    const r = reply('criar meta');
    expect(r.text).toContain('Vamos criar uma meta!');
    expect(r.actions).toEqual([]);
    expect(r.suggestions.length).toBeGreaterThanOrEqual(2);
  });

  it('situação geral e de uma meta específica', () => {
    const all = reply('como estão minhas metas?');
    expect(all.text).toContain('Você tem 1 meta ativa. Já guardou **R$ 3.000,00** de R$ 10.000,00.');
    expect(card(all, 'progress').items[0]).toMatchObject({ current: 300000, target: 1000000, hint: 'No ritmo' });
    const one = reply('quanto falta para a meta viagem?');
    expect(one.text).toContain('✈️ Viagem: **R$ 3.000,00** de R$ 10.000,00 (30%). Faltam R$ 7.000,00. Você está no ritmo');
  });

  it('sem metas: convida a criar', () => {
    const r = reply('como estão minhas metas?', makeScenario({ goals: [], goalContributions: [] }));
    expect(r.text).toContain('Você ainda não tem metas.');
    expect(r.actions[0]).toMatchObject({ type: 'navigate', to: ROUTES.goals });
  });

  it('aportar na meta: ação contribute_goal e progresso depois do aporte', () => {
    const r = reply('guardei 300 na meta viagem');
    expect(r.intent).toBe('aportar_meta');
    expect(r.text).toContain('Aporte de **R$ 300,00** na meta ✈️ Viagem.');
    expect(r.text).toContain('você chega a R$ 3.300,00 de R$ 10.000,00 (33%)');
    expect(action(r, 'contribute_goal')).toEqual({
      type: 'contribute_goal',
      label: 'Confirmar aporte',
      goalId: GOAL_VIAGEM,
      amount: 30000,
      date: TODAY,
    });
    expect(card(r, 'progress').items[0].current).toBe(330000);
  });

  it('aporte que completa a meta comemora', () => {
    expect(reply('guardei 7000 na meta viagem').text).toContain('Esse aporte completa a meta! 🎉');
  });

  it('meta não encontrada: lista as metas existentes', () => {
    const data = makeScenario({
      goals: [
        makeGoal({ id: 'g-carro', name: 'Carro novo', targetAmount: 5000000, icon: '🚗' }),
        makeGoal({ id: 'g-casa', name: 'Casa própria', targetAmount: 20000000, icon: '🏠' }),
      ],
      goalContributions: [makeContribution({ goalId: 'g-carro', amount: 100000 })],
    });
    const r = reply('guardei 300 na meta xablau', data);
    expect(r.text).toContain('Não encontrei essa meta.');
    expect(r.text).toContain('• 🚗 Carro novo — R$ 1.000,00 de R$ 50.000,00');
    expect(r.text).toContain('• 🏠 Casa própria — R$ 0,00 de R$ 200.000,00');
    expect(r.actions).toEqual([]);
    expect(r.suggestions).toEqual(['Guardei 300,00 na meta Carro novo', 'Guardei 300,00 na meta Casa própria']);
  });
});

describe('respond — dívidas', () => {
  it('situação das dívidas: total, juros, mais cara e comprometimento da renda', () => {
    const r = reply('minhas dívidas', makeScenario({ debts: DEBTS }));
    expect(r.intent).toBe('status_dividas');
    expect(r.text).toContain('Você deve **R$ 13.000,00** em 2 dívidas.');
    expect(r.text).toContain('Os juros estimados somam **R$ 660,00** por mês, e as parcelas mínimas, R$ 1.000,00.');
    expect(r.text).toContain('A mais cara é Rotativo do cartão, com 6% ao mês');
    expect(r.text).toContain('As parcelas comprometem 16,7% da sua renda.');
    expect(card(r, 'list', 'Suas dívidas').items[0].tone).toBe('negative');
  });

  it('sem dívidas', () => {
    expect(reply('minhas dívidas').text).toContain('Você não tem dívidas registradas.');
  });

  it('plano de quitação com mínimos + 10% e recomendação', () => {
    const data = makeScenario({ debts: DEBTS });
    const r = reply('como quitar minhas dívidas?', data);
    expect(r.intent).toBe('plano_dividas');
    const cmp = compareStrategies(toPayoffInputs(data.debts, data.debtPayments), 110000);
    expect(r.text).toContain('Com **R$ 1.100,00** por mês para as dívidas (os mínimos + 10%):');
    expect(r.text).toContain(`Avalanche (maior juros primeiro): quita tudo em ${cmp.avalanche.months} meses`);
    expect(r.text).toContain(formatBRL(cmp.avalanche.totalInterest));
    expect(r.text).toContain(formatBRL(cmp.snowball.totalInterest));
    expect(cmp.recommended).toBe('avalanche');
    expect(cmp.interestSavings).toBeGreaterThan(0);
    expect(r.text).toContain(`economiza **${formatBRL(cmp.interestSavings)}** em juros`);
    const first = cmp.avalanche.payoffOrder[0];
    expect(r.text).toContain(`Ordem de quitação: ${first.name} (mês ${first.month})`);
    expect(card(r, 'chart').data[0]).toEqual({ label: 'Hoje', value: 1300000 });
  });

  it('usa o valor mensal informado e avisa quando não cobre os mínimos', () => {
    const data = makeScenario({ debts: DEBTS });
    expect(reply('tenho 2000 por mês para quitar as dívidas', data).text).toContain('Com **R$ 2.000,00** por mês para as dívidas:');
    expect(reply('tenho 500 por mês para quitar as dívidas', data).text).toContain('não dá para cobrir nem os pagamentos mínimos (R$ 1.000,00)');
  });
});

describe('respond — patrimônio, reserva e saúde', () => {
  it('patrimônio líquido com composição e evolução', () => {
    const data = makeScenario();
    const r = reply('meu patrimônio', data);
    expect(r.intent).toBe('patrimonio');
    expect(r.text).toContain(`Seu patrimônio líquido é **${formatBRL(netWorth(data, TODAY).netWorth)}**`);
    expect(card(r, 'chart').data).toHaveLength(6);
    expect(card(r, 'list').items.map((i) => i.label)).toContain('Faturas e saldos negativos');
  });

  it('reserva completa, sem ação de criar meta', () => {
    const r = reply('reserva de emergência');
    expect(r.text).toContain('✅ Está completa');
    expect(r.text).toContain('não uma recomendação de investimento');
    expect(r.actions).toEqual([]);
  });

  it('reserva baixa propõe meta de reserva com o valor que falta para a meta', () => {
    const data = makeScenario({
      accounts: [makeAccount({ id: ACC.corrente, name: 'Conta corrente', initialBalance: -1400000 })],
    });
    const fund = emergencyFund(data, TODAY);
    const r = reply('minha reserva está boa?', data);
    expect(r.text).toContain(`faltam **${formatBRL(fund.gap)}**`);
    expect(action(r, 'create_goal').draft).toMatchObject({ name: 'Reserva de emergência', targetAmount: fund.target, priority: 'alta' });
  });

  it('saúde financeira: nota, ponto fraco e componentes', () => {
    const data = makeScenario();
    const report = financialHealth(data, TODAY);
    const r = reply('minha saúde financeira', data);
    expect(r.text).toContain(`**${report.score}/100**`);
    expect(r.text).toContain('Onde melhorar primeiro:');
    expect(card(r, 'list').items).toHaveLength(6);
  });
});

describe('respond — previsão, posso gastar, contas e assinaturas', () => {
  it('previsão positiva do mês', () => {
    const data = makeScenario();
    const f = cashflowForecast(data, TODAY);
    const r = reply('vou fechar o mês no azul?', data);
    expect(r.intent).toBe('previsao');
    expect(r.text).toContain(`✅ Previsão: fechar outubro de 2026 com **${formatBRL(f.projectedEndBalance)}**.`);
    expect(card(r, 'stat').value).toBe(formatBRL(f.projectedEndBalance));
  });

  it('previsão negativa recomenda corte diário', () => {
    const data = makeScenario({
      transactions: [
        ...baseTransactions(),
        tx({ amount: 5000000, date: '2026-10-25', description: 'Reforma', status: 'pendente', categoryId: CATEGORY_IDS.moradia }),
      ],
    });
    const r = reply('vou fechar o mês no azul?', data);
    expect(r.text).toContain('⛔ Previsão: fechar outubro de 2026 em');
    expect(r.text).toContain('por dia');
  });

  it('posso gastar: veredito com emoji, razões da análise e orçamento da categoria', () => {
    const data = makeScenario();
    const r = reply('posso gastar 300 num tênis?', data);
    const expected = affordability(data, TODAY, 30000, 1);
    expect(expected.verdict).toBe('sim');
    expect(r.text.startsWith('✅ Pode sim, Ana!')).toBe(true);
    expect(r.text).toContain(`• ${expected.reasons[0]}`);
    expect(card(r, 'list').items[0].value).toBe(formatBRL(expected.projectedEndBalance));
  });

  it('passar do orçamento da categoria rebaixa o "sim" para cautela', () => {
    const data = makeScenario({ budgets: [makeBudget({ categoryId: CATEGORY_IDS.compras, amount: 10000 })] });
    const r = reply('posso gastar 300 num tênis?', data);
    expect(r.text.startsWith('⚠️ Ana, dá, mas com cautela.')).toBe(true);
    expect(r.text).toContain('a compra passaria do limite');
  });

  it('compra que não cabe: ⛔ e proposta de meta', () => {
    const r = reply('consigo comprar um celular de 20 mil em 2x?');
    expect(r.text.startsWith('⛔ Ana, agora não é uma boa ideia.')).toBe(true);
    expect(action(r, 'create_goal').draft).toMatchObject({ name: 'Celular', targetAmount: 2000000 });
  });

  it('"quanto posso gastar?" sem valor: receitas − comprometido − meta de poupança, por dia', () => {
    const r = reply('quanto posso gastar hoje?');
    expect(r.intent).toBe('posso_gastar');
    // 6.000 − 2.455,90 − (1.200 de meta − 500 já investidos) = 2.844,10 em 17 dias
    expect(r.text).toContain('você ainda pode gastar **R$ 2.844,10** até o fim do mês — cerca de **R$ 167,30** por dia nos próximos 17 dias');
  });

  it('contas a pagar: vencidas, próximas e lista', () => {
    const data = makeScenario({
      transactions: [
        ...baseTransactions(),
        tx({ amount: 20000, date: '2026-10-10', description: 'Conta de luz', status: 'pendente', categoryId: CATEGORY_IDS.contas }),
      ],
      recurring: [
        makeRecurring({ accountId: ACC.corrente, description: 'Internet', amount: 10000, startDate: '2026-07-20', nextDate: '2026-10-20', categoryId: CATEGORY_IDS.contas }),
      ],
    });
    const r = reply('contas a pagar', data);
    expect(r.intent).toBe('contas_a_pagar');
    expect(r.text).toContain('Você tem 2 contas a pagar até 31/10/2026, somando **R$ 300,00**.');
    expect(r.text).toContain('⚠️ 1 já está vencida: Conta de luz (R$ 200,00, venceu em 10/10/2026).');
    expect(r.text).toContain('A próxima é Internet (R$ 100,00), em 20/10/2026.');
    expect(card(r, 'list').items[0]).toMatchObject({ label: 'Conta de luz', tone: 'negative' });
  });

  it('sem contas a pagar: comemora e sugere cadastrar recorrências', () => {
    const r = reply('contas a pagar');
    expect(r.text).toContain('Nenhuma conta a pagar até 31/10/2026. 🎉');
    expect(r.actions[0]).toMatchObject({ type: 'navigate', to: ROUTES.recurring });
  });

  it('assinaturas e gastos fixos: totais mensais, anuais e candidatas detectadas', () => {
    const data = makeScenario({
      recurring: [
        makeRecurring({ accountId: ACC.cartao, description: 'Netflix', amount: 5590 }),
        makeRecurring({ accountId: ACC.cartao, description: 'Spotify', amount: 2190 }),
        makeRecurring({ accountId: ACC.corrente, description: 'Seguro', amount: 120000, frequency: 'anual', categoryId: CATEGORY_IDS.impostos }),
      ],
    });
    const r = reply('minhas assinaturas', data);
    expect(r.intent).toBe('assinaturas');
    expect(r.text).toContain('Seus gastos fixos cadastrados somam **R$ 177,80** por mês (3 itens)');
    expect(r.text).toContain('custam R$ 77,80 por mês — R$ 933,60 por ano');
    expect(r.text).toContain('Também encontrei');
    expect(card(r, 'list', 'Gastos fixos').items[0]).toMatchObject({ label: 'Seguro', value: 'R$ 100,00/mês' });
    expect(r.actions[0]).toMatchObject({ type: 'navigate', to: ROUTES.recurring });
  });
});

describe('respond — dicas, relatório e conversa', () => {
  it('dicas personalizadas a partir dos insights e do maior gasto com desejos', () => {
    const data = makeScenario({ budgets: [makeBudget({ categoryId: CATEGORY_IDS.restaurantes, amount: 5000 })] });
    const r = reply('dicas', data);
    expect(r.intent).toBe('dicas');
    expect(r.text.startsWith('Ana, aqui vão minhas dicas, com base nos seus números:')).toBe(true);
    expect(r.text).toContain('**Orçamento de Restaurantes e delivery estourado**');
    expect(r.text).toContain('Corte 20% em Restaurantes e delivery');
    expect(r.actions[0]).toMatchObject({ type: 'navigate', to: ROUTES.budgets });
    expect(r.text.split('\n').filter((l) => l.startsWith('• '))).toHaveLength(4);
  });

  it('dicas sem dados: dicas gerais de educação financeira', () => {
    const r = reply('como economizar?', makeData());
    expect(r.text).toContain('Aqui vão algumas dicas para começar');
    expect(r.text).toContain('Regra 50/30/20');
  });

  it('relatório: resumo do fechamento com cards e atalho para Relatórios', () => {
    const r = reply('relatório de setembro');
    expect(r.intent).toBe('relatorio');
    expect(r.text.startsWith('**Fechamento de setembro de 2026**')).toBe(true);
    expect(r.text).toContain('Em setembro de 2026 entraram R$ 6.000,00 e saíram R$ 3.305,90.');
    expect(r.text).toContain('Para outubro de 2026:');
    expect(r.cards.length).toBeGreaterThanOrEqual(5);
    expect(r.actions).toEqual([{ type: 'navigate', label: 'Ver relatórios', to: ROUTES.reports }]);
  });

  it('ajuda lista o que o Pat sabe fazer com exemplos', () => {
    const r = reply('o que você sabe fazer?');
    expect(r.intent).toBe('ajuda');
    expect(r.text).toContain('Eu sou o Pat');
    expect(r.text).toContain('“gastei 45,90 no ifood ontem”');
    expect(r.text).toContain('não substituem uma consultoria profissional');
    expect(r.suggestions).toHaveLength(4);
  });

  it('saudação traz o resumo do dia', () => {
    const r = reply('oi');
    expect(r.intent).toBe('saudacao');
    expect(r.text).toContain('Oi, Ana! Hoje é quinta-feira, 15 de outubro.');
    expect(r.text).toContain('Você tem **R$ 27.550,00** disponíveis nas contas e já gastou **R$ 2.455,90** em outubro.');
  });

  it('agradecimento (forte e confirmação curta)', () => {
    expect(reply('obrigado').text).toBe('Por nada, Ana! 😊 Estou por aqui sempre que precisar.');
    expect(reply('ok').text).toContain('Combinado!');
  });

  it('não entendido pede para reformular, com exemplos', () => {
    const r = reply('asdfgh qwerty');
    expect(r.intent).toBe('desconhecido');
    expect(r.text.startsWith('Ana, não entendi bem.')).toBe(true);
    expect(r.text).toContain('• “gastei 50 no mercado”');
    const noName = reply('asdfgh qwerty', makeData());
    expect(noName.text.startsWith('Não entendi bem.')).toBe(true);
  });
});

describe('greeting', () => {
  it('com dados: saudação, situação do mês e até 3 insights em card de lista', () => {
    const r = greeting(makeScenario({ budgets: [makeBudget({ categoryId: CATEGORY_IDS.restaurantes, amount: 5000 })] }), TODAY);
    expect(r.intent).toBe('saudacao');
    expect(r.text.startsWith('Oi, Ana! Hoje é quinta-feira, 15 de outubro.')).toBe(true);
    expect(r.text).toContain('A previsão é fechar o mês com');
    const list = card(r, 'list', 'Destaques de hoje');
    expect(list.items.length).toBeGreaterThan(0);
    expect(list.items.length).toBeLessThanOrEqual(3);
    expect(list.items[0]).toMatchObject({ label: 'Orçamento de Restaurantes e delivery estourado', value: 'Urgente', tone: 'negative' });
    expect(r.suggestions[0]).toBe('Como está meu orçamento?');
    expect(r.suggestions.length).toBeGreaterThanOrEqual(2);
    expect(r.suggestions.length).toBeLessThanOrEqual(4);
  });

  it('sem dados: apresenta o Pat, explica como começar e leva para Contas', () => {
    const r = greeting(makeData(), TODAY);
    expect(r.text).toContain('Eu sou o Pat');
    expect(r.text).toContain('sem conexão com bancos');
    expect(r.actions).toEqual([{ type: 'navigate', label: 'Cadastrar conta', to: ROUTES.accounts }]);
    expect(card(r, 'list', 'Para começar').items.map((i) => i.label)).toEqual([
      'Cadastre suas contas',
      'Registre seu primeiro lançamento',
    ]);
  });

  it('usa o nome do agente configurado', () => {
    const base = makeData();
    expect(greeting(makeData({ settings: { ...base.settings, agentName: 'Fin' } }), TODAY).text).toContain('Eu sou o Fin');
  });
});
