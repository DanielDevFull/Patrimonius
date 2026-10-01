import { describe, expect, it } from 'vitest';
import { CATEGORY_IDS } from '@/domain/defaults';
import { makeAccount, makeTransaction } from '@/test/factories';
import type { IntentName, ParsedEntities } from '../types';
import { parseMessage } from './index';
import { makeNluContext, TODAY } from './test-fixtures';

const ctx = makeNluContext();
const parse = (text: string) => parseMessage(text, ctx);

const THIS_MONTH = { start: '2026-10-01', end: '2026-10-31', label: 'este mês' };
const LAST_MONTH = { start: '2026-09-01', end: '2026-09-30', label: 'mês passado' };
const SEPTEMBER = { start: '2026-09-01', end: '2026-09-30', label: 'setembro de 2026' };

type Case = [string, IntentName, ParsedEntities?];

function expectCase([text, intent, entities]: Case) {
  const r = parse(text);
  expect(r.intent).toBe(intent);
  if (entities) expect(r.entities).toMatchObject(entities);
  return r;
}

describe('parseMessage — registrar despesa', () => {
  it.each<Case>([
    [
      'gastei 45,90 no ifood ontem',
      'registrar_despesa',
      { amount: 4590, date: '2026-09-30', description: 'ifood', categoryId: CATEGORY_IDS.restaurantes },
    ],
    [
      'paguei 120 de luz no cartão nubank',
      'registrar_despesa',
      { amount: 12000, categoryId: CATEGORY_IDS.contas, accountId: 'acc-nubank', description: 'luz' },
    ],
    [
      'comprei uma tv de 3 mil em 10x no cartão',
      'registrar_despesa',
      {
        amount: 300000,
        installments: 10,
        categoryId: CATEGORY_IDS.compras,
        accountId: 'acc-nubank',
        description: 'tv',
      },
    ],
    [
      'uber 23,50',
      'registrar_despesa',
      { amount: 2350, description: 'uber', categoryId: CATEGORY_IDS.transporte },
    ],
    [
      'mercado 230',
      'registrar_despesa',
      { amount: 23000, description: 'mercado', categoryId: CATEGORY_IDS.mercado },
    ],
    ['Uber 18', 'registrar_despesa', { amount: 1800, description: 'Uber' }],
    ['netflix 55,90', 'registrar_despesa', { amount: 5590, categoryId: CATEGORY_IDS.assinaturas }],
    [
      'R$ 89,90 farmácia',
      'registrar_despesa',
      { amount: 8990, categoryId: CATEGORY_IDS.saude, description: 'farmácia' },
    ],
    ['gasolina 250', 'registrar_despesa', { amount: 25000, categoryId: CATEGORY_IDS.transporte }],
    ['torrei 80 no bar sexta', 'registrar_despesa', { amount: 8000, date: '2026-09-25', description: 'bar' }],
    [
      'almocei 35',
      'registrar_despesa',
      { amount: 3500, description: 'Almoço', categoryId: CATEGORY_IDS.restaurantes },
    ],
    [
      'abasteci 200 ontem',
      'registrar_despesa',
      { amount: 20000, date: '2026-09-30', categoryId: CATEGORY_IDS.transporte },
    ],
    [
      'paguei 1.200 de aluguel dia 5',
      'registrar_despesa',
      { amount: 120000, date: '2026-09-05', description: 'aluguel', categoryId: CATEGORY_IDS.moradia },
    ],
    [
      'gastei 1.500,00 no dentista em 3x',
      'registrar_despesa',
      { amount: 150000, installments: 3, categoryId: CATEGORY_IDS.saude, description: 'dentista' },
    ],
    [
      'gastei 40 em dinheiro no pastel',
      'registrar_despesa',
      { amount: 4000, accountId: 'acc-carteira', description: 'pastel' },
    ],
    [
      'gastei 30 no mercado livre',
      'registrar_despesa',
      { categoryId: CATEGORY_IDS.compras, description: 'mercado livre' },
    ],
    [
      'gastei 89 na academia',
      'registrar_despesa',
      { categoryId: CATEGORY_IDS.assinaturas, description: 'academia' },
    ],
    ['gastei cem reais no mercado', 'registrar_despesa', { amount: 10000, categoryId: CATEGORY_IDS.mercado }],
    [
      'paguei mil e quinhentos de aluguel',
      'registrar_despesa',
      { amount: 150000, categoryId: CATEGORY_IDS.moradia },
    ],
    ['gastei 15,90 no 99', 'registrar_despesa', { amount: 1590, categoryId: CATEGORY_IDS.transporte }],
    [
      'comprei pão 12,50 na padaria 15/09',
      'registrar_despesa',
      { amount: 1250, date: '2026-09-15', categoryId: CATEGORY_IDS.mercado },
    ],
    ['gastei 2k no notebook parcelado em 5', 'registrar_despesa', { amount: 200000, installments: 5 }],
    [
      'oi pat, gastei 20 no lanche',
      'registrar_despesa',
      { amount: 2000, categoryId: CATEGORY_IDS.restaurantes },
    ],
    [
      'paguei 100 da oi',
      'registrar_despesa',
      { amount: 10000, categoryId: CATEGORY_IDS.contas, description: 'oi' },
    ],
  ])('%s', (...c) => {
    const r = expectCase(c);
    expect(r.confidence).toBeGreaterThanOrEqual(0.55);
  });

  it('valor + verbo no passado tem confiança alta; frase curta, um pouco menos', () => {
    expect(parse('gastei 45,90 no ifood').confidence).toBeGreaterThan(parse('ifood 45,90').confidence);
  });

  it('sem descrição usa o nome da categoria', () => {
    expect(parse('gastei 15,90 no 99').entities.description).toBe('Transporte');
  });

  it('despesa sem valor vira registro incompleto com confiança baixa (o respondedor pergunta o valor)', () => {
    const r = parse('paguei a conta de luz');
    expect(r.intent).toBe('registrar_despesa');
    expect(r.entities.amount).toBeUndefined();
    expect(r.entities.categoryId).toBe(CATEGORY_IDS.contas);
    expect(r.confidence).toBeLessThanOrEqual(0.5);
  });

  it('à vista não gera parcelas', () => {
    expect(parse('comprei um tênis de 300 à vista').entities.installments).toBeUndefined();
  });

  it('usa o histórico para categorizar descrições conhecidas', () => {
    const withHistory = makeNluContext({
      transactions: [
        makeTransaction({
          accountId: 'acc-corrente',
          description: 'Padaria do Zé',
          categoryId: CATEGORY_IDS.restaurantes,
        }),
        makeTransaction({
          accountId: 'acc-corrente',
          description: 'Padaria do Zé',
          categoryId: CATEGORY_IDS.restaurantes,
        }),
      ],
    });
    const r = parseMessage('gastei 30 na padaria do zé', withHistory);
    expect(r.entities.categoryId).toBe(CATEGORY_IDS.restaurantes);
    expect(r.entities.description).toBe('padaria do zé');
    // sem histórico, "padaria" é palavra-chave de Mercado
    expect(parse('gastei 30 na padaria do zé').entities.categoryId).toBe(CATEGORY_IDS.mercado);
  });
});

describe('parseMessage — registrar receita', () => {
  it.each<Case>([
    [
      'recebi 5000 de salário',
      'registrar_receita',
      { amount: 500000, categoryId: CATEGORY_IDS.salario, description: 'salário' },
    ],
    ['caiu o salário de 5.200', 'registrar_receita', { amount: 520000, categoryId: CATEGORY_IDS.salario }],
    [
      'entrou 300 de freela',
      'registrar_receita',
      { amount: 30000, categoryId: CATEGORY_IDS.rendaExtra, description: 'freela' },
    ],
    ['salário 5000', 'registrar_receita', { amount: 500000, categoryId: CATEGORY_IDS.salario }],
    ['freela 300', 'registrar_receita', { amount: 30000, categoryId: CATEGORY_IDS.rendaExtra }],
    [
      'recebi 1.200 de aluguel',
      'registrar_receita',
      { amount: 120000, categoryId: CATEGORY_IDS.rendimentos },
    ],
    ['recebi 80 de cashback', 'registrar_receita', { amount: 8000, categoryId: CATEGORY_IDS.rendimentos }],
    ['recebi 150 de reembolso do plano', 'registrar_receita', { categoryId: CATEGORY_IDS.reembolso }],
    [
      'ganhei 200 de presente',
      'registrar_receita',
      { amount: 20000, categoryId: CATEGORY_IDS.outrosReceita },
    ],
    ['vendi meu videogame por 1500', 'registrar_receita', { amount: 150000, description: 'videogame' }],
    ['recebi 300 no pix ontem', 'registrar_receita', { amount: 30000, date: '2026-09-30' }],
    ['entrou 2 mil na poupança', 'registrar_receita', { amount: 200000, accountId: 'acc-poupanca' }],
  ])('%s', (...c) => {
    expectCase(c);
  });
});

describe('parseMessage — transferências', () => {
  it.each<Case>([
    [
      'transferi 500 da corrente para a poupança',
      'registrar_transferencia',
      { amount: 50000, accountId: 'acc-corrente', toAccountId: 'acc-poupanca' },
    ],
    [
      'passei 200 pra carteira',
      'registrar_transferencia',
      { amount: 20000, accountId: 'acc-corrente', toAccountId: 'acc-carteira' },
    ],
    [
      'transferi 300 da poupança pra corrente',
      'registrar_transferencia',
      { accountId: 'acc-poupanca', toAccountId: 'acc-corrente' },
    ],
    [
      'saquei 300',
      'registrar_transferencia',
      { amount: 30000, accountId: 'acc-corrente', toAccountId: 'acc-carteira' },
    ],
    [
      'guardei 300 na poupança',
      'registrar_transferencia',
      { accountId: 'acc-corrente', toAccountId: 'acc-poupanca' },
    ],
    [
      'resgatei 1000 da poupança',
      'registrar_transferencia',
      { accountId: 'acc-poupanca', toAccountId: 'acc-corrente' },
    ],
    [
      'paguei a fatura de 2.500',
      'registrar_transferencia',
      { amount: 250000, accountId: 'acc-corrente', toAccountId: 'acc-nubank' },
    ],
  ])('%s', (...c) => {
    expectCase(c);
  });

  it('transferência sem contas citadas deixa as contas para o usuário escolher', () => {
    const r = parse('transferi 200');
    expect(r.intent).toBe('registrar_transferencia');
    expect(r.entities.accountId).toBeUndefined();
    expect(r.entities.toAccountId).toBeUndefined();
  });

  it('entre bancos pelo nome', () => {
    const c = makeNluContext({
      accounts: [
        makeAccount({ id: 'itau', name: 'Itaú', type: 'corrente' }),
        makeAccount({ id: 'nu', name: 'Nubank', type: 'corrente' }),
        makeAccount({ id: 'nucard', name: 'Cartão Nubank', type: 'cartao_credito' }),
      ],
    });
    expect(parseMessage('transferi 500 do itaú para o nubank', c).entities).toMatchObject({
      accountId: 'itau',
      toAccountId: 'nu',
    });
    expect(parseMessage('paguei a fatura do nubank de 900 pelo itaú', c).entities).toMatchObject({
      accountId: 'itau',
      toAccountId: 'nucard',
    });
  });

  it('"mandei 50 pro joão" (sem conta de destino) é despesa', () => {
    expect(parse('mandei 50 pro joão')).toMatchObject({
      intent: 'registrar_despesa',
      entities: { amount: 5000, description: 'joão' },
    });
  });
});

describe('parseMessage — consultas', () => {
  it.each<Case>([
    [
      'quanto gastei com mercado este mês?',
      'consultar_gastos',
      { categoryId: CATEGORY_IDS.mercado, period: THIS_MONTH },
    ],
    [
      'quanto gastei com mercado este mês',
      'consultar_gastos',
      { categoryId: CATEGORY_IDS.mercado, period: THIS_MONTH },
    ],
    [
      'QUANTO GASTEI COM MERCADO ESTE MES',
      'consultar_gastos',
      { categoryId: CATEGORY_IDS.mercado, period: THIS_MONTH },
    ],
    [
      'gastos com restaurante em setembro',
      'consultar_gastos',
      { categoryId: CATEGORY_IDS.restaurantes, period: SEPTEMBER },
    ],
    ['qto gastei hj?', 'consultar_gastos', { period: { start: TODAY, end: TODAY, label: 'hoje' } }],
    ['quato gastei no mercado', 'consultar_gastos', { categoryId: CATEGORY_IDS.mercado }],
    ['quanto paguei de luz em agosto?', 'consultar_gastos', { categoryId: CATEGORY_IDS.contas }],
    [
      'quanto gastei no cartão nubank em setembro?',
      'consultar_gastos',
      { accountId: 'acc-nubank', period: SEPTEMBER },
    ],
    [
      'quanto gastei com uber nos últimos 30 dias',
      'consultar_gastos',
      { categoryId: CATEGORY_IDS.transporte },
    ],
    [
      'oi pat, quanto gastei hoje?',
      'consultar_gastos',
      { period: { start: TODAY, end: TODAY, label: 'hoje' } },
    ],
    [
      'quanto gastei dia 15?',
      'consultar_gastos',
      { period: { start: '2026-09-15', end: '2026-09-15', label: '15/09/2026' } },
    ],
    ['quanto ganhei esse mês', 'consultar_receitas', { period: THIS_MONTH }],
    [
      'quanto recebi de freela em setembro',
      'consultar_receitas',
      { categoryId: CATEGORY_IDS.rendaExtra, period: SEPTEMBER },
    ],
    [
      'quanto rendeu minha poupança',
      'consultar_receitas',
      { categoryId: CATEGORY_IDS.rendimentos, accountId: 'acc-poupanca' },
    ],
    ['qual meu saldo?', 'consultar_saldo'],
    ['qual meu saldo', 'consultar_saldo'],
    ['saldo', 'consultar_saldo'],
    ['quanto tenho na poupança', 'consultar_saldo', { accountId: 'acc-poupanca' }],
    ['saldo do nubank', 'consultar_saldo', { accountId: 'acc-nubank' }],
    ['qto tenho na carteira?', 'consultar_saldo', { accountId: 'acc-carteira' }],
    ['resumo do mês', 'resumo_mes', { period: THIS_MONTH }],
    ['como estou este mês?', 'resumo_mes', { period: THIS_MONTH }],
    ['como to esse mes', 'resumo_mes', { period: THIS_MONTH }],
    ['como foi o mês passado', 'resumo_mes', { period: LAST_MONTH }],
    ['compara com o mês passado', 'comparar_meses', { period: LAST_MONTH }],
    ['gastei mais que mês passado?', 'comparar_meses', { period: LAST_MONTH }],
    ['comparar gastos com mercado', 'comparar_meses', { categoryId: CATEGORY_IDS.mercado }],
    ['onde estou gastando mais?', 'maiores_gastos'],
    ['maiores gastos', 'maiores_gastos'],
    ['com o que eu mais gasto?', 'maiores_gastos'],
    ['pra onde está indo meu dinheiro?', 'maiores_gastos'],
    ['como está meu orçamento?', 'status_orcamento'],
    ['qual o meu orcamneto', 'status_orcamento'],
    ['estourei o orçamento?', 'status_orcamento'],
    ['quanto posso gastar com lazer?', 'status_orcamento', { categoryId: CATEGORY_IDS.lazer }],
  ])('%s', (...c) => {
    const r = expectCase(c);
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('consulta sem valor não é registro, mesmo com verbo no passado', () => {
    expect(parse('quanto gastei ontem?').intent).toBe('consultar_gastos');
    expect(parse('gastei muito esse mês?').intent).toBe('consultar_gastos');
  });
});

describe('parseMessage — orçamento e metas', () => {
  it.each<Case>([
    [
      'definir orçamento de 800 para mercado',
      'definir_orcamento',
      { amount: 80000, categoryId: CATEGORY_IDS.mercado, budgetMonth: null },
    ],
    [
      'quero gastar no máximo 500 com restaurantes por mês',
      'definir_orcamento',
      { amount: 50000, categoryId: CATEGORY_IDS.restaurantes, budgetMonth: null },
    ],
    [
      'limite de 300 em lazer este mês',
      'definir_orcamento',
      { amount: 30000, categoryId: CATEGORY_IDS.lazer, budgetMonth: '2026-10' },
    ],
    ['orçamento de 400 pra transporte só este mês', 'definir_orcamento', { budgetMonth: '2026-10' }],
    ['limite de 600 no mercado mês que vem', 'definir_orcamento', { budgetMonth: '2026-11' }],
    [
      'orçamento de 200 para pets em janeiro',
      'definir_orcamento',
      { categoryId: CATEGORY_IDS.pets, budgetMonth: '2027-01' },
    ],
    ['teto de 1.000 pra compras todo mês', 'definir_orcamento', { amount: 100000, budgetMonth: null }],
    [
      'criar meta viagem de 10 mil até dezembro de 2027',
      'criar_meta',
      { name: 'Viagem', amount: 1000000, targetDate: '2027-12-31' },
    ],
    [
      'quero juntar 5000 para um notebook em 8 meses',
      'criar_meta',
      { name: 'Notebook', amount: 500000, months: 8, targetDate: '2027-06-01' },
    ],
    ['nova meta: carro de 50 mil em 2 anos', 'criar_meta', { name: 'Carro', amount: 5000000, months: 24 }],
    [
      'meta reserva de emergência de 20 mil até o fim do ano',
      'criar_meta',
      { name: 'Reserva de emergência', amount: 2000000, targetDate: '2026-12-31' },
    ],
    [
      'criar meta casa na praia de 300 mil até 2035',
      'criar_meta',
      { name: 'Casa', amount: 30000000, targetDate: '2035-12-31' },
    ],
    ['quero guardar 3 mil para o natal', 'criar_meta', { amount: 300000, targetDate: '2026-12-25' }],
    [
      'criar uma meta de 8 mil para intercâmbio até julho',
      'criar_meta',
      { name: 'Intercâmbio', targetDate: '2027-07-31' },
    ],
    ['como estão minhas metas?', 'status_metas'],
    ['quanto falta para a meta viagem?', 'status_metas', { goalId: 'goal-viagem' }],
    ['guardei 300 na meta viagem', 'aportar_meta', { amount: 30000, goalId: 'goal-viagem' }],
    ['aportar 200 na meta carro', 'aportar_meta', { amount: 20000, goalId: 'goal-carro' }],
    ['depositei 400 na meta carro novo', 'aportar_meta', { amount: 40000, goalId: 'goal-carro' }],
    ['300 na meta viagem', 'aportar_meta', { amount: 30000, goalId: 'goal-viagem' }],
    ['coloquei 150 na reserva de emergência', 'aportar_meta', { amount: 15000, goalId: 'goal-reserva' }],
  ])('%s', (...c) => {
    expectCase(c);
  });

  it('"criar meta" sem dados ainda é criar_meta (o respondedor pergunta o resto)', () => {
    const r = parse('criar meta');
    expect(r.intent).toBe('criar_meta');
    expect(r.entities.amount).toBeUndefined();
  });
});

describe('parseMessage — diagnóstico, planejamento e outros', () => {
  it.each<Case>([
    ['minhas dívidas', 'status_dividas'],
    ['quanto eu devo?', 'status_dividas'],
    ['quanto devo no total', 'status_dividas'],
    ['como quitar minhas dívidas?', 'plano_dividas'],
    ['plano para sair das dívidas', 'plano_dividas'],
    ['devo pagar a dívida do cartão primeiro?', 'plano_dividas'],
    ['tenho 800 por mês para quitar as dívidas', 'plano_dividas', { amount: 80000 }],
    ['meu patrimônio', 'patrimonio'],
    ['quanto eu valho?', 'patrimonio'],
    ['reserva de emergência', 'reserva_emergencia'],
    ['minha reserva está boa?', 'reserva_emergencia'],
    ['minha saúde financeira', 'saude_financeira'],
    ['nota das minhas finanças', 'saude_financeira'],
    ['como estão minhas finanças', 'saude_financeira'],
    ['previsão do mês', 'previsao', { period: THIS_MONTH }],
    ['vou fechar o mês no azul?', 'previsao'],
    ['quanto vai sobrar?', 'previsao'],
    ['tô no vermelho?', 'previsao'],
    [
      'posso gastar 300 num tênis?',
      'posso_gastar',
      { amount: 30000, description: 'tênis', categoryId: CATEGORY_IDS.compras },
    ],
    [
      'consigo comprar um celular de 2000 em 10x?',
      'posso_gastar',
      { amount: 200000, installments: 10, categoryId: CATEGORY_IDS.compras, description: 'celular' },
    ],
    ['dá pra comprar uma geladeira de 3 mil?', 'posso_gastar', { amount: 300000, description: 'geladeira' }],
    ['da pra comprar um fone de 150', 'posso_gastar', { amount: 15000 }],
    ['e se eu comprar um notebook de 4 mil?', 'posso_gastar', { amount: 400000, description: 'notebook' }],
    [
      'vale a pena parcelar uma viagem de 6 mil em 12x?',
      'posso_gastar',
      { amount: 600000, installments: 12 },
    ],
    ['quanto posso gastar hoje?', 'posso_gastar'],
    ['contas a pagar', 'contas_a_pagar'],
    [
      'o que vence esta semana?',
      'contas_a_pagar',
      { period: { start: '2026-09-28', end: '2026-10-04', label: 'esta semana' } },
    ],
    ['tenho boletos pra pagar?', 'contas_a_pagar'],
    ['minhas assinaturas', 'assinaturas'],
    ['quais são meus gastos fixos', 'assinaturas'],
    ['dicas', 'dicas'],
    ['como economizar?', 'dicas'],
    ['me ajuda a economizar', 'dicas'],
    ['relatório do mês', 'relatorio', { period: THIS_MONTH }],
    ['fechamento de setembro', 'relatorio', { period: SEPTEMBER }],
    ['ajuda', 'ajuda'],
    ['o que você sabe fazer?', 'ajuda'],
    ['me ajuda', 'ajuda'],
    ['oi', 'saudacao'],
    ['oii', 'saudacao'],
    ['bom dia', 'saudacao'],
    ['boa noite!', 'saudacao'],
    ['olá pat', 'saudacao'],
    ['e aí, tudo bem?', 'saudacao'],
    ['obrigado', 'agradecimento'],
    ['valeu', 'agradecimento'],
    ['vlw pat', 'agradecimento'],
    ['muito obrigada!', 'agradecimento'],
    ['beleza, obrigado', 'agradecimento'],
  ])('%s', (...c) => {
    expectCase(c);
  });

  it('confirmação curta ("ok") é agradecimento com confiança menor', () => {
    const r = parse('ok');
    expect(r.intent).toBe('agradecimento');
    expect(r.confidence).toBeLessThan(parse('obrigado').confidence);
  });
});

describe('parseMessage — continuação e desconhecido', () => {
  it.each<[string, ParsedEntities]>([
    ['e no mês passado?', { period: LAST_MONTH }],
    ['e com lazer?', { categoryId: CATEGORY_IDS.lazer }],
    ['e em setembro?', { period: SEPTEMBER }],
    ['e o mercado?', { categoryId: CATEGORY_IDS.mercado }],
    ['e na poupança?', { accountId: 'acc-poupanca' }],
    ['e ontem?', { period: { start: '2026-09-30', end: '2026-09-30', label: 'ontem' } }],
    ['mês passado', { period: LAST_MONTH }],
  ])('"%s" => desconhecido com entidades para completar com o estado da conversa', (text, entities) => {
    const r = parse(text);
    expect(r.intent).toBe('desconhecido');
    expect(r.confidence).toBeLessThanOrEqual(0.3);
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.entities).toMatchObject(entities);
  });

  it.each(['asdfgh qwerty', 'xyz', 'lorem ipsum dolor', '???', '   ', ''])(
    'texto sem sentido: "%s"',
    (text) => {
      const r = parse(text);
      expect(r.intent).toBe('desconhecido');
      expect(r.confidence).toBeLessThanOrEqual(0.05);
      expect(r.entities).toEqual({});
    },
  );

  it('nunca lança e preserva raw/normalized', () => {
    const r = parseMessage('  Quanto GASTEI com Mercado?  ', ctx);
    expect(r.raw).toBe('  Quanto GASTEI com Mercado?  ');
    expect(r.normalized).toBe('quanto gastei com mercado?');
    expect(() => parseMessage(undefined as unknown as string, ctx)).not.toThrow();
    expect(parseMessage(undefined as unknown as string, ctx).intent).toBe('desconhecido');
  });

  it('funciona sem contas, metas e histórico', () => {
    const empty = makeNluContext({ accounts: [], goals: [], transactions: undefined });
    expect(parseMessage('transferi 500 da corrente para a poupança', empty)).toMatchObject({
      intent: 'registrar_transferencia',
      entities: { amount: 50000 },
    });
    expect(parseMessage('guardei 300 na meta viagem', empty).intent).toBe('aportar_meta');
    expect(parseMessage('gastei 10 no café', empty).entities.categoryId).toBe(CATEGORY_IDS.restaurantes);
  });

  it('é determinística', () => {
    expect(parse('gastei 45,90 no ifood ontem')).toEqual(parse('gastei 45,90 no ifood ontem'));
  });
});

/* ------------------------------------------------------------------ */
/* Regressões da revisão do agente                                    */
/* ------------------------------------------------------------------ */

const AUGUST = { start: '2026-08-01', end: '2026-08-31', label: 'agosto de 2026' };

describe('parseMessage — regressões: correção ortográfica não troca palavras comuns', () => {
  it('"maior" não vira "maio" e "maior gasto" é maiores_gastos sem período', () => {
    expect(parse('qual meu maior gasto?')).toMatchObject({ intent: 'maiores_gastos', entities: {} });
    expect(parse('qual meu maior gasto?').entities.period).toBeUndefined();
    expectCase(['qual foi meu maior gasto este mês?', 'maiores_gastos', { period: THIS_MONTH }]);
    const r = expectCase(['maior despesa do mês', 'maiores_gastos', { period: THIS_MONTH }]);
    expect(r.entities.categoryId).toBeUndefined();
  });

  it('"junto" não vira "junho"; "vender" não vira "vencer"', () => {
    const r = parse('quanto gastamos junto?');
    expect(r.intent).toBe('consultar_gastos');
    expect(r.entities.period).toBeUndefined();
    expect(parse('quero vender meu carro').intent).not.toBe('contas_a_pagar');
  });

  it('"recebo 9650 dia 5" (hábito no presente) não vira receita registrada', () => {
    const r = parse('recebo 9650 dia 5');
    expect(r.intent).not.toBe('registrar_receita');
    expect(r.entities).toMatchObject({ amount: 965000, habitual: true });
  });
});

describe('parseMessage — regressões: "despesas"/"receitas" genéricas', () => {
  it.each<Case>([
    ['despesas do mes passado', 'consultar_gastos', { period: LAST_MONTH }],
    ['minhas despesas', 'consultar_gastos'],
    ['total de despesas este mês', 'consultar_gastos', { period: THIS_MONTH }],
    ['receitas do mês passado', 'consultar_receitas', { period: LAST_MONTH }],
    ['quais minhas receitas?', 'consultar_receitas'],
  ])('%s => sem filtrar "Outras despesas/receitas"', (...c) => {
    expect(expectCase(c).entities.categoryId).toBeUndefined();
  });
});

describe('parseMessage — regressões: pagamento de fatura', () => {
  it('valor entre o verbo e "fatura" continua sendo pagamento (transferência), não despesa no cartão', () => {
    expectCase([
      'paguei 3907,96 da fatura do cartão',
      'registrar_transferencia',
      { amount: 390796, accountId: 'acc-corrente', toAccountId: 'acc-nubank' },
    ]);
  });

  it('"paguei a fatura" sem valor abre o registro do pagamento', () => {
    const r = expectCase(['paguei a fatura', 'registrar_transferencia', { toAccountId: 'acc-nubank' }]);
    expect(r.entities.amount).toBeUndefined();
  });

  it('"fatura" longe do verbo não transforma uma compra em pagamento', () => {
    expect(parse('paguei 50 no uber, vai pra fatura de novembro').intent).toBe('registrar_despesa');
  });
});

describe('parseMessage — regressões: "N x de V" é o valor da parcela', () => {
  it.each<Case>([
    ['comprei um fone em 10x de 50', 'registrar_despesa', { amount: 50000, installments: 10 }],
    ['parcelei o celular em 12x de 100', 'registrar_despesa', { amount: 120000, installments: 12 }],
    ['comprei uma tv em 10 parcelas de 300', 'registrar_despesa', { amount: 300000, installments: 10 }],
    ['comprei uma tv de 3 mil em 10x de 300', 'registrar_despesa', { amount: 300000, installments: 10 }],
  ])('%s', (...c) => {
    expectCase(c);
  });
});

describe('parseMessage — regressões: pedidos de registro sem valor', () => {
  it.each<Case>([
    ['recebi o salário', 'registrar_receita', { categoryId: CATEGORY_IDS.salario }],
    ['recebi um freela', 'registrar_receita'],
    ['transferi pra poupança', 'registrar_transferencia', { accountId: 'acc-corrente', toAccountId: 'acc-poupanca' }],
    ['definir orçamento para mercado', 'definir_orcamento', { categoryId: CATEGORY_IDS.mercado }],
    ['guardei na meta viagem', 'aportar_meta', { goalId: 'goal-viagem' }],
  ])('%s', (...c) => {
    expect(expectCase(c).entities.amount).toBeUndefined();
  });

  it('perguntas continuam sendo consultas', () => {
    expect(parse('recebi o salário este mês?').intent).toBe('consultar_receitas');
    expect(parse('quanto falta guardar na meta viagem?').intent).toBe('status_metas');
  });
});

describe('parseMessage — regressões: ordinais e dias da semana numerados', () => {
  it.each<Case>([
    ['recebi o 13º salário de 4800', 'registrar_receita', { amount: 480000, categoryId: CATEGORY_IDS.salario }],
    ['recebi o 13º de 4800', 'registrar_receita', { amount: 480000 }],
    ['caiu a 1ª parcela do 13º 2400', 'registrar_receita', { amount: 240000 }],
  ])('%s', (...c) => {
    expectCase(c);
  });

  it('"3ª feira" é terça-feira (data), não "feira" (Mercado)', () => {
    const r = expectCase(['paguei 30 na 3ª feira', 'registrar_despesa', { amount: 3000, date: '2026-09-29' }]);
    expect(r.entities.categoryId).not.toBe(CATEGORY_IDS.mercado);
  });
});

describe('parseMessage — regressões: quantidade antes do preço', () => {
  it.each<Case>([
    ['comprei 2 pizzas de 40', 'registrar_despesa', { amount: 4000, quantity: 2, description: 'pizzas' }],
    ['comprei 3 cervejas por 15', 'registrar_despesa', { amount: 1500, quantity: 3 }],
    ['2 cafés de 8', 'registrar_despesa', { amount: 800, quantity: 2 }],
  ])('%s', (...c) => {
    expectCase(c);
  });

  it('"gastei 50 no mercado" não é quantidade', () => {
    expect(parse('gastei 50 no mercado e 30 na farmácia').entities).toMatchObject({ amount: 5000 });
    expect(parse('gastei 50 no mercado').entities.quantity).toBeUndefined();
  });
});

describe('parseMessage — regressões: comparação entre dois meses citados', () => {
  it('"compara setembro com agosto" guarda os dois meses (o mais antigo em period)', () => {
    expectCase(['compara setembro com agosto', 'comparar_meses', { period: AUGUST, comparePeriod: SEPTEMBER }]);
    expectCase(['agosto vs setembro', 'comparar_meses', { period: AUGUST, comparePeriod: SEPTEMBER }]);
  });

  it('um mês só continua sem comparePeriod', () => {
    expect(parse('compara com o mês passado').entities.comparePeriod).toBeUndefined();
  });
});

describe('parseMessage — regressões: fatura, limite e dívida do cartão', () => {
  it.each(['qual a fatura do cartão?', 'quanto está a fatura?', 'fatura do cartão', 'quanto deu a fatura?', 'quanto tenho de limite no cartão?', 'limite do cartão', 'quanto devo no cartão?', 'estou devendo no cartão', 'quando vence a fatura?'])(
    '%s => consultar_saldo do cartão',
    (text) => {
      expect(parse(text)).toMatchObject({ intent: 'consultar_saldo', entities: { accountId: 'acc-nubank' } });
    },
  );

  it('"limite" sem cartão continua sendo orçamento', () => {
    expect(parse('qual o limite de mercado?').intent).toBe('status_orcamento');
  });
});

describe('parseMessage — regressões: datas', () => {
  it('"gastei 80 dia 20/09": "dia" faz parte da data e o valor não some', () => {
    const r = expectCase(['gastei 80 dia 20/09', 'registrar_despesa', { amount: 8000, date: '2026-09-20' }]);
    expect(r.entities.description).toBeUndefined();
  });

  it.each<[string, string]>([
    ['gastei 300 no mercado mês passado', '2026-09-30'],
    ['gastei 300 no mercado em setembro', '2026-09-30'],
    ['gastei 300 no mercado semana passada', '2026-09-27'],
    ['almocei por 32 reais semana passada', '2026-09-27'],
  ])('período passado no registro vira data aproximada: %s', (text, date) => {
    expect(parse(text).entities).toMatchObject({ date, dateApprox: true });
  });

  it('mês como complemento ("aluguel de setembro") não vira data', () => {
    const r = parse('paguei 2200 do aluguel de setembro');
    expect(r.entities.date).toBeUndefined();
    expect(r.entities.dateApprox).toBeUndefined();
  });
});

describe('parseMessage — regressões: vários lançamentos, retiradas e centavos', () => {
  it('o segundo lançamento sai da descrição/categoria e vai para otherEntries', () => {
    expectCase([
      'gastei 50 no mercado e 30 na farmácia',
      'registrar_despesa',
      { amount: 5000, categoryId: CATEGORY_IDS.mercado, description: 'mercado', otherEntries: ['30 na farmácia'] },
    ]);
    expectCase([
      'gastei 50 no mercado ontem e hoje 30 no uber',
      'registrar_despesa',
      { amount: 5000, date: '2026-09-30', description: 'mercado', otherEntries: ['hoje 30 no uber'] },
    ]);
  });

  it.each<Case>([
    ['tirei 200 da poupança', 'registrar_transferencia', { amount: 20000, accountId: 'acc-poupanca', toAccountId: 'acc-corrente' }],
    ['puxei 100 da poupança pra conta', 'registrar_transferencia', { amount: 10000, accountId: 'acc-poupanca', toAccountId: 'acc-corrente' }],
    ['retirei 50 da carteira pra corrente', 'registrar_transferencia', { accountId: 'acc-carteira', toAccountId: 'acc-corrente' }],
  ])('%s', (...c) => {
    expectCase(c);
  });

  it.each<[string, number, string | undefined]>([
    ['gastei 45 reais e 90 centavos no mercado', 4590, 'mercado'],
    ['gastei 45 reais com 90 centavos', 4590, undefined],
    ['gastei 50 reais e 30 centavos na farmácia', 5030, 'farmácia'],
    ['gastei cinquenta reais e trinta centavos na farmácia', 5030, 'farmácia'],
  ])('centavos por extenso: %s', (text, amount, description) => {
    const r = parse(text);
    expect(r.entities.amount).toBe(amount);
    expect(r.entities.description).toBe(description);
  });
});

describe('parseMessage — regressões: categorias, termos e descrições', () => {
  it('"conta" isolada não é a categoria Contas da casa', () => {
    expect(parse('me conta uma piada').entities.categoryId).toBeUndefined();
    expect(parse('tenho dinheiro pra pagar as contas?').intent).toBe('contas_a_pagar');
    expect(parse('paguei 120 da conta de luz').entities.categoryId).toBe(CATEGORY_IDS.contas);
  });

  it('"conserto do carro" é Transporte (o veículo vence o serviço)', () => {
    expect(parse('gastei 2 mil no conserto do carro').entities.categoryId).toBe(CATEGORY_IDS.transporte);
    expect(parse('paguei 300 no conserto do chuveiro').entities.categoryId).toBe(CATEGORY_IDS.moradia);
  });

  it('estabelecimento citado na consulta vira termo; o nome da categoria não', () => {
    expect(parse('quanto gastei com ifood?').entities).toMatchObject({ categoryId: CATEGORY_IDS.restaurantes, term: 'ifood' });
    expect(parse('quanto gastei com uber nos ultimos 3 meses').entities.term).toBe('uber');
    expect(parse('quanto gastei com restaurante?').entities.term).toBeUndefined();
    expect(parse('quanto gastei com mercado este mês?').entities.term).toBeUndefined();
  });

  it.each<[string, string]>([
    ['gastie 50 no mercado', 'mercado'],
    ['paguie 40 de uber', 'uber'],
    ['gastei 30 às 14h no almoço', 'almoço'],
  ])('descrição sem verbo com erro e sem hora: %s', (text, description) => {
    expect(parse(text).entities.description).toBe(description);
  });

  it('posso_gastar com verbo no infinitivo: "viajar" vira "Viagem"', () => {
    expect(parse('dá pra viajar gastando 5 mil?').entities).toMatchObject({ amount: 500000, description: 'Viagem' });
  });

  it('descrição longa é cortada em ~60 caracteres', () => {
    const r = parse(`gastei 50 no mercado ${'muito '.repeat(500)}`);
    expect(r.entities.description?.length).toBeLessThanOrEqual(60);
  });
});

describe('parseMessage — regressões: continuações', () => {
  it('"e em 10x?" traz as parcelas como entidade da continuação', () => {
    const r = parse('e em 10x?');
    expect(r.intent).toBe('desconhecido');
    expect(r.entities.installments).toBe(10);
    expect(r.confidence).toBeGreaterThanOrEqual(0.2);
  });

  it('frase longa com uma entidade solta não é continuação', () => {
    expect(parse('quero saber uma coisa sobre o mercado da esquina').confidence).toBeLessThan(0.2);
  });
});

describe('parseMessage — regressões: pagamento de fatura com o verbo longe', () => {
  it('"paguei hoje de manhã os 3907,96 da fatura do cartão" ainda é pagamento', () => {
    expectCase([
      'paguei hoje de manhã os 3907,96 da fatura do cartão',
      'registrar_transferencia',
      { amount: 390796, toAccountId: 'acc-nubank', accountId: 'acc-corrente' },
    ]);
  });

  it('compra com categoria no cartão continua sendo despesa', () => {
    expect(parse('paguei 50 no uber no cartão, vai pra fatura').intent).toBe('registrar_despesa');
  });
});
