import { describe, expect, it } from 'vitest';
import { CATEGORY_IDS } from '@/domain/defaults';
import { makeData, makeTransaction } from '@/test/factories';
import { descriptionKey, suggestCategory } from './categorizer';

const { categories } = makeData();
const tx = (
  description: string,
  categoryId: string | null,
  date = '2026-09-10',
  type: 'despesa' | 'receita' | 'transferencia' = 'despesa',
) => makeTransaction({ accountId: 'acc-1', description, categoryId, date, type });

describe('descriptionKey', () => {
  it.each([
    ['iFood *Pedido 123 (2/3)', 'ifood pedido'],
    ['Notebook Dell (10/12)', 'notebook dell'],
    ['  Padaria do Zé  ', 'padaria do ze'],
    ['Conta de luz - 09/2026', 'conta de luz'],
    ['12345', ''],
  ])('%s => "%s"', (input, key) => {
    expect(descriptionKey(input)).toBe(key);
  });
});

describe('suggestCategory — histórico', () => {
  it('mesma descrição normalizada => categoria mais frequente, confiança alta', () => {
    const history = [
      tx('Padaria do Zé', CATEGORY_IDS.restaurantes),
      tx('padaria do ze', CATEGORY_IDS.restaurantes),
      tx('PADARIA DO ZÉ', CATEGORY_IDS.mercado),
    ];
    const s = suggestCategory('Padaria do Zé', 'despesa', categories, history);
    expect(s).toMatchObject({ categoryId: CATEGORY_IDS.restaurantes, reason: 'historico' });
    expect(s!.confidence).toBeGreaterThanOrEqual(0.75);
    expect(s!.confidence).toBeLessThan(0.95);
  });

  it('histórico unânime tem confiança 0,95', () => {
    const history = [
      tx('Feira do bairro', CATEGORY_IDS.mercado),
      tx('Feira do bairro', CATEGORY_IDS.mercado),
    ];
    expect(suggestCategory('feira do bairro', 'despesa', categories, history)?.confidence).toBe(0.95);
  });

  it('ignora sufixo de parcela e números', () => {
    const history = [
      tx('Notebook Dell (1/10)', CATEGORY_IDS.compras),
      tx('Notebook Dell (2/10)', CATEGORY_IDS.compras),
    ];
    expect(suggestCategory('Notebook Dell', 'despesa', categories, history)).toMatchObject({
      categoryId: CATEGORY_IDS.compras,
      reason: 'historico',
    });
    expect(suggestCategory('notebook dell 2026', 'despesa', categories, history)?.categoryId).toBe(
      CATEGORY_IDS.compras,
    );
  });

  it('empate de frequência: o mais recente vence', () => {
    const history = [
      tx('Loja do Centro', CATEGORY_IDS.compras, '2026-08-01'),
      tx('Loja do Centro', CATEGORY_IDS.doacoes, '2026-09-20'),
    ];
    expect(suggestCategory('loja do centro', 'despesa', categories, history)?.categoryId).toBe(
      CATEGORY_IDS.doacoes,
    );
    const reversed = [
      tx('Loja do Centro', CATEGORY_IDS.compras, '2026-09-25'),
      tx('Loja do Centro', CATEGORY_IDS.doacoes, '2026-09-20'),
    ];
    expect(suggestCategory('loja do centro', 'despesa', categories, reversed)?.categoryId).toBe(
      CATEGORY_IDS.compras,
    );
  });

  it('histórico vence palavra-chave', () => {
    // "uber" é palavra-chave de Transporte, mas o usuário sempre classificou como Lazer.
    const history = [tx('Uber', CATEGORY_IDS.lazer), tx('uber', CATEGORY_IDS.lazer)];
    expect(suggestCategory('Uber', 'despesa', categories, history)).toMatchObject({
      categoryId: CATEGORY_IDS.lazer,
      reason: 'historico',
    });
  });

  it('descrição semelhante (similarity >= 0,8) => confiança média', () => {
    const history = [tx('Mercadinho São Jorge', CATEGORY_IDS.mercado)];
    const s = suggestCategory('Mercadinho Sao Jorg', 'despesa', categories, history);
    expect(s).toMatchObject({ categoryId: CATEGORY_IDS.mercado, reason: 'historico' });
    expect(s!.confidence).toBeGreaterThanOrEqual(0.55);
    expect(s!.confidence).toBeLessThanOrEqual(0.7);
  });

  it('descrição pouco parecida não usa o histórico', () => {
    const history = [tx('Studio Pilates Ana', CATEGORY_IDS.cuidados)];
    expect(suggestCategory('Studio de tatuagem Bia', 'despesa', categories, history)).toBeNull();
  });

  it('só considera lançamentos do mesmo tipo', () => {
    const history = [tx('Projeto X', CATEGORY_IDS.rendaExtra, '2026-09-01', 'receita')];
    expect(suggestCategory('Projeto X', 'receita', categories, history)?.categoryId).toBe(
      CATEGORY_IDS.rendaExtra,
    );
    expect(suggestCategory('Projeto X', 'despesa', categories, history)).toBeNull();
  });

  it('ignora transferências (sem categoria) e categorias arquivadas no histórico', () => {
    const archived = categories.map((c) => (c.id === CATEGORY_IDS.lazer ? { ...c, archived: true } : c));
    const history = [
      tx('Cinema Center', CATEGORY_IDS.lazer),
      tx('Cinema Center', null, '2026-09-11', 'transferencia'),
    ];
    // Lazer arquivada: cai na palavra-chave... que também é de Lazer (arquivada) => nada.
    expect(suggestCategory('Cinema Center', 'despesa', archived, history)).toBeNull();
  });
});

describe('suggestCategory — palavras-chave e nome', () => {
  it.each([
    ['iFood', CATEGORY_IDS.restaurantes],
    ['Uber viagem', CATEGORY_IDS.transporte],
    ['Netflix', CATEGORY_IDS.assinaturas],
    ['Conta de luz', CATEGORY_IDS.contas],
    ['Aluguel outubro', CATEGORY_IDS.moradia],
    ['Supermercado Extra', CATEGORY_IDS.mercado],
    ['Drogasil', CATEGORY_IDS.saude],
    ['Academia Smart Fit', CATEGORY_IDS.assinaturas],
    ['Ração', CATEGORY_IDS.pets],
  ])('despesa "%s" => palavra-chave', (description, id) => {
    expect(suggestCategory(description, 'despesa', categories, [])).toMatchObject({
      categoryId: id,
      confidence: 0.65,
      reason: 'palavra_chave',
    });
  });

  it.each([
    ['Salário', CATEGORY_IDS.salario],
    ['Freela site', CATEGORY_IDS.rendaExtra],
    ['Dividendos ITSA4', CATEGORY_IDS.rendimentos],
    ['Estorno compra', CATEGORY_IDS.reembolso],
  ])('receita "%s"', (description, id) => {
    expect(suggestCategory(description, 'receita', categories, [])?.categoryId).toBe(id);
  });

  it('nome da categoria => reason nome_categoria', () => {
    expect(suggestCategory('Mercado', 'despesa', categories, [])).toEqual({
      categoryId: CATEGORY_IDS.mercado,
      confidence: 0.7,
      reason: 'nome_categoria',
    });
    expect(suggestCategory('Lazer no fim de semana', 'despesa', categories, [])?.reason).toBe(
      'nome_categoria',
    );
  });

  it('erro de digitação ainda sugere, com confiança baixa', () => {
    const s = suggestCategory('restaurnte', 'despesa', categories, []);
    expect(s?.categoryId).toBe(CATEGORY_IDS.restaurantes);
    expect(s!.confidence).toBeLessThan(0.5);
    expect(s!.confidence).toBeGreaterThanOrEqual(0.35);
  });

  it('respeita o kind', () => {
    expect(suggestCategory('aluguel', 'receita', categories, [])?.categoryId).toBe(CATEGORY_IDS.rendimentos);
    expect(suggestCategory('aluguel', 'despesa', categories, [])?.categoryId).toBe(CATEGORY_IDS.moradia);
  });

  it('ignora categorias arquivadas', () => {
    const archived = categories.map((c) =>
      c.id === CATEGORY_IDS.restaurantes ? { ...c, archived: true } : c,
    );
    expect(suggestCategory('ifood', 'despesa', archived, [])).toBeNull();
  });

  it.each(['', '   ', '123', 'xpto ltda', 'Pagamento 0001'])(
    'nada confiável => null: "%s"',
    (description) => {
      expect(suggestCategory(description, 'despesa', categories, [])).toBeNull();
    },
  );

  it('sem categorias do kind => null', () => {
    const onlyIncome = categories.filter((c) => c.kind === 'receita');
    expect(suggestCategory('ifood', 'despesa', onlyIncome, [])).toBeNull();
  });
});

describe('suggestCategory — histórico grande', () => {
  const descriptions = [
    'Supermercado Extra',
    'Padaria do Zé',
    'Uber viagem',
    'iFood pedido',
    'Farmácia São João',
    'Posto Shell',
    'Netflix',
    'Conta de luz',
    'Academia',
    'Cinema',
  ];
  const ids = [
    CATEGORY_IDS.mercado,
    CATEGORY_IDS.restaurantes,
    CATEGORY_IDS.transporte,
    CATEGORY_IDS.restaurantes,
    CATEGORY_IDS.saude,
    CATEGORY_IDS.transporte,
    CATEGORY_IDS.assinaturas,
    CATEGORY_IDS.contas,
    CATEGORY_IDS.assinaturas,
    CATEGORY_IDS.lazer,
  ];
  const history = Array.from({ length: 20000 }, (_, i) =>
    tx(`${descriptions[i % descriptions.length]} ${i}`, ids[i % ids.length]),
  );

  it('digitar letra a letra não reprocessa todo o histórico a cada chamada', () => {
    const typed = 'Supermercado Extra';
    const start = performance.now();
    let last = null;
    for (let i = 1; i <= typed.length; i++)
      last = suggestCategory(typed.slice(0, i), 'despesa', categories, history);
    const elapsed = performance.now() - start;
    expect(last).toMatchObject({ categoryId: CATEGORY_IDS.mercado, reason: 'historico' });
    // Antes: ~18 passadas completas por 20 mil lançamentos (segundos). Com o índice por array, uma só.
    expect(elapsed).toBeLessThan(1500);
  });

  it('um array alterado no lugar (novo lançamento) não usa o índice antigo', () => {
    const small = [tx('Pet shop Bicho', CATEGORY_IDS.compras)];
    expect(suggestCategory('Pet shop Bicho', 'despesa', categories, small)?.categoryId).toBe(
      CATEGORY_IDS.compras,
    );
    small.push(
      tx('Pet shop Bicho', CATEGORY_IDS.pets),
      tx('Pet shop Bicho', CATEGORY_IDS.pets, '2026-09-11'),
    );
    expect(suggestCategory('Pet shop Bicho', 'despesa', categories, small)?.categoryId).toBe(
      CATEGORY_IDS.pets,
    );
  });
});
