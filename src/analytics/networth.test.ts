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
    makeDebt({ id: 'fin', name: 'Financiamento', balance: 10000000, balanceDate: '2026-01-01' }),
    makeDebt({ id: 'ok', name: 'Quitada', balance: 500000, status: 'quitada' }),
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

  it('usa a avaliação vigente na data e o valor de aquisição antes de qualquer avaliação', () => {
    const jun2023 = netWorth(data, '2023-06-30');
    // Apartamento: sem avaliação até 2023 => valor de aquisição; carro ainda não comprado => 0.
    expect(jun2023.byAssetType).toEqual([
      { type: 'imovel', label: 'Imóvel', total: 30000000 },
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
