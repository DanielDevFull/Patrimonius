/**
 * Invariantes de qualidade das respostas do Pat sobre um corpus amplo de mensagens e três conjuntos de dados
 * (demonstração com 6 meses, cenário de teste e banco vazio).
 */
import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/app/navigation';
import { isISODate, isMonthKey } from '@/domain/dates';
import type { FinanceData } from '@/domain/types';
import { buildDemoData } from '@/db/demo';
import { makeData } from '@/test/factories';
import { parseMessage } from '../nlu';
import { greeting, respond } from '../responder';
import type { AgentReply, ConversationState, IntentName } from '../types';
import { TODAY, makeScenario } from './test-fixtures';

const CORPUS = [
  'gastei 45,90 no ifood ontem',
  'comprei uma tv de 3 mil em 10x no cartão',
  'uber 23,50',
  'paguei a conta de luz',
  '120',
  'recebi 5000 de salário',
  'freela 300',
  'transferi 500 da corrente para a poupança',
  'paguei a fatura de 1.200',
  'qual meu saldo?',
  'quanto tenho na poupança',
  'quanto gastei este mês?',
  'quanto gastei com mercado este mês?',
  'e no mês passado?',
  'e com lazer?',
  'quanto gastei nos últimos 3 meses?',
  'quanto ganhei esse mês',
  'resumo do mês',
  'como foi o mês passado',
  'compara com o mês passado',
  'comparar gastos com mercado',
  'onde estou gastando mais?',
  'maiores gastos da semana passada',
  'como está meu orçamento?',
  'quanto posso gastar com lazer?',
  'definir orçamento de 800 para mercado',
  'orçamento de 500',
  'criar meta viagem de 10 mil até dezembro de 2027',
  'criar meta',
  'como estão minhas metas?',
  'guardei 300 na meta viagem',
  'minhas dívidas',
  'como quitar minhas dívidas?',
  'tenho 3000 por mês para quitar as dívidas',
  'meu patrimônio',
  'reserva de emergência',
  'minha saúde financeira',
  'vou fechar o mês no azul?',
  'previsão para os próximos 30 dias',
  'posso gastar 300 num tênis?',
  'e 5000?',
  'quanto posso gastar hoje?',
  'consigo comprar um celular de 4000 em 10x?',
  'contas a pagar',
  'o que vence esta semana?',
  'minhas assinaturas',
  'dicas',
  'relatório do mês',
  'fechamento de setembro',
  'ajuda',
  'oi',
  'obrigado',
  'asdfgh qwerty',
];

const ALL_INTENTS: IntentName[] = [
  'registrar_despesa',
  'registrar_receita',
  'registrar_transferencia',
  'consultar_saldo',
  'consultar_gastos',
  'consultar_receitas',
  'resumo_mes',
  'comparar_meses',
  'maiores_gastos',
  'status_orcamento',
  'definir_orcamento',
  'criar_meta',
  'status_metas',
  'aportar_meta',
  'status_dividas',
  'plano_dividas',
  'patrimonio',
  'reserva_emergencia',
  'saude_financeira',
  'previsao',
  'posso_gastar',
  'contas_a_pagar',
  'assinaturas',
  'dicas',
  'relatorio',
  'ajuda',
  'saudacao',
  'agradecimento',
  'desconhecido',
];

const ROUTE_VALUES = new Set<string>(Object.values(ROUTES));

/** Famílias de sugestões com valor e a intenção que elas precisam disparar. */
const EXPECTED_BY_PREFIX: [string, IntentName][] = [
  ['Orçamento de', 'definir_orcamento'],
  ['Guardei', 'aportar_meta'],
  ['Criar meta', 'criar_meta'],
  ['Tenho', 'plano_dividas'],
  ['Quanto gastei', 'consultar_gastos'],
  ['Posso gastar', 'posso_gastar'],
  ['Relatório de', 'relatorio'],
];

function demoData(): FinanceData {
  const demo = buildDemoData(TODAY);
  const base = makeData();
  return makeData({ ...demo, settings: { ...base.settings, userName: 'Bia' } });
}

const DATASETS: [string, () => FinanceData][] = [
  ['demonstração', demoData],
  ['cenário', () => makeScenario()],
  ['vazio', () => makeData()],
];

function runCorpus(data: FinanceData): AgentReply[] {
  let state: ConversationState = {};
  return CORPUS.map((text) => {
    const result = respond(text, data, TODAY, state);
    state = result.state;
    return result.reply;
  });
}

function checkReply(reply: AgentReply, data: FinanceData): void {
  expect(reply.text.trim().length).toBeGreaterThan(0);
  expect(reply.text).not.toMatch(/undefined|NaN|Infinity|\[object Object\]|null/);
  expect(reply.text).not.toMatch(/R\$\s*-|\s{3,}[^\n]/);
  expect(reply.suggestions.length).toBeLessThanOrEqual(4);
  expect(new Set(reply.suggestions).size).toBe(reply.suggestions.length);
  for (const card of reply.cards) {
    expect(card.title.length).toBeGreaterThan(0);
    if (card.type === 'list') {
      expect(card.items.length).toBeGreaterThan(0);
      for (const item of card.items) expect(item.value).not.toMatch(/undefined|NaN/);
    }
    if (card.type === 'progress') {
      for (const item of card.items) {
        expect(Number.isInteger(item.current)).toBe(true);
        expect(Number.isInteger(item.target)).toBe(true);
        expect(item.target).toBeGreaterThan(0);
      }
    }
    if (card.type === 'chart') {
      expect(card.data.length).toBeGreaterThan(0);
      for (const d of card.data) expect(Number.isFinite(d.value)).toBe(true);
    }
  }
  for (const action of reply.actions) {
    expect(action.label.length).toBeGreaterThan(0);
    switch (action.type) {
      case 'create_transaction': {
        const d = action.draft;
        expect(Number.isInteger(d.amount) && d.amount > 0).toBe(true);
        expect(isISODate(d.date)).toBe(true);
        expect(Number.isInteger(d.installments) && d.installments >= 1).toBe(true);
        if (d.type === 'transferencia') expect(d.categoryId).toBeNull();
        else expect(data.categories.some((c) => c.id === d.categoryId && c.kind === d.type)).toBe(true);
        if (d.accountId !== null) expect(data.accounts.some((a) => a.id === d.accountId)).toBe(true);
        break;
      }
      case 'set_budget':
        expect(Number.isInteger(action.amount) && action.amount > 0).toBe(true);
        expect(action.month === null || isMonthKey(action.month)).toBe(true);
        expect(data.categories.find((c) => c.id === action.categoryId)?.kind).toBe('despesa');
        break;
      case 'create_goal':
        expect(Number.isInteger(action.draft.targetAmount) && action.draft.targetAmount > 0).toBe(true);
        expect(action.draft.targetDate === null || isISODate(action.draft.targetDate)).toBe(true);
        expect(action.draft.name.trim().length).toBeGreaterThan(0);
        break;
      case 'contribute_goal':
        expect(data.goals.some((g) => g.id === action.goalId)).toBe(true);
        expect(Number.isInteger(action.amount) && action.amount > 0).toBe(true);
        break;
      case 'navigate':
        expect(ROUTE_VALUES.has(action.to.split('?')[0])).toBe(true);
        break;
    }
  }
}

describe.each(DATASETS)('qualidade das respostas — %s', (_name, build) => {
  const data = build();
  const replies = runCorpus(data);

  it('toda resposta é bem formada (texto, cards, ações e sugestões)', () => {
    for (const reply of replies) checkReply(reply, data);
  });

  it('é determinística: a mesma conversa produz exatamente as mesmas respostas', () => {
    expect(runCorpus(data)).toEqual(replies);
  });

  it('as sugestões são mensagens que o Pat entende', () => {
    const ctx = { today: TODAY, categories: data.categories, accounts: data.accounts, goals: data.goals, transactions: data.transactions };
    const all = new Set([...replies.flatMap((r) => r.suggestions), ...greeting(data, TODAY).suggestions]);
    for (const suggestion of all) {
      const parsed = parseMessage(suggestion, ctx);
      const continuation = parsed.intent === 'desconhecido' && Object.keys(parsed.entities).length > 0;
      expect(parsed.intent !== 'desconhecido' || continuation, `sugestão não entendida: "${suggestion}"`).toBe(true);
      const expected = EXPECTED_BY_PREFIX.find(([prefix]) => suggestion.startsWith(prefix))?.[1];
      if (expected) expect(parsed.intent, suggestion).toBe(expected);
    }
  });

  it('a saudação de abertura é bem formada', () => {
    const reply = greeting(data, TODAY);
    checkReply(reply, data);
    expect(reply.suggestions.length).toBeGreaterThanOrEqual(2);
  });
});

describe('cobertura de intenções', () => {
  it('o corpus exercita todas as intenções do contrato', () => {
    const covered = new Set(runCorpus(demoData()).map((r) => r.intent));
    for (const intent of ALL_INTENTS) expect(covered.has(intent), intent).toBe(true);
  });
});
