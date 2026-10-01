import { describe, expect, it } from 'vitest';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { FinanceData } from '@/domain/types';
import { makeData, makeDebt } from '@/test/factories';
import { respond } from '../responder';
import type { AgentAction, ConversationState } from '../types';
import { ACC, GOAL_VIAGEM, TODAY, deepFreeze, makeScenario } from './test-fixtures';

/** Simula uma conversa: envia as mensagens em sequência, carregando o estado. */
function conversation(messages: string[], data: FinanceData = makeScenario()) {
  let state: ConversationState = {};
  return messages.map((text) => {
    const result = respond(text, data, TODAY, state);
    state = result.state;
    return result;
  });
}

describe('continuação de contexto', () => {
  it('"e no mês passado?" repete a consulta de gastos com o novo período e a mesma categoria', () => {
    const [, second] = conversation(['quanto gastei com mercado este mês?', 'e no mês passado?']);
    expect(second.reply.intent).toBe('consultar_gastos');
    expect(second.reply.text).toContain('No mês passado, você gastou **R$ 900,00** com 🛒 Mercado em 3 lançamentos.');
    expect(second.state).toMatchObject({
      lastIntent: 'consultar_gastos',
      lastCategoryId: CATEGORY_IDS.mercado,
      lastPeriod: { start: '2026-09-01', end: '2026-09-30', label: 'mês passado' },
    });
  });

  it('"e com lazer?" troca a categoria mantendo o período anterior', () => {
    const [, , third] = conversation(['quanto gastei com mercado este mês?', 'e no mês passado?', 'e com lazer?']);
    expect(third.reply.text).toContain('No mês passado, você gastou **R$ 150,00** com 🎉 Lazer em 1 lançamento.');
  });

  it('categoria de receita na continuação vira consulta de receitas', () => {
    const [, second] = conversation(['quanto gastei com mercado este mês?', 'e de salário?']);
    expect(second.reply.intent).toBe('consultar_receitas');
    expect(second.reply.text).toContain('você recebeu **R$ 6.000,00** de 💼 Salário');
  });

  it('continua consultas de saldo com outra conta', () => {
    const [, second] = conversation(['qual meu saldo?', 'e na poupança?']);
    expect(second.reply.intent).toBe('consultar_saldo');
    expect(second.reply.text).toContain('O saldo de Poupança é **R$ 10.000,00**.');
    expect(second.state.lastAccountId).toBe(ACC.poupanca);
  });

  it('continua "posso gastar" com outro valor', () => {
    const [, second] = conversation(['posso gastar 300 num tênis?', 'e 150?']);
    expect(second.reply.intent).toBe('posso_gastar');
    expect(second.reply.text).toContain('R$ 150,00');
  });

  it('continua o status do orçamento em outro mês', () => {
    const [, second] = conversation(['como está meu orçamento?', 'e em setembro?']);
    expect(second.reply.intent).toBe('status_orcamento');
    expect(second.reply.text).toContain('Em setembro de 2026, você usou **R$ 900,00** de **R$ 1.000,00** orçados (90%)');
  });

  it('valor solto responde "Qual foi o valor?" e completa o registro com a categoria lembrada', () => {
    const [first, second] = conversation(['paguei a conta de luz', '120']);
    expect(first.reply.text).toContain('Qual foi o valor?');
    expect(second.reply.intent).toBe('registrar_despesa');
    const create = second.reply.actions.find((a) => a.type === 'create_transaction');
    expect(create?.type === 'create_transaction' && create.draft).toMatchObject({
      amount: 12000,
      categoryId: CATEGORY_IDS.contas,
      // A descrição dita no pedido ("conta de luz") também é aproveitada.
      description: 'Conta de luz',
    });
  });

  it('agradecimento, ajuda e saudação preservam o estado para continuar depois', () => {
    const results = conversation(['quanto gastei com mercado este mês?', 'valeu', 'ajuda', 'e no mês passado?']);
    expect(results[1].state).toEqual(results[0].state);
    expect(results[2].state).toEqual(results[0].state);
    expect(results[3].reply.text).toContain('No mês passado, você gastou **R$ 900,00** com 🛒 Mercado');
  });

  it('sem estado, uma continuação vira pedido para reformular', () => {
    const [only] = conversation(['e no mês passado?']);
    expect(only.reply.intent).toBe('desconhecido');
    expect(only.reply.text).toContain('Pode reformular?');
    expect(only.state).toEqual({});
  });

  it('continuação depois de uma intenção que não aceita período não é forçada', () => {
    const data = makeScenario({ debts: [makeDebt({ balance: 100000 })] });
    const [, second] = conversation(['minhas dívidas', 'e no mês passado?'], data);
    expect(second.reply.intent).toBe('desconhecido');
    expect(second.state.lastIntent).toBe('status_dividas');
  });

  it('uma nova pergunta completa substitui o contexto anterior', () => {
    const [, second] = conversation(['quanto gastei com mercado este mês?', 'resumo do mês']);
    expect(second.state).toEqual({
      lastIntent: 'resumo_mes',
      lastPeriod: { start: '2026-10-01', end: '2026-10-31', label: 'este mês' },
    });
  });
});

describe('respond — pureza', () => {
  it('é determinístico e não altera dados nem estado de entrada', () => {
    const data = deepFreeze(makeScenario());
    const state: ConversationState = deepFreeze({
      lastIntent: 'consultar_gastos',
      lastCategoryId: CATEGORY_IDS.mercado,
      lastPeriod: { start: '2026-10-01', end: '2026-10-31', label: 'este mês' },
    });
    const a = respond('e no mês passado?', data, TODAY, state);
    const b = respond('e no mês passado?', data, TODAY, state);
    expect(a).toEqual(b);
    expect(a.state).not.toBe(state);
  });

  it('o dia de hoje vem do parâmetro (não do relógio)', () => {
    const data = makeScenario();
    const oct = respond('resumo do mês', data, '2026-10-15', {}).reply.text;
    const sep = respond('resumo do mês', data, '2026-09-20', {}).reply.text;
    expect(oct).toContain('outubro de 2026');
    expect(sep).toContain('setembro de 2026');
  });

  it('funciona com dados vazios em qualquer intenção sem lançar erro', () => {
    const empty = makeData();
    for (const text of ['qual meu saldo?', 'previsão do mês', 'posso gastar 100?', 'meu patrimônio', 'reserva de emergência', 'contas a pagar', 'minhas assinaturas', 'relatório do mês', 'como estão minhas metas?', 'guardei 100 na meta viagem', 'como quitar minhas dívidas?', 'minha saúde financeira']) {
      const { reply } = respond(text, empty, TODAY, {});
      expect(reply.text.length).toBeGreaterThan(20);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Regressões da revisão: valor em resposta a uma pergunta do Pat      */
/* ------------------------------------------------------------------ */

function actionOf<T extends AgentAction['type']>(reply: { actions: AgentAction[] }, type: T) {
  return reply.actions.find((a): a is Extract<AgentAction, { type: T }> => a.type === type);
}

describe('regressões — o valor completa o pedido que o Pat deixou em aberto', () => {
  it('"criar meta carro" → "10 mil" cria a meta (não uma despesa)', () => {
    const [first, second] = conversation(['criar meta carro', '10 mil']);
    expect(first.reply.text).toContain('Quanto você quer juntar?');
    expect(second.reply.intent).toBe('criar_meta');
    expect(actionOf(second.reply, 'create_goal')?.draft).toMatchObject({ name: 'Carro', targetAmount: 1000000 });
    expect(actionOf(second.reply, 'create_transaction')).toBeUndefined();
  });

  it('a resposta com prazo ("10 mil em 12 meses") também vale', () => {
    const [, second] = conversation(['criar meta carro', '10 mil em 12 meses']);
    expect(actionOf(second.reply, 'create_goal')?.draft).toMatchObject({
      name: 'Carro',
      targetAmount: 1000000,
      targetDate: '2027-10-15',
    });
  });

  it('meta com nome repetido: avisa e o valor seguinte cria "Viagem 2"', () => {
    const [first, second] = conversation(['criar meta viagem', '5 mil']);
    expect(first.reply.text).toContain('Você já tem a meta ✈️ “Viagem”');
    expect(actionOf(second.reply, 'create_goal')?.draft).toMatchObject({ name: 'Viagem 2', targetAmount: 500000 });
  });

  it('"recebi o salário" → "6000" registra uma RECEITA de Salário', () => {
    const [first, second] = conversation(['recebi o salário', '6000']);
    expect(first.reply.text).toBe('Certo, vou registrar uma receita em 💼 Salário. Qual foi o valor?');
    expect(second.reply.intent).toBe('registrar_receita');
    expect(actionOf(second.reply, 'create_transaction')?.draft).toMatchObject({
      type: 'receita',
      amount: 600000,
      categoryId: CATEGORY_IDS.salario,
    });
  });

  it('"transferi pra poupança" → "500" registra a transferência', () => {
    const [first, second] = conversation(['transferi pra poupança', '500']);
    expect(first.reply.text).toContain('Qual foi o valor?');
    expect(actionOf(second.reply, 'create_transaction')?.draft).toMatchObject({
      type: 'transferencia',
      amount: 50000,
      accountId: ACC.corrente,
      toAccountId: ACC.poupanca,
    });
  });

  it('"paguei a fatura" → mostra a fatura em aberto e o valor seguinte vira o pagamento', () => {
    const [first, second] = conversation(['paguei a fatura', '923,60']);
    expect(first.reply.text).toContain('A fatura em aberto é R$ 923,60.');
    expect(actionOf(second.reply, 'create_transaction')?.draft).toMatchObject({
      type: 'transferencia',
      amount: 92360,
      accountId: ACC.corrente,
      toAccountId: ACC.cartao,
    });
  });

  it('"definir orçamento para lazer" → "400" define o orçamento', () => {
    const [, second] = conversation(['definir orçamento para lazer', '400']);
    expect(actionOf(second.reply, 'set_budget')).toMatchObject({ categoryId: CATEGORY_IDS.lazer, amount: 40000 });
  });

  it('"guardei na meta viagem" → "300" registra o aporte', () => {
    const [first, second] = conversation(['guardei na meta viagem', '300']);
    expect(first.reply.intent).toBe('aportar_meta');
    expect(actionOf(second.reply, 'contribute_goal')).toMatchObject({ goalId: GOAL_VIAGEM, amount: 30000 });
  });

  it('a data dita antes do valor é mantida ("gastei dia 20/09 no mercado" → "80")', () => {
    const [, second] = conversation(['gastei dia 20/09 no mercado', '80']);
    expect(actionOf(second.reply, 'create_transaction')?.draft).toMatchObject({
      amount: 8000,
      date: '2026-09-20',
      categoryId: CATEGORY_IDS.mercado,
    });
  });

  it('valor solto depois de uma consulta pergunta se é gasto ou entrada', () => {
    const [first, second] = conversation(['quanto gastei este mês?', '45']);
    expect(second.reply.text).toContain('é um gasto ou uma entrada?');
    expect(second.reply.actions).toEqual([]);
    expect(second.reply.suggestions).toEqual(['Gastei 45,00', 'Recebi 45,00']);
    expect(second.state).toEqual(first.state);
  });
});

describe('regressões — continuações com a entidade nova', () => {
  it('"quanto posso gastar?" → "e com mercado?" responde pelo orçamento da categoria', () => {
    const [first, second] = conversation(['quanto posso gastar?', 'e com mercado?']);
    expect(second.reply.intent).toBe('posso_gastar');
    expect(second.reply.text).not.toBe(first.reply.text);
    expect(second.reply.text).toContain('No orçamento de 🛒 Mercado restam **R$ 700,00**');
  });

  it('"minhas assinaturas" → "e mês passado?" não repete a mesma resposta', () => {
    const [first, second] = conversation(['minhas assinaturas', 'e mês passado?']);
    expect(second.reply.text).not.toBe(first.reply.text);
  });

  it('"posso gastar 300 num tênis?" → "e em 10x?" simula a mesma compra parcelada', () => {
    const [, second] = conversation(['posso gastar 300 num tênis?', 'e em 10x?']);
    expect(second.reply.intent).toBe('posso_gastar');
    expect(second.reply.text).toContain('Analisei a compra de Tênis (R$ 300,00 em 10x de R$ 30,00)');
  });

  it('correções do rascunho: "foi ontem" e "no cartão"', () => {
    const [, ontem] = conversation(['gastei 50 no mercado', 'foi ontem']);
    expect(ontem.reply.intent).toBe('registrar_despesa');
    expect(actionOf(ontem.reply, 'create_transaction')?.draft).toMatchObject({
      amount: 5000,
      date: '2026-10-14',
      categoryId: CATEGORY_IDS.mercado,
    });
    const [, cartao] = conversation(['gastei 50 no mercado', 'no cartão']);
    expect(actionOf(cartao.reply, 'create_transaction')?.draft).toMatchObject({ amount: 5000, accountId: ACC.cartao });
  });

  it('"conta" em frases comuns não vira continuação sobre Contas da casa', () => {
    const [, piada] = conversation(['quanto gastei este mês?', 'me conta uma piada']);
    expect(piada.reply.intent).toBe('desconhecido');
    const [, contas] = conversation(['quanto gastei este mês?', 'tenho dinheiro pra pagar as contas?']);
    expect(contas.reply.intent).toBe('contas_a_pagar');
  });

  it('"recebo 6000 dia 5" (hábito) sugere uma recorrência e não registra nada', () => {
    const [, second] = conversation(['quanto gastei este mês?', 'recebo 6000 dia 5']);
    expect(second.reply.actions.some((a) => a.type === 'create_transaction')).toBe(false);
    expect(second.reply.text).toContain('Recorrências');
  });
});

describe('regressões — pedido repetido com o valor', () => {
  it('"transferi pra poupança" → "transferi 500" mantém as contas', () => {
    const [, second] = conversation(['transferi pra poupança', 'transferi 500']);
    const create = second.reply.actions.find((a) => a.type === 'create_transaction');
    expect(create?.type === 'create_transaction' && create.draft).toMatchObject({
      amount: 50000,
      accountId: ACC.corrente,
      toAccountId: ACC.poupanca,
    });
  });
});
