import { describe, expect, it } from 'vitest';
import { CATEGORY_IDS } from '@/domain/defaults';
import { makeAccount, makeData, makeGoal } from '@/test/factories';
import { matchAccount, matchCategory, matchGoal } from './entities';

const { categories } = makeData();

describe('matchCategory', () => {
  it.each([
    ['ifood', CATEGORY_IDS.restaurantes],
    ['comida fora', CATEGORY_IDS.restaurantes],
    ['restaurante', CATEGORY_IDS.restaurantes],
    ['restaurantes', CATEGORY_IDS.restaurantes],
    ['Restaurantes e delivery', CATEGORY_IDS.restaurantes],
    ['pizza com os amigos', CATEGORY_IDS.restaurantes],
    ['supermercado', CATEGORY_IDS.mercado],
    ['mercado', CATEGORY_IDS.mercado],
    ['compras do mês', CATEGORY_IDS.mercado],
    ['fiz compras no mercado', CATEGORY_IDS.mercado],
    ['gasolina', CATEGORY_IDS.transporte],
    ['uber', CATEGORY_IDS.transporte],
    ['corrida de 99', CATEGORY_IDS.transporte],
    ['academia', CATEGORY_IDS.assinaturas],
    ['netflix', CATEGORY_IDS.assinaturas],
    ['amazon prime', CATEGORY_IDS.assinaturas],
    ['aluguel', CATEGORY_IDS.moradia],
    ['condomínio', CATEGORY_IDS.moradia],
    ['conta de luz', CATEGORY_IDS.contas],
    ['luz', CATEGORY_IDS.contas],
    ['internet', CATEGORY_IDS.contas],
    ['farmácia', CATEGORY_IDS.saude],
    ['remédios', CATEGORY_IDS.saude],
    ['plano de saúde', CATEGORY_IDS.saude],
    ['curso de inglês', CATEGORY_IDS.educacao],
    ['IPVA', CATEGORY_IDS.transporte],
    ['imposto de renda', CATEGORY_IDS.impostos],
    ['cinema', CATEGORY_IDS.lazer],
    ['lazer', CATEGORY_IDS.lazer],
    ['passagem aérea', CATEGORY_IDS.lazer],
    ['passagem de ônibus', CATEGORY_IDS.transporte],
    ['mercado livre', CATEGORY_IDS.compras],
    ['tênis novo', CATEGORY_IDS.compras],
    ['comprei um celular', CATEGORY_IDS.compras],
    ['barbearia', CATEGORY_IDS.cuidados],
    ['ração do cachorro', CATEGORY_IDS.pets],
    ['dízimo', CATEGORY_IDS.doacoes],
    ['tesouro direto', CATEGORY_IDS.investimentos],
    ['parcela do empréstimo', CATEGORY_IDS.dividas],
  ])('despesa: "%s"', (text, id) => {
    expect(matchCategory(text, categories, 'despesa')?.categoryId).toBe(id);
  });

  it.each([
    ['salário', CATEGORY_IDS.salario],
    ['holerite', CATEGORY_IDS.salario],
    ['freela', CATEGORY_IDS.rendaExtra],
    ['renda extra', CATEGORY_IDS.rendaExtra],
    ['uber', CATEGORY_IDS.rendaExtra],
    ['aluguel', CATEGORY_IDS.rendimentos],
    ['dividendos', CATEGORY_IDS.rendimentos],
    ['juros', CATEGORY_IDS.rendimentos],
    ['reembolso', CATEGORY_IDS.reembolso],
    ['presente', CATEGORY_IDS.outrosReceita],
  ])('receita: "%s"', (text, id) => {
    expect(matchCategory(text, categories, 'receita')?.categoryId).toBe(id);
  });

  it('respeita kind: palavras de receita não casam com despesas', () => {
    expect(matchCategory('salário', categories, 'despesa')).toBeNull();
    expect(matchCategory('juros', categories, 'despesa')?.categoryId).toBe(CATEGORY_IDS.dividas);
  });

  it('sem kind, empate entre despesa e receita fica com a despesa', () => {
    expect(matchCategory('uber', categories)?.categoryId).toBe(CATEGORY_IDS.transporte);
    expect(matchCategory('aluguel', categories)?.categoryId).toBe(CATEGORY_IDS.moradia);
  });

  it('nome completo tem confiança máxima; palavra-chave, um pouco menos', () => {
    expect(matchCategory('Mercado', categories)?.confidence).toBe(1);
    expect(matchCategory('ifood', categories)?.confidence).toBeCloseTo(0.8);
  });

  it.each([
    ['restaurnte', CATEGORY_IDS.restaurantes],
    ['supermecado', CATEGORY_IDS.mercado],
    ['farmcia', CATEGORY_IDS.saude],
    ['academya', CATEGORY_IDS.assinaturas],
  ])('tolera erro de digitação: "%s"', (text, id) => {
    const r = matchCategory(text, categories, 'despesa');
    expect(r?.categoryId).toBe(id);
    expect(r?.confidence).toBeLessThan(0.8);
  });

  it('palavras-chave curtas exigem palavra inteira', () => {
    expect(matchCategory('saldo', categories, 'despesa')).toBeNull();
    expect(matchCategory('timbre', categories, 'despesa')).toBeNull();
    expect(matchCategory('oi', categories, 'despesa')?.categoryId).toBe(CATEGORY_IDS.contas);
  });

  it('ignora categorias arquivadas', () => {
    const archived = categories.map((c) => (c.id === CATEGORY_IDS.pets ? { ...c, archived: true } : c));
    expect(matchCategory('ração', archived, 'despesa')).toBeNull();
  });

  it('usa nome e palavras-chave de categorias criadas pelo usuário', () => {
    const custom = [
      ...categories,
      {
        ...categories[0],
        id: 'cat-bebe',
        name: 'Bebê',
        keywords: ['fralda', 'pediatra'],
      },
    ];
    expect(matchCategory('fraldas', custom, 'despesa')?.categoryId).toBe('cat-bebe');
    expect(matchCategory('gastos com o bebê', custom, 'despesa')?.categoryId).toBe('cat-bebe');
  });

  it.each(['', 'blá blá', 'quanto gastei'])('nada encontrado: "%s"', (text) => {
    expect(matchCategory(text, categories, 'despesa')).toBeNull();
  });
});

describe('matchAccount', () => {
  const accounts = [
    makeAccount({ id: 'itau', name: 'Itaú', type: 'corrente' }),
    makeAccount({ id: 'nu', name: 'Nubank', type: 'corrente' }),
    makeAccount({ id: 'nucard', name: 'Cartão Nubank', type: 'cartao_credito' }),
    makeAccount({ id: 'poup', name: 'Poupança Caixa', type: 'poupanca' }),
    makeAccount({ id: 'cart', name: 'Carteira', type: 'carteira' }),
    makeAccount({ id: 'xp', name: 'XP', type: 'investimento' }),
    makeAccount({ id: 'brad', name: 'Bradesco', type: 'corrente', archived: true }),
  ];

  it.each([
    ['no itaú', 'itau'],
    ['itau', 'itau'],
    ['saldo do nubank', 'nu'],
    ['no cartão nubank', 'nucard'],
    ['fatura do nubank', 'nucard'],
    ['no cartão de crédito', 'nucard'],
    ['no crédito', 'nucard'],
    ['na poupança', 'poup'],
    ['na caixa', 'poup'],
    ['na carteira', 'cart'],
    ['em dinheiro', 'cart'],
    ['em espécie', 'cart'],
    ['na XP', 'xp'],
    ['nos investimentos', 'xp'],
    ['nubak', 'nu'],
  ])('"%s" => %s', (text, id) => {
    expect(matchAccount(text, accounts)?.accountId).toBe(id);
  });

  it('nome + tipo vence só o nome', () => {
    expect(matchAccount('cartão nubank', accounts)?.confidence).toBeGreaterThan(
      matchAccount('nubank', accounts)?.confidence ?? 1,
    );
  });

  it('só o tipo: confiança 0,7 quando há uma única conta do tipo', () => {
    expect(
      matchAccount('na poupança', [makeAccount({ id: 'p', name: 'Reserva', type: 'poupanca' })]),
    ).toEqual({
      accountId: 'p',
      confidence: 0.7,
    });
  });

  it('só o tipo com várias contas do tipo: a primeira da lista, com confiança menor', () => {
    const two = [
      makeAccount({ id: 'c1', name: 'Visa', type: 'cartao_credito' }),
      makeAccount({ id: 'c2', name: 'Master', type: 'cartao_credito' }),
    ];
    expect(matchAccount('no cartão', two)).toEqual({ accountId: 'c1', confidence: 0.55 });
  });

  it('ignora contas arquivadas e textos sem conta', () => {
    expect(matchAccount('no bradesco', accounts)).toBeNull();
    expect(matchAccount('conta de luz', accounts)).toBeNull();
    expect(matchAccount('quanto dinheiro eu tenho', accounts)).toBeNull();
    expect(matchAccount('', accounts)).toBeNull();
  });
});

describe('matchGoal', () => {
  const goals = [
    makeGoal({ id: 'viagem', name: 'Viagem para Portugal' }),
    makeGoal({ id: 'carro', name: 'Carro novo' }),
    makeGoal({ id: 'reserva', name: 'Reserva de emergência' }),
    makeGoal({ id: 'velha', name: 'Notebook', status: 'concluida' }),
  ];

  it.each([
    ['meta viagem para portugal', 'viagem'],
    ['na meta viagem', 'viagem'],
    ['portugal', 'viagem'],
    ['meta carro', 'carro'],
    ['carro novo', 'carro'],
    ['reserva de emergência', 'reserva'],
    ['reserva', 'reserva'],
    ['viagme', 'viagem'],
    ['notebook', 'velha'],
  ])('"%s" => %s', (text, id) => {
    expect(matchGoal(text, goals)?.goalId).toBe(id);
  });

  it('meta concluída tem confiança menor que uma ativa', () => {
    const r = matchGoal('notebook', goals);
    expect(r?.confidence).toBeLessThan(0.85);
  });

  it('"meta" sem nome escolhe a única meta ativa', () => {
    const one = [makeGoal({ id: 'unica', name: 'Casa própria' })];
    expect(matchGoal('guardei 100 na meta', one)).toEqual({ goalId: 'unica', confidence: 0.5 });
    expect(matchGoal('guardei 100 na meta', goals)).toBeNull();
  });

  it('nada encontrado', () => {
    expect(matchGoal('bicicleta', goals)).toBeNull();
    expect(matchGoal('', goals)).toBeNull();
  });
});
