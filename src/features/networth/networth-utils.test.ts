import { describe, expect, it } from 'vitest';
import { netWorth } from '@/analytics';
import { makeAccount, makeAsset, makeData, makeDebt, makeValuation } from '@/test/factories';
import {
  assetFormToFields,
  assetToFormValues,
  assetVariation,
  historyRows,
  lastChange,
  netWorthComposition,
  validateAssetForm,
  validateRevaluation,
  valuationRows,
  valuationsOf,
} from './networth-utils';

const TODAY = '2026-10-15';

describe('valuationsOf', () => {
  it('filtra pelo bem e ordena da mais recente (empate: criada por último primeiro)', () => {
    const list = [
      makeValuation({ id: 'a', assetId: 'x', date: '2026-01-01' }),
      makeValuation({ id: 'b', assetId: 'y', date: '2026-12-01' }),
      makeValuation({ id: 'c', assetId: 'x', date: '2026-06-01', createdAt: '2026-06-01T10:00:00.000Z' }),
      makeValuation({ id: 'd', assetId: 'x', date: '2026-06-01', createdAt: '2026-06-02T10:00:00.000Z' }),
    ];
    expect(valuationsOf('x', list).map((v) => v.id)).toEqual(['d', 'c', 'a']);
  });
});

describe('assetVariation', () => {
  it('compara com o valor de aquisição quando informado', () => {
    const asset = makeAsset({ value: 500000, acquisitionValue: 400000 });
    expect(assetVariation(asset, [])).toEqual({
      base: 400000,
      basis: 'aquisicao',
      diff: 100000,
      ratio: 0.25,
    });
  });

  it('sem aquisição, compara com a avaliação mais antiga (precisa de 2+ avaliações)', () => {
    const asset = makeAsset({ value: 4500000, acquisitionValue: null });
    const recent = makeValuation({ assetId: asset.id, value: 4500000, date: '2026-10-01' });
    const oldest = makeValuation({ assetId: asset.id, value: 5000000, date: '2026-01-01' });
    expect(assetVariation(asset, [recent])).toBeNull();
    expect(assetVariation(asset, [recent, oldest])).toEqual({
      base: 5000000,
      basis: 'primeira_avaliacao',
      diff: -500000,
      ratio: -0.1,
    });
  });

  it('aquisição zero não serve de base; avaliação inicial zero não tem razão', () => {
    const asset = makeAsset({ value: 1000, acquisitionValue: 0 });
    const v1 = makeValuation({ assetId: asset.id, value: 1000, date: '2026-10-01' });
    const v0 = makeValuation({ assetId: asset.id, value: 0, date: '2026-01-01' });
    expect(assetVariation(asset, [v1, v0])).toEqual({
      base: 0,
      basis: 'primeira_avaliacao',
      diff: 1000,
      ratio: null,
    });
  });
});

describe('valuationRows', () => {
  it('calcula a variação de cada avaliação em relação à anterior', () => {
    const rows = valuationRows([
      makeValuation({ assetId: 'x', value: 110, date: '2026-03-01' }),
      makeValuation({ assetId: 'x', value: 100, date: '2026-02-01' }),
      makeValuation({ assetId: 'x', value: 0, date: '2026-01-01' }),
    ]);
    expect(rows.map((r) => [r.change, r.ratio])).toEqual([
      [10, 0.1],
      [100, null],
      [null, null],
    ]);
  });
});

describe('netWorthComposition', () => {
  it('separa contas, bens por tipo, faturas de cartão, contas no negativo e dívidas', () => {
    const data = makeData({
      accounts: [
        makeAccount({ id: 'cc', name: 'Corrente', initialBalance: 100000 }),
        makeAccount({ id: 'pp', name: 'Poupança', type: 'poupanca', initialBalance: 50000 }),
        makeAccount({ id: 'card', name: 'Cartão', type: 'cartao_credito', initialBalance: -30000 }),
        makeAccount({ id: 'neg', name: 'Conta B', initialBalance: -20000 }),
        makeAccount({ id: 'zero', name: 'Vazia', initialBalance: 0 }),
      ],
      assets: [
        makeAsset({ type: 'imovel', value: 10000000 }),
        makeAsset({ type: 'veiculo', value: 4850000 }),
      ],
      debts: [makeDebt({ balance: 200000, balanceDate: '2026-01-01' })],
    });
    const nw = netWorth(data, TODAY);
    const { assets, liabilities } = netWorthComposition(nw);

    expect(assets.map((r) => [r.key, r.label, r.total])).toEqual([
      ['contas', 'Contas e investimentos', 150000],
      ['bem-imovel', 'Imóvel', 10000000],
      ['bem-veiculo', 'Veículo', 4850000],
    ]);
    expect(assets[0].items).toEqual([
      { id: 'cc', label: 'Corrente', total: 100000 },
      { id: 'pp', label: 'Poupança', total: 50000 },
    ]);
    expect(assets.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1);
    expect(assets[1].share).toBeCloseTo(10000000 / 15000000);

    expect(liabilities.map((r) => [r.key, r.total])).toEqual([
      ['cartoes', 30000],
      ['negativo', 20000],
      ['dividas', 200000],
    ]);
    expect(liabilities[0].items).toEqual([{ id: 'card', label: 'Cartão', total: 30000 }]);
    expect(liabilities[2].share).toBeCloseTo(0.8);
  });

  it('omite linhas zeradas e não divide por zero', () => {
    const { assets, liabilities } = netWorthComposition(netWorth(makeData(), TODAY));
    expect(assets).toEqual([]);
    expect(liabilities).toEqual([]);
  });
});

describe('historyRows / lastChange', () => {
  const points = [
    { month: '2026-09', totalAssets: 100, totalLiabilities: 50, netWorth: 50 },
    { month: '2026-10', totalAssets: 120, totalLiabilities: 40, netWorth: 80 },
  ];
  it('rotula os meses e calcula a variação do último mês', () => {
    expect(historyRows(points).map((r) => r.label)).toEqual(['set/26', 'out/26']);
    expect(lastChange(points)).toEqual({ diff: 30, previousMonth: '2026-09' });
    expect(lastChange(points.slice(1))).toBeNull();
  });
});

describe('formulários de bens', () => {
  it('valida nome, valor e data de aquisição', () => {
    const base = { ...assetToFormValues(null), name: 'Carro', value: 100 };
    expect(validateAssetForm(base, TODAY)).toEqual({});
    expect(validateAssetForm({ ...base, name: ' ', value: null }, TODAY)).toEqual({
      name: 'Informe o nome do bem.',
      value: 'Informe o valor atual estimado.',
    });
    expect(validateAssetForm({ ...base, value: 0 }, TODAY)).toEqual({}); // bem sem valor de mercado
    expect(validateAssetForm({ ...base, acquisitionDate: '2026-10-16' }, TODAY).acquisitionDate).toMatch(
      /futuro/,
    );
    expect(validateAssetForm({ ...base, acquisitionDate: '2026-02-30' }, TODAY).acquisitionDate).toBe(
      'Data inválida.',
    );
  });

  it('converte o formulário nos campos editáveis', () => {
    const values = { ...assetToFormValues(null), name: '  Casa   de praia ', notes: ' alugada ' };
    expect(assetFormToFields(values)).toEqual({
      name: 'Casa de praia',
      type: 'imovel',
      acquisitionValue: null,
      acquisitionDate: null,
      notes: 'alugada',
    });
    const asset = makeAsset({ acquisitionValue: 100, acquisitionDate: '2020-01-01' });
    expect(assetToFormValues(asset)).toMatchObject({ value: asset.value, acquisitionDate: '2020-01-01' });
  });

  it('valida a reavaliação', () => {
    expect(validateRevaluation(0, TODAY, TODAY)).toEqual({});
    expect(validateRevaluation(null, TODAY, TODAY).value).toBeTruthy();
    expect(validateRevaluation(100, '2026-10-16', TODAY).date).toMatch(/futuro/);
  });
});
