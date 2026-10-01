import { describe, expect, it } from 'vitest';
import type { Transaction } from '@/domain/types';
import { makeData, makeRecurring, makeTransaction } from '@/test/factories';
import {
  detectRecurringCandidates,
  materializeRecurring,
  nextOccurrence,
  occurrencesBetween,
  upcomingItems,
} from './recurring';

const acc = 'chk';
const NOW = '2026-10-01T12:00:00.000Z';

function idMaker(prefix = 'gen') {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

describe('nextOccurrence', () => {
  it('semanal soma 7 dias atravessando mês e ano', () => {
    expect(nextOccurrence('2026-12-29', 'semanal')).toBe('2027-01-05');
    expect(nextOccurrence('2028-02-22', 'semanal')).toBe('2028-02-29');
  });

  it('quinzenal é duas vezes por mês: dia âncora e 15 dias depois (não a cada 14 dias)', () => {
    expect(nextOccurrence('2026-10-05', 'quinzenal')).toBe('2026-10-20');
    expect(nextOccurrence('2026-10-20', 'quinzenal')).toBe('2026-11-05');
    expect(nextOccurrence('2026-12-20', 'quinzenal', 5)).toBe('2027-01-05');
    // 15 e 30: em fevereiro o segundo dia vira o último do mês, e volta a 30 em março.
    expect(nextOccurrence('2027-02-15', 'quinzenal', 15)).toBe('2027-02-28');
    expect(nextOccurrence('2027-02-28', 'quinzenal', 15)).toBe('2027-03-15');
    expect(nextOccurrence('2027-03-15', 'quinzenal', 30)).toBe('2027-03-30');
  });

  it('quinzenal: 24 ocorrências no ano, nunca 3 no mesmo mês', () => {
    const rule = makeRecurring({ accountId: acc, frequency: 'quinzenal', startDate: '2026-01-02', nextDate: '2026-01-02' });
    const dates = occurrencesBetween(rule, '2026-01-01', '2026-12-31');
    // Antes (a cada 14 dias): 26 datas, com 02, 16 e 30 de janeiro.
    expect(dates).toHaveLength(24);
    expect(dates.slice(0, 3)).toEqual(['2026-01-02', '2026-01-17', '2026-02-02']);
    const perMonth = new Map<string, number>();
    for (const d of dates) perMonth.set(d.slice(0, 7), (perMonth.get(d.slice(0, 7)) ?? 0) + 1);
    expect([...perMonth.values()].every((n) => n === 2)).toBe(true);
  });

  it('mensal com âncora 31 vai para 28/29 e volta para 31', () => {
    expect(nextOccurrence('2027-01-31', 'mensal', 31)).toBe('2027-02-28');
    expect(nextOccurrence('2027-02-28', 'mensal', 31)).toBe('2027-03-31');
    expect(nextOccurrence('2028-01-31', 'mensal', 31)).toBe('2028-02-29');
    expect(nextOccurrence('2026-12-15', 'mensal')).toBe('2027-01-15');
  });

  it('sem âncora usa o dia da própria data (o dia "encolhe")', () => {
    expect(nextOccurrence('2027-01-31', 'mensal')).toBe('2027-02-28');
    expect(nextOccurrence('2027-02-28', 'mensal')).toBe('2027-03-28');
  });

  it('bimestral, trimestral, semestral e anual (inclusive 29/02)', () => {
    expect(nextOccurrence('2026-11-30', 'bimestral', 30)).toBe('2027-01-30');
    expect(nextOccurrence('2026-11-30', 'trimestral', 31)).toBe('2027-02-28');
    expect(nextOccurrence('2026-08-31', 'semestral', 31)).toBe('2027-02-28');
    expect(nextOccurrence('2024-02-29', 'anual', 29)).toBe('2025-02-28');
    expect(nextOccurrence('2027-02-28', 'anual', 29)).toBe('2028-02-29');
  });
});

describe('occurrencesBetween', () => {
  const monthly31 = makeRecurring({
    accountId: acc,
    frequency: 'mensal',
    startDate: '2026-10-31',
    nextDate: '2026-10-31',
  });

  it('mantém a âncora do dia de startDate ao longo dos meses', () => {
    expect(occurrencesBetween(monthly31, '2026-10-01', '2027-03-31')).toEqual([
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ]);
  });

  it('filtra por from, para em endDate e devolve vazio se from > to', () => {
    expect(occurrencesBetween(monthly31, '2027-01-01', '2027-03-31')).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ]);
    const ending = { ...monthly31, endDate: '2027-01-15' };
    expect(occurrencesBetween(ending, '2026-01-01', '2027-12-31')).toEqual([
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
    ]);
    expect(occurrencesBetween(monthly31, '2027-01-01', '2026-01-01')).toEqual([]);
  });

  it('começa em nextDate mas usa a âncora de startDate', () => {
    const rule = makeRecurring({ accountId: acc, startDate: '2026-01-31', nextDate: '2026-04-30' });
    expect(occurrencesBetween(rule, '2026-01-01', '2026-06-30')).toEqual([
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ]);
  });

  it('limita a 500 datas', () => {
    const weekly = makeRecurring({
      accountId: acc,
      frequency: 'semanal',
      startDate: '2026-01-01',
      nextDate: '2026-01-01',
    });
    const dates = occurrencesBetween(weekly, '2026-01-01', '2040-12-31');
    expect(dates).toHaveLength(500);
    expect(dates[1]).toBe('2026-01-08');
  });
});

describe('materializeRecurring', () => {
  const rent = makeRecurring({
    id: 'rent',
    accountId: acc,
    type: 'despesa',
    amount: 150000,
    description: 'Aluguel',
    categoryId: 'cat-moradia',
    frequency: 'mensal',
    startDate: '2026-08-31',
    nextDate: '2026-08-31',
  });

  it('gera pendentes até `until` com os campos da regra e avança nextDate', () => {
    const { newTransactions, updatedRules } = materializeRecurring([rent], [], '2026-10-31', NOW, idMaker());
    expect(newTransactions.map((t) => t.date)).toEqual(['2026-08-31', '2026-09-30', '2026-10-31']);
    expect(newTransactions[0]).toEqual<Transaction>({
      id: 'gen-1',
      type: 'despesa',
      amount: 150000,
      date: '2026-08-31',
      description: 'Aluguel',
      categoryId: 'cat-moradia',
      accountId: acc,
      toAccountId: null,
      status: 'pendente',
      notes: '',
      tags: [],
      recurringId: 'rent',
      installment: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(updatedRules).toHaveLength(1);
    expect(updatedRules[0]).toMatchObject({
      id: 'rent',
      nextDate: '2026-11-30',
      updatedAt: NOW,
      active: true,
    });
    // a regra original não é mutada
    expect(rent.nextDate).toBe('2026-08-31');
  });

  it('não duplica ocorrências que já têm lançamento (mesmo recurringId e data)', () => {
    const existing = makeTransaction({
      accountId: acc,
      recurringId: 'rent',
      date: '2026-09-30',
      status: 'pago',
    });
    const { newTransactions, updatedRules } = materializeRecurring(
      [rent],
      [existing],
      '2026-10-31',
      NOW,
      idMaker(),
    );
    expect(newTransactions.map((t) => t.date)).toEqual(['2026-08-31', '2026-10-31']);
    expect(updatedRules[0].nextDate).toBe('2026-11-30');
  });

  it('é idempotente: rodar de novo com o resultado não gera nada', () => {
    const first = materializeRecurring([rent], [], '2026-10-31', NOW, idMaker());
    const second = materializeRecurring(
      first.updatedRules,
      first.newTransactions,
      '2026-10-31',
      NOW,
      idMaker(),
    );
    expect(second).toEqual({ newTransactions: [], updatedRules: [] });
  });

  it('ignora regras inativas ou sem geração automática e não as devolve', () => {
    const inactive = { ...rent, id: 'inactive', active: false };
    const manual = { ...rent, id: 'manual', autoGenerate: false };
    const result = materializeRecurring([inactive, manual], [], '2026-10-31', NOW, idMaker());
    expect(result).toEqual({ newTransactions: [], updatedRules: [] });
  });

  it('não devolve regras cuja próxima data já é posterior a `until`', () => {
    const future = { ...rent, id: 'future', nextDate: '2026-11-30' };
    expect(materializeRecurring([future], [], '2026-10-31', NOW, idMaker()).updatedRules).toEqual([]);
  });

  it('respeita endDate: para nela, deixa nextDate além e mantém a regra ativa', () => {
    const weekly = makeRecurring({
      id: 'weekly',
      accountId: acc,
      frequency: 'semanal',
      startDate: '2026-09-01',
      nextDate: '2026-09-01',
      endDate: '2026-09-15',
    });
    const { newTransactions, updatedRules } = materializeRecurring(
      [weekly],
      [],
      '2026-10-31',
      NOW,
      idMaker(),
    );
    expect(newTransactions.map((t) => t.date)).toEqual(['2026-09-01', '2026-09-08', '2026-09-15']);
    expect(updatedRules[0]).toMatchObject({ nextDate: '2026-09-22', active: true });
    // já finalizada: nada a fazer
    const again = materializeRecurring(updatedRules, newTransactions, '2026-12-31', NOW, idMaker());
    expect(again.newTransactions).toEqual([]);
    expect(again.updatedRules).toEqual([]);
  });

  it('receita anual em 29/02 cai em 28/02 nos anos não bissextos', () => {
    const bonus = makeRecurring({
      id: 'bonus',
      accountId: acc,
      type: 'receita',
      categoryId: 'cat-salario',
      frequency: 'anual',
      startDate: '2024-02-29',
      nextDate: '2024-02-29',
    });
    const { newTransactions, updatedRules } = materializeRecurring([bonus], [], '2028-03-01', NOW, idMaker());
    expect(newTransactions.map((t) => t.date)).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ]);
    expect(newTransactions.every((t) => t.type === 'receita' && t.status === 'pendente')).toBe(true);
    expect(updatedRules[0].nextDate).toBe('2029-02-28');
  });
});

describe('upcomingItems', () => {
  const today = '2026-10-10';
  const overdue = makeTransaction({
    id: 'tx-overdue',
    accountId: acc,
    description: 'Conta de luz',
    amount: 18000,
    date: '2026-10-05',
    status: 'pendente',
  });
  const boundary = makeTransaction({
    id: 'tx-boundary',
    accountId: acc,
    type: 'receita',
    description: 'Freela',
    amount: 90000,
    date: '2026-11-09',
    status: 'pendente',
    categoryId: 'cat-freelance',
  });
  const tooLate = makeTransaction({ accountId: acc, date: '2026-11-10', status: 'pendente' });
  const paid = makeTransaction({ accountId: acc, date: '2026-10-15', status: 'pago' });
  const transfer = makeTransaction({
    accountId: acc,
    type: 'transferencia',
    toAccountId: 'sav',
    categoryId: null,
    date: '2026-10-12',
    status: 'pendente',
  });
  const monthly = makeRecurring({
    id: 'r-monthly',
    accountId: acc,
    description: 'Academia',
    amount: 12000,
    startDate: '2026-01-20',
    nextDate: '2026-10-20',
    autoGenerate: false,
  });
  const inactive = makeRecurring({ id: 'r-off', accountId: acc, nextDate: '2026-10-12', active: false });
  const weekly = makeRecurring({
    id: 'r-weekly',
    accountId: acc,
    description: 'Diarista',
    frequency: 'semanal',
    startDate: '2026-09-03',
    nextDate: '2026-10-08',
    autoGenerate: false,
  });
  const materializedRule = makeRecurring({
    id: 'r-mat',
    accountId: acc,
    description: 'Internet',
    startDate: '2026-01-25',
    nextDate: '2026-10-25',
  });
  const materialized = makeTransaction({
    id: 'tx-mat',
    accountId: acc,
    description: 'Internet',
    amount: 9900,
    date: '2026-10-25',
    status: 'pendente',
    recurringId: 'r-mat',
  });
  const data = makeData({
    transactions: [overdue, boundary, tooLate, paid, transfer, materialized],
    recurring: [monthly, inactive, weekly, materializedRule],
  });

  it('junta pendentes (inclusive vencidos) e ocorrências futuras de regras ativas, por data', () => {
    const items = upcomingItems(data, today, 30);
    expect(items.map((i) => [i.date, i.source, i.description])).toEqual([
      ['2026-10-05', 'pendente', 'Conta de luz'],
      ['2026-10-15', 'recorrencia', 'Diarista'],
      ['2026-10-20', 'recorrencia', 'Academia'],
      ['2026-10-22', 'recorrencia', 'Diarista'],
      ['2026-10-25', 'pendente', 'Internet'],
      ['2026-10-29', 'recorrencia', 'Diarista'],
      ['2026-11-05', 'recorrencia', 'Diarista'],
      ['2026-11-09', 'pendente', 'Freela'],
    ]);
  });

  it('marca vencidos e preenche ids de origem', () => {
    const items = upcomingItems(data, today, 30);
    expect(items[0]).toMatchObject({
      overdue: true,
      transactionId: 'tx-overdue',
      recurringId: null,
      amount: 18000,
    });
    expect(items[2]).toMatchObject({
      overdue: false,
      transactionId: null,
      recurringId: 'r-monthly',
      amount: 12000,
    });
    expect(items[4]).toMatchObject({ transactionId: 'tx-mat', recurringId: 'r-mat' });
    expect(items.filter((i) => i.overdue)).toHaveLength(1);
  });

  it('horizonte zero mostra só vencidos e o que é de hoje', () => {
    const items = upcomingItems(data, '2026-10-15', 0);
    expect(items.map((i) => [i.date, i.description])).toEqual([
      ['2026-10-05', 'Conta de luz'],
      ['2026-10-15', 'Diarista'],
    ]);
  });
});

describe('detectRecurringCandidates', () => {
  const today = '2026-10-10';
  const tx = (description: string, amount: number, date: string, extra: Partial<Transaction> = {}) =>
    makeTransaction({ accountId: acc, description, amount, date, categoryId: 'cat-assinaturas', ...extra });

  it('detecta gasto mensal em 3 meses distintos, agrupando descrições normalizadas', () => {
    const data = makeData({
      transactions: [
        tx('Netflix', 5590, '2026-07-15'),
        tx('NETFLIX ', 5590, '2026-08-15'),
        tx('netflix', 5590, '2026-09-15', { accountId: 'card', categoryId: 'cat-lazer' }),
      ],
    });
    const [candidate, ...rest] = detectRecurringCandidates(data, today);
    expect(rest).toEqual([]);
    expect(candidate).toEqual({
      key: 'netflix|despesa',
      description: 'netflix',
      type: 'despesa',
      amount: 5590,
      categoryId: 'cat-lazer',
      accountId: 'card',
      frequency: 'mensal',
      occurrences: 3,
      lastDate: '2026-09-15',
      nextExpectedDate: '2026-10-15',
    });
  });

  it('exige 3 meses distintos e valores a ±15% da mediana', () => {
    const data = makeData({
      transactions: [
        // 3 ocorrências em só 2 meses
        tx('Spotify', 2190, '2026-08-01'),
        tx('Spotify', 2190, '2026-08-20'),
        tx('Spotify', 2190, '2026-09-01'),
        // mediana 10000; 12000 está 20% acima
        tx('Academia', 12000, '2026-07-01'),
        tx('Academia', 10000, '2026-08-01'),
        tx('Academia', 10000, '2026-09-01'),
        tx('Academia', 10000, '2026-10-01'),
        // quantidade par: mediana = (10400 + 10600) / 2
        tx('Plano de saúde', 10000, '2026-07-10'),
        tx('Plano de saude', 10400, '2026-08-10'),
        tx('Plano de saúde', 10600, '2026-09-10'),
        tx('Plano de saúde', 11000, '2026-10-10'),
      ],
    });
    const candidates = detectRecurringCandidates(data, today);
    expect(candidates.map((c) => c.key)).toEqual(['plano de saude|despesa']);
    expect(candidates[0]).toMatchObject({ amount: 10500, occurrences: 4, lastDate: '2026-10-10' });
  });

  it('ignora lançamentos de recorrência/parcelados, fora da janela, futuros e compras frequentes', () => {
    const installment = { groupId: 'g', number: 1, total: 3 };
    const data = makeData({
      transactions: [
        tx('Gerado', 1000, '2026-07-05', { recurringId: 'r1' }),
        tx('Gerado', 1000, '2026-08-05', { recurringId: 'r1' }),
        tx('Gerado', 1000, '2026-09-05', { recurringId: 'r1' }),
        tx('Celular', 1000, '2026-07-05', { installment }),
        tx('Celular', 1000, '2026-08-05', { installment: { ...installment, number: 2 } }),
        tx('Celular', 1000, '2026-09-05', { installment: { ...installment, number: 3 } }),
        // só maio está na janela de 6 meses (mai–out)
        tx('Curso', 3000, '2026-03-05'),
        tx('Curso', 3000, '2026-04-05'),
        tx('Curso', 3000, '2026-05-05'),
        // outubro é depois de today
        tx('Internet', 9900, '2026-08-20'),
        tx('Internet', 9900, '2026-09-20'),
        tx('Internet', 9900, '2026-10-20'),
        // padaria: várias vezes por mês não é conta mensal
        ...['07', '08', '09'].flatMap((m) =>
          ['03', '10', '17'].map((d) => tx('Padaria', 800, `2026-${m}-${d}`)),
        ),
        // transferências nunca entram
        tx('Reserva', 50000, '2026-07-01', { type: 'transferencia', toAccountId: 'sav', categoryId: null }),
        tx('Reserva', 50000, '2026-08-01', { type: 'transferencia', toAccountId: 'sav', categoryId: null }),
        tx('Reserva', 50000, '2026-09-01', { type: 'transferencia', toAccountId: 'sav', categoryId: null }),
      ],
    });
    expect(detectRecurringCandidates(data, today)).toEqual([]);
  });

  it('pula grupos cobertos por regra ativa do mesmo tipo e ordena despesas antes de receitas', () => {
    const months = ['2026-06-30', '2026-07-31', '2026-08-31'];
    const data = makeData({
      transactions: [
        ...months.map((d) => tx('Aluguel', 150000, d, { categoryId: 'cat-moradia' })),
        ...months.map((d) => tx('Condomínio', 80000, d, { categoryId: 'cat-moradia' })),
        ...months.map((d) => tx('Seguro', 20000, d)),
        ...months.map((d) => tx('Salário', 500000, d, { type: 'receita', categoryId: 'cat-salario' })),
      ],
      recurring: [
        makeRecurring({ accountId: acc, description: 'ALUGUEL', type: 'despesa' }),
        makeRecurring({ accountId: acc, description: 'Seguro', active: false }),
        // mesma descrição mas tipo diferente não cobre
        makeRecurring({ accountId: acc, description: 'Condominio', type: 'receita' }),
      ],
    });
    const candidates = detectRecurringCandidates(data, today);
    expect(candidates.map((c) => c.key)).toEqual(['condominio|despesa', 'seguro|despesa', 'salario|receita']);
    // âncora de fim de mês: 31/08 + 1 mês = 30/09
    expect(candidates[0]).toMatchObject({
      lastDate: '2026-08-31',
      nextExpectedDate: '2026-09-30',
      amount: 80000,
    });
    expect(candidates[2]).toMatchObject({
      type: 'receita',
      description: 'Salário',
      categoryId: 'cat-salario',
    });
  });
});
