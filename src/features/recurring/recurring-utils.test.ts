import { describe, expect, it } from 'vitest';
import { makeAccount, makeRecurring, makeTransaction } from '@/test/factories';
import {
  isEnded,
  monthlyEquivalent,
  pastOccurrences,
  pendingByRule,
  recomputeNextDate,
  recurringTotals,
  rescheduleNextDate,
  resumeNextDate,
  ruleNextDue,
  skipToCurrentMonth,
  validateRecurringForm,
} from './recurring-utils';

const TODAY = '2026-10-15';
const acc = makeAccount();

describe('monthlyEquivalent', () => {
  it('converte cada frequência para valor mensal arredondado ao centavo', () => {
    expect(monthlyEquivalent(10000, 'mensal')).toBe(10000);
    expect(monthlyEquivalent(1000, 'semanal')).toBe(4333);
    expect(monthlyEquivalent(1000, 'quinzenal')).toBe(2000); // duas vezes por mês (antes: 26/12 => 2.167)
    expect(monthlyEquivalent(999, 'bimestral')).toBe(500);
    expect(monthlyEquivalent(9000, 'trimestral')).toBe(3000);
    expect(monthlyEquivalent(60000, 'semestral')).toBe(10000);
    expect(monthlyEquivalent(120000, 'anual')).toBe(10000);
  });
});

describe('recurringTotals', () => {
  it('soma só regras ativas e não encerradas, separando receitas e custo fixo', () => {
    const rules = [
      makeRecurring({ accountId: acc.id, type: 'receita', amount: 500000 }),
      makeRecurring({ accountId: acc.id, amount: 150000 }),
      makeRecurring({ accountId: acc.id, amount: 120000, frequency: 'anual' }),
      makeRecurring({ accountId: acc.id, amount: 99999, active: false }),
      makeRecurring({ accountId: acc.id, amount: 77777, endDate: '2026-09-30', nextDate: '2026-10-05' }),
    ];
    expect(recurringTotals(rules)).toEqual({
      income: 500000,
      expense: 160000,
      net: 340000,
      activeCount: 3,
      pausedCount: 1,
    });
    expect(recurringTotals([])).toEqual({ income: 0, expense: 0, net: 0, activeCount: 0, pausedCount: 0 });
  });

  it('isEnded só quando a próxima ocorrência passou do término', () => {
    expect(isEnded(makeRecurring({ accountId: acc.id, endDate: '2026-10-05', nextDate: '2026-10-05' }))).toBe(
      false,
    );
    expect(isEnded(makeRecurring({ accountId: acc.id, endDate: '2026-10-04', nextDate: '2026-10-05' }))).toBe(
      true,
    );
  });
});

describe('ruleNextDue', () => {
  const rule = makeRecurring({ accountId: acc.id, nextDate: '2026-11-05' });
  it('prefere o pendente gerado mais antigo (e marca atraso)', () => {
    const txs = [
      makeTransaction({ accountId: acc.id, recurringId: rule.id, date: '2026-10-05', status: 'pendente' }),
      makeTransaction({ accountId: acc.id, recurringId: rule.id, date: '2026-09-05', status: 'pendente' }),
      makeTransaction({ accountId: acc.id, recurringId: rule.id, date: '2026-08-05', status: 'pago' }),
    ];
    expect(ruleNextDue(rule, pendingByRule(txs), TODAY)).toEqual({
      date: '2026-09-05',
      generated: true,
      overdue: true,
    });
  });
  it('sem pendentes usa a próxima ocorrência; encerrada => null', () => {
    expect(ruleNextDue(rule, new Map(), TODAY)).toEqual({
      date: '2026-11-05',
      generated: false,
      overdue: false,
    });
    const ended = { ...rule, endDate: '2026-10-31' };
    expect(ruleNextDue(ended, new Map(), TODAY)).toBeNull();
  });
});

describe('agenda', () => {
  it('recomputeNextDate: sem lançamentos gerados (ou só em meses anteriores) começa no início', () => {
    expect(recomputeNextDate('2026-10-10', 'mensal', null)).toBe('2026-10-10');
    expect(recomputeNextDate('2026-10-10', 'mensal', '2026-09-05')).toBe('2026-10-10');
    expect(recomputeNextDate('2026-10-10', 'semanal', '2026-10-05')).toBe('2026-10-10');
  });
  it('recomputeNextDate: em frequências mensais ou maiores não repete um mês que já tem lançamento', () => {
    // conta de outubro já lançada no dia 10; o vencimento mudou para o dia 15 => próxima só em novembro
    expect(recomputeNextDate('2026-08-15', 'mensal', '2026-10-10')).toBe('2026-11-15');
    expect(recomputeNextDate('2026-10-15', 'mensal', '2026-10-10')).toBe('2026-11-15');
    expect(recomputeNextDate('2026-08-15', 'bimestral', '2026-10-10')).toBe('2026-12-15');
  });
  it('rescheduleNextDate: continua depois do último lançamento que sobrou e não gera meses passados', () => {
    // pendente de outubro removido; sobrou setembro pago => outubro na nova data
    expect(rescheduleNextDate('2026-08-15', 'mensal', '2026-09-10', TODAY)).toBe('2026-10-15');
    // nada gerado e início no passado => começa no mês corrente
    expect(rescheduleNextDate('2026-06-05', 'mensal', null, TODAY)).toBe('2026-10-05');
    expect(rescheduleNextDate('2026-12-05', 'mensal', null, TODAY)).toBe('2026-12-05');
  });
  it('recomputeNextDate: pula ocorrências já geradas, respeitando o dia âncora', () => {
    expect(recomputeNextDate('2026-08-31', 'mensal', '2026-09-01')).toBe('2026-10-31');
    expect(recomputeNextDate('2026-10-01', 'semanal', '2026-10-15')).toBe('2026-10-22');
  });
  it('resumeNextDate: ao reativar pula meses anteriores ao corrente (âncora 31 volta a 31)', () => {
    const paused = makeRecurring({
      accountId: acc.id,
      startDate: '2026-01-31',
      nextDate: '2026-06-30',
      active: false,
    });
    expect(resumeNextDate(paused, TODAY)).toBe('2026-10-31');
    const recent = makeRecurring({ accountId: acc.id, startDate: '2026-10-20', nextDate: '2026-10-20' });
    expect(resumeNextDate(recent, TODAY)).toBe('2026-10-20');
  });
  it('skipToCurrentMonth mantém datas do mês corrente ou futuras', () => {
    expect(skipToCurrentMonth('2026-10-02', 'mensal', 2, TODAY)).toBe('2026-10-02');
    expect(skipToCurrentMonth('2026-12-02', 'mensal', 2, TODAY)).toBe('2026-12-02');
    expect(skipToCurrentMonth('2026-07-10', 'mensal', 10, TODAY)).toBe('2026-10-10');
  });
  it('pastOccurrences lista as ocorrências de meses anteriores de uma regra nova (respeitando o término)', () => {
    expect(pastOccurrences('2026-01-05', 'mensal', null, TODAY)).toEqual([
      '2026-01-05',
      '2026-02-05',
      '2026-03-05',
      '2026-04-05',
      '2026-05-05',
      '2026-06-05',
      '2026-07-05',
      '2026-08-05',
      '2026-09-05',
    ]);
    expect(pastOccurrences('2026-01-31', 'trimestral', '2026-06-30', TODAY)).toEqual(['2026-01-31', '2026-04-30']);
    expect(pastOccurrences('2026-10-05', 'mensal', null, TODAY)).toEqual([]);
    expect(pastOccurrences('', 'mensal', null, TODAY)).toEqual([]);
  });
});

describe('validateRecurringForm', () => {
  const ok = {
    amount: 1000,
    categoryId: 'c',
    accountId: 'a',
    startDate: '2026-10-01',
    endDate: '',
    today: TODAY,
  };
  it('aceita término vazio', () => {
    expect(validateRecurringForm(ok)).toEqual({});
  });
  it('mensagens em pt-BR para cada campo', () => {
    expect(
      validateRecurringForm({
        amount: null,
        categoryId: null,
        accountId: null,
        startDate: '',
        endDate: 'x',
        today: TODAY,
      }),
    ).toEqual({
      amount: 'Informe um valor maior que zero.',
      categoryId: 'Escolha uma categoria.',
      accountId: 'Escolha uma conta.',
      startDate: 'Informe a data de início.',
      endDate: 'Informe uma data válida ou deixe em branco.',
    });
    expect(validateRecurringForm({ ...ok, endDate: '2026-09-30' }).endDate).toBe(
      'O término deve ser depois do início.',
    );
    expect(validateRecurringForm({ ...ok, endDate: '2026-10-01' })).toEqual({});
  });
  it('ano digitado errado no início ou no término não passa', () => {
    expect(validateRecurringForm({ ...ok, startDate: '0226-10-01' }).startDate).toBe(
      'Confira o ano da data.',
    );
    expect(validateRecurringForm({ ...ok, endDate: '2206-10-01' }).endDate).toBe('Confira o ano da data.');
    expect(validateRecurringForm({ ...ok, endDate: '2030-10-01' })).toEqual({});
  });
});
