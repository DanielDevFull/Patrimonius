import { describe, expect, it } from 'vitest';
import {
  makeAccount,
  makeAsset,
  makeData,
  makeDebt,
  makeDebtPayment,
  makeTransaction,
  makeValuation,
} from '@/test/factories';
import { netWorth, netWorthHistory } from './networth';

const corrente = makeAccount({ id: 'cc', name: 'Corrente', initialBalance: 200000 });
const cartao = makeAccount({ id: 'card', name: 'Cartão', type: 'cartao_credito', initialBalance: -50000 });
const fora = makeAccount({
  id: 'fora',
  name: 'Conta da empresa',
  initialBalance: 999999,
  includeInNetWorth: false,
});
const arquivadaZerada = makeAccount({ id: 'arq0', name: 'Antiga', archived: true, initialBalance: 0 });
const arquivadaComSaldo = makeAccount({
  id: 'arq1',
  name: 'Poupança antiga',
  type: 'poupanca',
  archived: true,
  initialBalance: 30000,
});

const apartamento = makeAsset({
  id: 'ap',
  name: 'Apartamento',
  type: 'imovel',
  value: 40000000,
  acquisitionValue: 30000000,
  acquisitionDate: '2020-01-10',
});
const carro = makeAsset({
  id: 'car',
  name: 'Carro',
  type: 'veiculo',
  value: 6000000,
  acquisitionValue: null,
  acquisitionDate: '2026-08-20',
});
const moto = makeAsset({ id: 'moto', name: 'Moto', type: 'veiculo', value: 1500000 });
const vendido = makeAsset({
  id: 'sold',
  name: 'Bicicleta',
  type: 'bem_pessoal',
  value: 200000,
  archived: true,
});

const data = makeData({
  accounts: [corrente, cartao, fora, arquivadaZerada, arquivadaComSaldo],
  transactions: [
    makeTransaction({
      accountId: 'cc',
      type: 'receita',
      amount: 500000,
      date: '2026-09-05',
      categoryId: 'cat-salario',
    }),
    makeTransaction({ accountId: 'card', amount: 20000, date: '2026-09-12' }),
    makeTransaction({ accountId: 'cc', amount: 70000, date: '2026-10-02' }),
    makeTransaction({ accountId: 'cc', amount: 100000, date: '2026-09-20', status: 'pendente' }),
  ],
  assets: [apartamento, carro, moto, vendido],
  assetValuations: [
    makeValuation({
      assetId: 'ap',
      value: 35000000,
      date: '2024-01-01',
      createdAt: '2024-01-01T10:00:00.000Z',
    }),
    makeValuation({
      assetId: 'ap',
      value: 40000000,
      date: '2026-09-30',
      createdAt: '2026-09-30T10:00:00.000Z',
    }),
    // Duas avaliações no mesmo dia: vale a criada por último.
    makeValuation({
      assetId: 'ap',
      value: 41000000,
      date: '2026-09-30',
      createdAt: '2026-09-30T11:00:00.000Z',
    }),
    makeValuation({ assetId: 'car', value: 6000000, date: '2026-08-20' }),
  ],
  debts: [
    // Sem juros: aqui só importa a composição (a amortização com juros é testada em debts.test.ts).
    makeDebt({ id: 'fin', name: 'Financiamento', balance: 10000000, balanceDate: '2026-01-01', interestRate: 0 }),
    // Marcada como quitada à mão em janeiro (sem pagamentos): não conta a partir daí.
    makeDebt({ id: 'ok', name: 'Quitada', balance: 500000, status: 'quitada', updatedAt: '2026-01-15T12:00:00.000Z' }),
  ],
  debtPayments: [
    makeDebtPayment({ debtId: 'fin', amount: 200000, date: '2026-09-10' }),
    makeDebtPayment({ debtId: 'fin', amount: 200000, date: '2026-10-10' }),
  ],
});

describe('netWorth', () => {
  it('soma contas, bens e dívidas na data informada', () => {
    const nw = netWorth(data, '2026-09-30');

    expect(nw.asOf).toBe('2026-09-30');
    // Corrente: 200.000 + 500.000 (pendente não entra); cartão: -50.000 - 20.000; arquivada com saldo entra.
    expect(nw.accounts).toEqual([
      { accountId: 'cc', name: 'Corrente', type: 'corrente', balance: 700000 },
      { accountId: 'card', name: 'Cartão', type: 'cartao_credito', balance: -70000 },
      { accountId: 'arq1', name: 'Poupança antiga', type: 'poupanca', balance: 30000 },
    ]);
    expect(nw.accountsPositive).toBe(730000);
    expect(nw.accountsNegative).toBe(70000);

    // Apartamento 410.000,00 (última avaliação do dia) + carro 60.000,00 + moto 15.000,00 (sem avaliação => value).
    expect(nw.assetsTotal).toBe(41000000 + 6000000 + 1500000);
    expect(nw.byAssetType).toEqual([
      { type: 'imovel', label: 'Imóvel', total: 41000000 },
      { type: 'veiculo', label: 'Veículo', total: 7500000 },
    ]);

    // Financiamento: 10.000.000 - 200.000 (pagamento de outubro ainda não aconteceu).
    expect(nw.debtsTotal).toBe(9800000);
    expect(nw.totalAssets).toBe(730000 + 48500000);
    expect(nw.totalLiabilities).toBe(70000 + 9800000);
    expect(nw.netWorth).toBe(730000 + 48500000 - 70000 - 9800000);
  });

  it('usa a avaliação vigente na data e, antes da primeira avaliação, o valor dela', () => {
    const jun2023 = netWorth(data, '2023-06-30');
    // Apartamento: sem avaliação até 2023 => valor da 1ª avaliação (350.000,00), não o de aquisição;
    // carro ainda não comprado => 0.
    expect(jun2023.byAssetType).toEqual([
      { type: 'imovel', label: 'Imóvel', total: 35000000 },
      { type: 'veiculo', label: 'Veículo', total: 1500000 },
    ]);
    const jul2026 = netWorth(data, '2026-07-31');
    expect(jul2026.assetsTotal).toBe(35000000 + 0 + 1500000);
  });

  it('sem dados => tudo zero', () => {
    const nw = netWorth(makeData(), '2026-10-01');
    expect(nw).toMatchObject({
      accounts: [],
      accountsPositive: 0,
      accountsNegative: 0,
      assetsTotal: 0,
      byAssetType: [],
      debtsTotal: 0,
      totalAssets: 0,
      totalLiabilities: 0,
      netWorth: 0,
    });
  });
});

describe('netWorthHistory', () => {
  it('um ponto por mês, no fim de cada mês, e em today no mês corrente', () => {
    const history = netWorthHistory(data, '2026-10', 3, '2026-10-05');
    expect(history.map((p) => p.month)).toEqual(['2026-08', '2026-09', '2026-10']);

    const [ago, set, out] = history;
    // Agosto (31/08): corrente 200.000 + poupança antiga 30.000; cartão -50.000;
    // bens: apartamento 350.000,00 + carro 60.000,00 + moto 15.000,00; financiamento 10.000.000.
    expect(ago.totalAssets).toBe(230000 + 35000000 + 6000000 + 1500000);
    expect(ago.totalLiabilities).toBe(50000 + 10000000);
    expect(set).toEqual({
      month: '2026-09',
      totalAssets: 730000 + 48500000,
      totalLiabilities: 70000 + 9800000,
      netWorth: 730000 + 48500000 - 70000 - 9800000,
    });
    // Em 05/10: despesa de 700,00 do dia 02 já entrou; pagamento do dia 10 ainda não.
    expect(out.totalAssets).toBe(660000 + 48500000);
    expect(out.totalLiabilities).toBe(70000 + 9800000);
  });

  it('sem today (ou today fora de endMonth) usa o último dia do mês', () => {
    const [semToday] = netWorthHistory(data, '2026-10', 1);
    // 31/10: pagamento de 10/10 já descontado.
    expect(semToday.totalLiabilities).toBe(70000 + 9600000);
    const [foraDoMes] = netWorthHistory(data, '2026-10', 1, '2026-09-15');
    expect(foraDoMes).toEqual(semToday);
  });

  it('count <= 0 => lista vazia', () => {
    expect(netWorthHistory(data, '2026-10', 0)).toEqual([]);
  });
});

describe('netWorthHistory — o passado não é reescrito', () => {
  it('quitar uma dívida não derruba o patrimônio dos meses anteriores', () => {
    // Conta com R$ 20.000,00 e dívida de R$ 10.000,00 (saldo em 01/05), quitada com pagamento em 15/09.
    const quitada = makeData({
      accounts: [makeAccount({ id: 'cc', initialBalance: 2000000 })],
      transactions: [makeTransaction({ accountId: 'cc', amount: 1000000, date: '2026-09-15', categoryId: 'cat-dividas' })],
      debts: [makeDebt({ id: 'd', balance: 1000000, balanceDate: '2026-05-01', interestRate: 0, status: 'quitada' })],
      debtPayments: [makeDebtPayment({ debtId: 'd', amount: 1000000, date: '2026-09-15' })],
    });
    // Antes: [20.000 ×4, 10.000, 10.000] — uma queda falsa em setembro.
    expect(netWorthHistory(quitada, '2026-10', 6).map((p) => p.netWorth)).toEqual(Array(6).fill(1000000));
  });

  it('arquivar um bem vendido mantém o bem nos meses anteriores à venda', () => {
    // Carro de R$ 50.000,00 avaliado em 01/05, vendido em 20/09 (receita de R$ 50.000,00) e arquivado.
    const vendido = makeData({
      accounts: [makeAccount({ id: 'cc', initialBalance: 100000 })],
      transactions: [
        makeTransaction({ accountId: 'cc', type: 'receita', amount: 5000000, date: '2026-09-20', categoryId: 'cat-outros-receita' }),
      ],
      assets: [makeAsset({ id: 'car', value: 5000000, archived: true, archivedAt: '2026-09-20' })],
      assetValuations: [makeValuation({ assetId: 'car', value: 5000000, date: '2026-05-01' })],
    });
    // Antes: [1.000 ×4, 51.000, 51.000] — uma alta falsa de R$ 50.000,00 em setembro.
    expect(netWorthHistory(vendido, '2026-10', 6).map((p) => p.netWorth)).toEqual(Array(6).fill(5100000));
    expect(netWorth(vendido, '2026-09-19').assetsTotal).toBe(5000000);
    expect(netWorth(vendido, '2026-09-20').assetsTotal).toBe(0);
  });

  it('bem arquivado antes de existir archivedAt (dados antigos) conta até a última avaliação', () => {
    const antigo = makeData({
      assets: [makeAsset({ id: 'old', value: 300000, archived: true })],
      assetValuations: [makeValuation({ assetId: 'old', value: 300000, date: '2026-08-31' })],
    });
    expect(netWorthHistory(antigo, '2026-09', 2).map((p) => p.netWorth)).toEqual([300000, 0]);
  });

  it('bem cadastrado hoje com aquisição antiga não cria alta nem queda falsa no mês do cadastro', () => {
    // Imóvel comprado em 2015 por R$ 300.000,00 e avaliado em R$ 500.000,00 no cadastro (10/10).
    const imovel = makeData({
      accounts: [makeAccount({ id: 'cc', initialBalance: 100000 })],
      assets: [
        makeAsset({ id: 'ap', type: 'imovel', value: 50000000, acquisitionValue: 30000000, acquisitionDate: '2015-03-01' }),
        // Carro de 2023 (R$ 70.000,00) que hoje vale R$ 60.000,00.
        makeAsset({ id: 'car', value: 6000000, acquisitionValue: 7000000, acquisitionDate: '2023-03-15' }),
      ],
      assetValuations: [
        makeValuation({ assetId: 'ap', value: 50000000, date: '2026-10-10' }),
        makeValuation({ assetId: 'car', value: 6000000, date: '2026-10-10' }),
      ],
    });
    // Antes: [371.000, 371.000, 561.000] (alta falsa de R$ 190.000,00).
    expect(netWorthHistory(imovel, '2026-10', 3).map((p) => p.netWorth)).toEqual(Array(3).fill(56100000));
    // Antes da aquisição o bem não existia.
    expect(netWorth(imovel, '2023-01-31').assetsTotal).toBe(50000000);
    expect(netWorth(imovel, '2014-12-31').assetsTotal).toBe(0);
  });
});
