import { describe, expect, it } from 'vitest';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { FinanceData } from '@/domain/types';
import { makeData, makeDebt } from '@/test/factories';
import { respond } from '../responder';
import type { ConversationState } from '../types';
import { ACC, TODAY, deepFreeze, makeScenario } from './test-fixtures';

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
      description: 'Contas da casa',
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
