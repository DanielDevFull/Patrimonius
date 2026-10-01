import { describe, expect, it } from 'vitest';
import { extractAmount, findInstallments } from './amount';
import { fold } from './text';

describe('extractAmount', () => {
  it.each([
    ['R$ 45,90', 4590, 'R$ 45,90'],
    ['R$45,90', 4590, 'R$45,90'],
    ['45,90', 4590, '45,90'],
    ['45.90', 4590, '45.90'],
    ['50 reais', 5000, '50 reais'],
    ['50reais', 5000, '50reais'],
    ['1 real', 100, '1 real'],
    ['1.200', 120000, '1.200'],
    ['caiu o salário de 5.200', 520000, '5.200'],
    ['R$ 1.234,56', 123456, 'R$ 1.234,56'],
    ['1,200.50', 120050, '1,200.50'],
    ['1,5 mil', 150000, '1,5 mil'],
    ['3 mil', 300000, '3 mil'],
    ['10 mil', 1000000, '10 mil'],
    ['2k', 200000, '2k'],
    ['3 mil e 500', 350000, '3 mil e 500'],
    ['2 mil e quinhentos', 250000, '2 mil e quinhentos'],
    ['cem reais', 10000, 'cem reais'],
    ['mil e quinhentos', 150000, 'mil e quinhentos'],
    ['duzentos e cinquenta', 25000, 'duzentos e cinquenta'],
    ['vinte e cinco reais', 2500, 'vinte e cinco reais'],
    ['cinco reais', 500, 'cinco reais'],
    ['gastei mil no mercado', 100000, 'mil'],
    ['dois mil', 200000, 'dois mil'],
    ['50 conto', 5000, '50 conto'],
    ['20 pila no lanche', 2000, '20 pila'],
    ['R$ 0,99', 99, 'R$ 0,99'],
    ['gastei 45,90 no ifood ontem', 4590, '45,90'],
  ])('%s => %i centavos', (text, amount, match) => {
    expect(extractAmount(text)).toEqual({ amount, match });
  });

  it.each([
    ['em 10x de 50', 5000],
    ['dia 15 paguei 30', 3000],
    ['15/09 gastei 20', 2000],
    ['comprei uma tv de 3 mil em 10x', 300000],
    ['às 15h gastei 40', 4000],
    ['13o salário de 3000', 300000],
    ['gastei 2000 em 2025', 200000],
    ['tv de 2000', 200000],
    ['criar meta viagem de 10 mil até dezembro de 2027', 1000000],
    ['quero juntar 5000 para um notebook em 8 meses', 500000],
    ['nos últimos 3 meses gastei 900', 90000],
  ])('não confunde parcelas, dias, datas, horas e anos com valores: %s', (text, amount) => {
    expect(extractAmount(text)?.amount).toBe(amount);
  });

  it.each([
    'comprei uma tv',
    'em 10x',
    'dez vezes',
    'dia 15',
    '15/09',
    '15/09/2026',
    'até dezembro de 2027',
    'em 8 meses',
    'últimos 3 meses',
    '30 dias',
    '10% de desconto',
    'texto sem número',
    '',
  ])('sem valor monetário: "%s"', (text) => {
    expect(extractAmount(text)).toBeNull();
  });

  it('prefere o valor com marcador forte (R$, reais, decimais)', () => {
    expect(extractAmount('2 cafés por R$ 12,50')?.amount).toBe(1250);
  });

  it('não lança com entrada inválida', () => {
    expect(extractAmount(undefined as unknown as string)).toBeNull();
  });
});

describe('findInstallments', () => {
  it.each([
    ['comprei em 10x no cartão', 10],
    ['10x sem juros', 10],
    ['em 12 vezes', 12],
    ['6 parcelas', 6],
    ['parcelado em 4', 4],
    ['em dez vezes', 10],
    ['em doze parcelas', 12],
    ['à vista', 1],
  ])('%s => %i', (text, count) => {
    expect(findInstallments(fold(text))?.count).toBe(count);
  });

  it.each(['comprei um tênis', 'algumas vezes', 'xbox novo'])('sem parcelamento: %s', (text) => {
    expect(findInstallments(fold(text))).toBeNull();
  });
});
