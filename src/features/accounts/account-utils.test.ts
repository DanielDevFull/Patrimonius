import { describe, expect, it } from 'vitest';
import { makeAccount, makeTransaction } from '@/test/factories';
import {
  accountsTotals,
  balanceAdjustment,
  balancesView,
  cardInfo,
  nextDayOfMonth,
  parseDay,
  sortAccountsForDisplay,
  validateAccountForm,
} from './account-utils';

const TODAY = '2026-10-15';

describe('balancesView / accountsTotals', () => {
  const banco = makeAccount({ name: 'Banco', initialBalance: 100000 });
  const cartao = makeAccount({ name: 'Cartão', type: 'cartao_credito', initialBalance: -20000 });
  const conjunta = makeAccount({ name: 'Conjunta', initialBalance: 50000, includeInNetWorth: false });
  const velha = makeAccount({ name: 'Velha', initialBalance: 999999, archived: true });
  const txs = [
    makeTransaction({ accountId: banco.id, amount: 10000, date: '2026-10-10' }),
    // pendente no mês: entra só no previsto
    makeTransaction({ accountId: banco.id, amount: 5000, date: '2026-10-20', status: 'pendente' }),
    // pendente do mês que vem: fora do previsto do mês
    makeTransaction({ accountId: banco.id, amount: 7000, date: '2026-11-02', status: 'pendente' }),
    // pago com data futura: fora do saldo atual, dentro do previsto
    makeTransaction({ accountId: banco.id, type: 'receita', amount: 3000, date: '2026-10-25' }),
    makeTransaction({ accountId: cartao.id, amount: 15000, date: '2026-10-12' }),
  ];
  const view = balancesView([banco, cartao, conjunta, velha], txs, TODAY);

  it('saldo atual considera só pagos até hoje; previsto inclui pendentes até o fim do mês', () => {
    expect(view[banco.id]).toEqual({ current: 90000, projected: 88000 });
    expect(view[cartao.id]).toEqual({ current: -35000, projected: -35000 });
  });

  it('totais somam apenas contas ativas incluídas no patrimônio; faturas = saldos negativos dos cartões', () => {
    expect(accountsTotals([banco, cartao, conjunta, velha], view)).toEqual({
      current: 90000 - 35000,
      projected: 88000 - 35000,
      cardInvoices: 35000,
      activeCount: 3,
      archivedCount: 1,
    });
  });
});

describe('nextDayOfMonth', () => {
  it('usa o mês corrente se o dia ainda não passou (inclusive hoje)', () => {
    expect(nextDayOfMonth(20, TODAY)).toBe('2026-10-20');
    expect(nextDayOfMonth(15, TODAY)).toBe('2026-10-15');
  });
  it('vai para o mês seguinte e limita ao último dia do mês', () => {
    expect(nextDayOfMonth(5, TODAY)).toBe('2026-11-05');
    expect(nextDayOfMonth(31, '2026-10-31')).toBe('2026-10-31');
    expect(nextDayOfMonth(30, '2027-01-31')).toBe('2027-02-28');
    expect(nextDayOfMonth(10, '2026-12-20')).toBe('2027-01-10');
  });
});

describe('cardInfo', () => {
  it('fatura, limite usado e disponível', () => {
    const card = makeAccount({ type: 'cartao_credito', creditLimit: 200000, closingDay: 5, dueDay: 12 });
    expect(cardInfo(card, -50000, TODAY)).toEqual({
      invoice: 50000,
      credit: 0,
      limit: 200000,
      usedRatio: 0.25,
      available: 150000,
      nextClosing: '2026-11-05',
      nextDue: '2026-11-12',
    });
  });
  it('saldo positivo é crédito; sem limite/dias não calcula uso nem datas', () => {
    const card = makeAccount({ type: 'cartao_credito' });
    expect(cardInfo(card, 3000, TODAY)).toMatchObject({
      invoice: 0,
      credit: 3000,
      limit: null,
      usedRatio: null,
      available: null,
      nextClosing: null,
      nextDue: null,
    });
  });
  it('limite estourado deixa o disponível negativo', () => {
    const card = makeAccount({ type: 'cartao_credito', creditLimit: 10000 });
    expect(cardInfo(card, -12000, TODAY)).toMatchObject({ usedRatio: 1.2, available: -2000 });
  });
});

describe('balanceAdjustment', () => {
  it('cria receita quando o saldo real é maior e despesa quando é menor', () => {
    expect(balanceAdjustment(80000, 75000)).toEqual({ type: 'despesa', amount: 5000 });
    expect(balanceAdjustment(80000, 81050)).toEqual({ type: 'receita', amount: 1050 });
    expect(balanceAdjustment(-35000, -40000)).toEqual({ type: 'despesa', amount: 5000 });
    expect(balanceAdjustment(-1000, 500)).toEqual({ type: 'receita', amount: 1500 });
  });
  it('null quando já confere', () => {
    expect(balanceAdjustment(1234, 1234)).toBeNull();
  });
});

describe('validação do formulário de conta', () => {
  const nubank = makeAccount({ name: 'Nubank' });
  const antiga = makeAccount({ name: 'Antiga', archived: true });

  it('parseDay: vazio = null; fora de 1..31 ou texto = NaN', () => {
    expect(parseDay('')).toBeNull();
    expect(parseDay(' 7 ')).toBe(7);
    expect(parseDay('0')).toBeNaN();
    expect(parseDay('32')).toBeNaN();
    expect(parseDay('5.5')).toBeNaN();
  });

  it('nome obrigatório e único entre as ativas (ignorando acento/caixa)', () => {
    const v = { name: '', isCard: false, closingDay: '', dueDay: '' };
    expect(validateAccountForm(v, [nubank], null).name).toBe('Informe o nome da conta.');
    expect(validateAccountForm({ ...v, name: ' NUBANK ' }, [nubank], null).name).toBe(
      'Já existe uma conta ativa com esse nome.',
    );
    expect(validateAccountForm({ ...v, name: 'Nubank' }, [nubank], nubank.id)).toEqual({});
    expect(validateAccountForm({ ...v, name: 'antiga' }, [antiga], null)).toEqual({});
  });

  it('dias de cartão só são validados para cartão', () => {
    const v = { name: 'Cartão', isCard: true, closingDay: '40', dueDay: 'x' };
    expect(validateAccountForm(v, [], null)).toEqual({
      closingDay: 'Informe um dia entre 1 e 31.',
      dueDay: 'Informe um dia entre 1 e 31.',
    });
    expect(validateAccountForm({ ...v, isCard: false }, [], null)).toEqual({});
  });
});

describe('sortAccountsForDisplay', () => {
  it('contas antes de cartões, depois por criação', () => {
    const c = makeAccount({ name: 'Cartão', type: 'cartao_credito', createdAt: '2026-01-01T00:00:00.000Z' });
    const b = makeAccount({ name: 'B', createdAt: '2026-02-01T00:00:00.000Z' });
    const a = makeAccount({ name: 'A', createdAt: '2026-03-01T00:00:00.000Z' });
    expect(sortAccountsForDisplay([a, c, b]).map((x) => x.name)).toEqual(['B', 'A', 'Cartão']);
  });
});
