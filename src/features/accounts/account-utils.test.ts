import { describe, expect, it } from 'vitest';
import { makeAccount, makeTransaction } from '@/test/factories';
import {
  accountRemovalImpact,
  accountsTotals,
  balanceAdjustment,
  balancesView,
  cardInfo,
  nextDayOfMonth,
  parseDay,
  realBalanceFromInput,
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
    expect(view[banco.id]).toMatchObject({ current: 90000, projected: 88000 });
    expect(view[cartao.id]).toMatchObject({ current: -35000, projected: -35000 });
  });

  it('comprometido inclui todos os pagos e pendentes, de qualquer data (parcelas futuras)', () => {
    // 100000 - 10000 - 5000 (pendente out) - 7000 (pendente nov) + 3000 (pago futuro)
    expect(view[banco.id].committed).toBe(81000);
    expect(view[cartao.id].committed).toBe(-35000);
  });

  it('totais somam apenas contas ativas incluídas no patrimônio; faturas = saldos negativos dos cartões', () => {
    expect(accountsTotals([banco, cartao, conjunta, velha], view)).toEqual({
      current: 90000 - 35000,
      projected: 88000 - 35000,
      cardInvoices: 35000,
      activeCount: 3,
      archivedCount: 1,
      archivedBalance: 999999,
      archivedWithBalance: 1,
    });
  });

  it('conta arquivada com saldo (ex.: cartão com fatura) fica fora dos totais, mas é informada à parte', () => {
    const cartaoArquivado = { ...cartao, archived: true };
    const semSaldo = makeAccount({ name: 'Zerada', archived: true });
    const fora = makeAccount({ name: 'Fora', archived: true, initialBalance: 100, includeInNetWorth: false });
    const accounts = [banco, cartaoArquivado, semSaldo, fora];
    const totals = accountsTotals(accounts, balancesView(accounts, txs, TODAY));
    expect(totals).toMatchObject({
      current: 90000,
      cardInvoices: 0,
      archivedCount: 3,
      archivedBalance: -35000,
      archivedWithBalance: 1,
    });
  });
});

describe('accountRemovalImpact', () => {
  const cartao = makeAccount({ name: 'Cartão', type: 'cartao_credito' });
  const banco = makeAccount({ name: 'Banco' });
  it('conta saldo atual, lançamentos pendentes/futuros e se será arquivada ou excluída', () => {
    const txs = [
      makeTransaction({ accountId: cartao.id, amount: 1000, date: '2026-10-01' }),
      makeTransaction({ accountId: cartao.id, amount: 1000, date: '2026-11-01', status: 'pendente' }),
      makeTransaction({ accountId: cartao.id, amount: 1000, date: '2026-10-02', status: 'pendente' }),
      makeTransaction({ accountId: cartao.id, amount: 1000, date: '2026-10-20' }),
      makeTransaction({ accountId: banco.id, amount: 1000, date: '2026-12-01', status: 'pendente' }),
    ];
    expect(accountRemovalImpact(cartao, -1000, txs, [], TODAY)).toEqual({
      balance: -1000,
      futureCount: 3,
      willArchive: true,
    });
    const vazia = makeAccount({ name: 'Vazia', initialBalance: 5000 });
    expect(accountRemovalImpact(vazia, 5000, txs, [], TODAY)).toEqual({
      balance: 5000,
      futureCount: 0,
      willArchive: false,
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
    expect(cardInfo(card, -50000, TODAY, -50000)).toEqual({
      invoice: 50000,
      credit: 0,
      limit: 200000,
      used: 50000,
      usedRatio: 0.25,
      available: 150000,
      nextClosing: '2026-11-05',
      nextDue: '2026-11-12',
    });
  });
  it('saldo positivo é crédito; sem limite/dias não calcula uso nem datas', () => {
    const card = makeAccount({ type: 'cartao_credito' });
    expect(cardInfo(card, 3000, TODAY, 3000)).toMatchObject({
      invoice: 0,
      credit: 3000,
      limit: null,
      used: 0,
      usedRatio: null,
      available: null,
      nextClosing: null,
      nextDue: null,
    });
  });
  it('limite estourado deixa o disponível negativo', () => {
    const card = makeAccount({ type: 'cartao_credito', creditLimit: 10000 });
    expect(cardInfo(card, -12000, TODAY, -12000)).toMatchObject({ usedRatio: 1.2, available: -2000 });
  });
  it('parcelas futuras (pendentes) bloqueiam o limite, como no Pat; a fatura atual continua só com as pagas', () => {
    // Limite de R$ 10.000; compra de R$ 5.000 em 10x hoje: 1ª parcela paga, 9 pendentes nos próximos meses.
    const card = makeAccount({ type: 'cartao_credito', creditLimit: 1000000 });
    const txs = Array.from({ length: 10 }, (_, i) =>
      makeTransaction({
        accountId: card.id,
        amount: 50000,
        date: `${i < 3 ? 2026 : 2027}-${String(((9 + i) % 12) + 1).padStart(2, '0')}-15`,
        status: i === 0 ? 'pago' : 'pendente',
      }),
    );
    const view = balancesView([card], txs, TODAY)[card.id];
    expect(cardInfo(card, view.current, TODAY, view.committed)).toMatchObject({
      invoice: 50000,
      used: 500000,
      usedRatio: 0.5,
      available: 500000,
    });
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

describe('realBalanceFromInput', () => {
  it('conta comum usa o valor digitado (pode ser negativo)', () => {
    expect(realBalanceFromInput(-500, false, false)).toBe(-500);
    expect(realBalanceFromInput(null, false, false)).toBeNull();
  });
  it('cartão: fatura digitada positiva vira saldo negativo; com crédito, positivo', () => {
    expect(realBalanceFromInput(138384, true, false)).toBe(-138384);
    expect(realBalanceFromInput(-138384, true, false)).toBe(-138384);
    expect(realBalanceFromInput(5000, true, true)).toBe(5000);
    expect(balanceAdjustment(-138384, realBalanceFromInput(138384, true, false)!)).toBeNull();
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
