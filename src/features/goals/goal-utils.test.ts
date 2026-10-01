import { describe, expect, it } from 'vitest';
import { goalProgress } from '@/analytics';
import { makeContribution, makeGoal } from '@/test/factories';
import {
  coachTip,
  completesGoal,
  contributionsOf,
  goalTemplates,
  monthlyPlan,
  reconcileStatus,
  savedFor,
  sectionOf,
  validateContribution,
  validateGoalForm,
} from './goal-utils';

const TODAY = '2026-10-15';

describe('goalTemplates', () => {
  it('traz os seis modelos e usa o alvo da reserva de emergência quando > 0', () => {
    const list = goalTemplates({ target: 1500000, targetMonths: 6 });
    expect(list.map((t) => t.name)).toEqual([
      'Reserva de emergência',
      'Viagem',
      'Carro',
      'Casa própria',
      'Aposentadoria',
      'Estudos',
    ]);
    expect(list[0]).toMatchObject({ target: 1500000, priority: 'alta', icon: '🛟' });
    expect(list[0].description).toContain('6 meses');
    expect(list.slice(1).every((t) => t.target === null)).toBe(true);
  });

  it('sem dados para a reserva, deixa o alvo em branco', () => {
    expect(goalTemplates({ target: 0, targetMonths: 6 })[0].target).toBeNull();
  });
});

describe('monthlyPlan', () => {
  it('divide o que falta pelos meses de aporte até o prazo, contando o mês atual (arredondando para cima)', () => {
    // out/26 a abr/27 = 7 meses (sem aporte em outubro ainda).
    expect(monthlyPlan(1000000, 0, '2027-04-30', TODAY)).toEqual({ months: 7, monthly: 142858 });
    // Já aportou neste mês: restam nov a abr.
    expect(monthlyPlan(1000000, 400000, '2027-04-01', TODAY, true)).toEqual({ months: 6, monthly: 100000 });
  });

  it('prazo no mês atual conta como 1 mês; já atingido => 0', () => {
    expect(monthlyPlan(50000, 0, '2026-10-31', TODAY)).toEqual({ months: 1, monthly: 50000 });
    expect(monthlyPlan(50000, 0, '2026-10-31', TODAY, true)).toEqual({ months: 1, monthly: 50000 });
    expect(monthlyPlan(50000, 80000, '2027-01-31', TODAY)).toEqual({ months: 4, monthly: 0 });
  });

  it('null sem alvo, sem prazo, prazo inválido ou no passado', () => {
    expect(monthlyPlan(null, 0, '2027-01-01', TODAY)).toBeNull();
    expect(monthlyPlan(0, 0, '2027-01-01', TODAY)).toBeNull();
    expect(monthlyPlan(1000, 0, null, TODAY)).toBeNull();
    expect(monthlyPlan(1000, 0, '2027-02-30', TODAY)).toBeNull();
    expect(monthlyPlan(1000, 0, '2026-10-14', TODAY)).toBeNull();
  });

  it('é consistente com o requiredMonthly de goalProgress', () => {
    const goal = makeGoal({ targetAmount: 1234567, targetDate: '2027-08-20' });
    const contributions = [makeContribution({ goalId: goal.id, amount: 34567, date: '2026-09-01' })];
    const p = goalProgress(goal, contributions, TODAY);
    expect(monthlyPlan(goal.targetAmount, p.saved, goal.targetDate, TODAY)?.monthly).toBe(p.requiredMonthly);
    const withOctober = [...contributions, makeContribution({ goalId: goal.id, amount: 10000, date: '2026-10-02' })];
    const q = goalProgress(goal, withOctober, TODAY);
    expect(monthlyPlan(goal.targetAmount, q.saved, goal.targetDate, TODAY, true)?.monthly).toBe(q.requiredMonthly);
  });
});

describe('validateGoalForm', () => {
  it('exige nome e valor > 0; prazo é opcional', () => {
    expect(validateGoalForm({ name: '  ', target: null, targetDate: '' }, TODAY)).toEqual({
      name: 'Dê um nome para a meta.',
      target: 'Informe um valor maior que zero.',
    });
    expect(validateGoalForm({ name: 'Viagem', target: 0, targetDate: '' }, TODAY).target).toBeDefined();
    expect(validateGoalForm({ name: 'Viagem', target: 100, targetDate: '' }, TODAY)).toEqual({});
  });

  it('prazo inválido ou no passado é rejeitado, exceto o prazo já salvo da meta em edição', () => {
    expect(validateGoalForm({ name: 'X', target: 1, targetDate: '2026-13-01' }, TODAY).targetDate).toBe(
      'Data inválida.',
    );
    expect(validateGoalForm({ name: 'X', target: 1, targetDate: '2026-10-14' }, TODAY).targetDate).toBe(
      'Escolha uma data a partir de hoje.',
    );
    expect(validateGoalForm({ name: 'X', target: 1, targetDate: TODAY }, TODAY)).toEqual({});
    expect(validateGoalForm({ name: 'X', target: 1, targetDate: '2026-01-01' }, TODAY, '2026-01-01')).toEqual({});
  });
});

describe('validateContribution', () => {
  it('valor > 0 e data válida', () => {
    expect(validateContribution('aporte', null, 0, TODAY)).toEqual({ amount: 'Informe um valor maior que zero.' });
    expect(validateContribution('aporte', 100, 0, '')).toEqual({ date: 'Informe uma data válida.' });
    expect(validateContribution('aporte', 999999, 0, TODAY)).toEqual({});
  });

  it('resgate não pode passar do valor guardado', () => {
    expect(validateContribution('resgate', 5001, 5000, TODAY).amount).toBe(
      'O resgate não pode ser maior que o valor guardado.',
    );
    expect(validateContribution('resgate', 5000, 5000, TODAY)).toEqual({});
  });
});

describe('status', () => {
  it('completesGoal só quando o aporte cruza o alvo de uma meta ativa', () => {
    const goal = { status: 'ativa' as const, targetAmount: 10000 };
    expect(completesGoal(goal, 6000, 4000)).toBe(true);
    expect(completesGoal(goal, 6000, 5000)).toBe(true);
    expect(completesGoal(goal, 6000, 3999)).toBe(false);
    expect(completesGoal(goal, 10000, 100)).toBe(false); // já estava concluída pelo valor
    expect(completesGoal(goal, 12000, -1000)).toBe(false);
    expect(completesGoal({ ...goal, status: 'pausada' }, 6000, 4000)).toBe(false);
  });

  it('reconcileStatus mantém pausada e alinha ativa/concluída com o valor guardado', () => {
    expect(reconcileStatus('pausada', 99999, 100)).toBe('pausada');
    expect(reconcileStatus('ativa', 100, 100)).toBe('concluida');
    expect(reconcileStatus('concluida', 99, 100)).toBe('ativa');
    expect(reconcileStatus('ativa', 0, 100)).toBe('ativa');
  });

  it('sectionOf separa em andamento, pausadas e concluídas', () => {
    expect(sectionOf('no_ritmo')).toBe('andamento');
    expect(sectionOf('atrasada')).toBe('andamento');
    expect(sectionOf('vencida')).toBe('andamento');
    expect(sectionOf('sem_prazo')).toBe('andamento');
    expect(sectionOf('pausada')).toBe('pausadas');
    expect(sectionOf('concluida')).toBe('concluidas');
  });
});

describe('aportes', () => {
  it('savedFor soma aportes e resgates da meta (mínimo 0)', () => {
    const list = [
      makeContribution({ goalId: 'g1', amount: 5000 }),
      makeContribution({ goalId: 'g1', amount: -2000 }),
      makeContribution({ goalId: 'g2', amount: 7000 }),
      makeContribution({ goalId: 'g3', amount: -100 }),
    ];
    expect(savedFor('g1', list)).toBe(3000);
    expect(savedFor('g3', list)).toBe(0);
    expect(savedFor('nada', list)).toBe(0);
  });

  it('contributionsOf ordena do mais recente para o mais antigo (empate: criado por último primeiro)', () => {
    const list = [
      makeContribution({ id: 'a', goalId: 'g', date: '2026-09-01', createdAt: '2026-09-01T10:00:00.000Z' }),
      makeContribution({ id: 'b', goalId: 'g', date: '2026-10-01', createdAt: '2026-10-01T10:00:00.000Z' }),
      makeContribution({ id: 'c', goalId: 'g', date: '2026-10-01', createdAt: '2026-10-01T11:00:00.000Z' }),
      makeContribution({ id: 'x', goalId: 'outra', date: '2026-12-01' }),
    ];
    expect(contributionsOf('g', list).map((c) => c.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('coachTip', () => {
  it('sugere o aporte extra quando a meta está atrasada', () => {
    // Criada em julho; só um aporte de 30.000 (em outubro) => média 7.500 em jul–out; faltam 90.000 em 6 meses.
    const goal = makeGoal({ targetAmount: 120000, targetDate: '2027-04-30', createdAt: '2026-07-01T12:00:00.000Z' });
    const contributions = [makeContribution({ goalId: goal.id, amount: 30000, date: '2026-10-01' })];
    const p = goalProgress(goal, contributions, TODAY);
    expect(p.track).toBe('atrasada');
    expect(p.requiredMonthly).toBe(15000);
    expect(coachTip(p)).toEqual({ kind: 'atrasada', extraMonthly: 15000 - 7500 });
  });

  it('cobre vencida, no ritmo, sem prazo (com e sem ritmo) e nada para concluída/pausada', () => {
    const vencida = goalProgress(makeGoal({ targetAmount: 5000, targetDate: '2026-09-30' }), [], TODAY);
    expect(coachTip(vencida)).toEqual({ kind: 'vencida', remaining: 5000 });

    const g = makeGoal({ targetAmount: 30000, targetDate: '2027-01-31' });
    const ritmo = goalProgress(g, [makeContribution({ goalId: g.id, amount: 27000, date: '2026-10-01' })], TODAY);
    expect(coachTip(ritmo)).toEqual({ kind: 'no_ritmo' });

    const semPrazo = makeGoal({ targetAmount: 30000, targetDate: null });
    expect(coachTip(goalProgress(semPrazo, [], TODAY))).toEqual({ kind: 'sem_aportes' });
    const comRitmo = goalProgress(
      semPrazo,
      [makeContribution({ goalId: semPrazo.id, amount: 3000, date: '2026-10-01' })],
      TODAY,
    );
    expect(coachTip(comRitmo)).toEqual({ kind: 'sem_prazo_com_ritmo', date: comRitmo.projectedCompletionDate });

    // Meta criada neste mês, sem aportes: não está atrasada, mas a dica é de como começar (60.000 em 7 meses).
    const nova = goalProgress(makeGoal({ targetAmount: 60000, targetDate: '2027-04-30' }), [], TODAY);
    expect(nova.track).toBe('no_ritmo');
    expect(coachTip(nova)).toEqual({ kind: 'comecar', monthly: 8572 });
    // Criada há meses e nunca recebeu aporte: atrasada, com a mesma dica de começar.
    const parada = goalProgress(
      makeGoal({ targetAmount: 60000, targetDate: '2027-04-30', createdAt: '2026-06-01T12:00:00.000Z' }),
      [],
      TODAY,
    );
    expect(parada.track).toBe('atrasada');
    expect(coachTip(parada)).toEqual({ kind: 'comecar', monthly: 8572 });

    expect(coachTip(goalProgress(makeGoal({ status: 'pausada' }), [], TODAY))).toBeNull();
    expect(coachTip(goalProgress(makeGoal({ status: 'concluida' }), [], TODAY))).toBeNull();
  });
});
