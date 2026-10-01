import { describe, expect, it } from 'vitest';
import { makeContribution, makeGoal } from '@/test/factories';
import { goalProgress, goalsOverview } from './goals';

const TODAY = '2026-10-15';

describe('goalProgress', () => {
  it('meta no ritmo: média dos 3 meses cobre o aporte necessário (conferido à mão)', () => {
    const goal = makeGoal({ id: 'g', targetAmount: 1200000, targetDate: '2027-03-31' });
    const contributions = [
      makeContribution({ goalId: 'g', amount: 300000, date: '2026-08-10' }),
      makeContribution({ goalId: 'g', amount: 100000, date: '2026-09-10' }),
      makeContribution({ goalId: 'g', amount: 200000, date: '2026-10-05' }),
      makeContribution({ goalId: 'outra', amount: 999999, date: '2026-10-05' }),
    ];
    const p = goalProgress(goal, contributions, TODAY);
    expect(p).toMatchObject({
      goalId: 'g',
      saved: 600000,
      remaining: 600000,
      percent: 0.5,
      monthsLeft: 5, // out/26 -> mar/27
      requiredMonthly: 120000,
      averageMonthlyContribution: 200000, // (300.000 + 100.000 + 200.000) / 3
      projectedCompletionDate: '2027-01-15', // 600.000 / 200.000 = 3 meses
      track: 'no_ritmo',
    });
  });

  it('aporte fora da janela de 3 meses não conta no ritmo => atrasada e sem projeção', () => {
    const goal = makeGoal({ id: 'g', targetAmount: 1200000, targetDate: '2027-03-31' });
    const contributions = [makeContribution({ goalId: 'g', amount: 600000, date: '2026-07-31' })];
    const p = goalProgress(goal, contributions, TODAY);
    expect(p.averageMonthlyContribution).toBe(0);
    expect(p.track).toBe('atrasada');
    expect(p.projectedCompletionDate).toBeNull();
  });

  it('arredonda o aporte necessário para cima e a média ao centavo', () => {
    const goal = makeGoal({ id: 'g', targetAmount: 100000, targetDate: '2027-01-10' });
    const contributions = [makeContribution({ goalId: 'g', amount: 100, date: '2026-10-01' })];
    const p = goalProgress(goal, contributions, TODAY);
    // remaining 99.900 / 3 meses = 33.300 exatos; média 100 / 3 = 33,33 => 33.
    expect(p.monthsLeft).toBe(3);
    expect(p.requiredMonthly).toBe(33300);
    expect(p.averageMonthlyContribution).toBe(33);

    const odd = goalProgress(
      makeGoal({ id: 'h', targetAmount: 100000, targetDate: '2027-01-10' }),
      [],
      TODAY,
    );
    expect(odd.requiredMonthly).toBe(33334); // ceil(100.000 / 3)
  });

  it('prazo no mês corrente (mesmo que hoje) conta como 1 mês restante', () => {
    const goal = makeGoal({ id: 'g', targetAmount: 50000, targetDate: TODAY });
    const p = goalProgress(goal, [], TODAY);
    expect(p.monthsLeft).toBe(1);
    expect(p.requiredMonthly).toBe(50000);
    expect(p.track).toBe('atrasada');
  });

  it('prazo vencido: monthsLeft 0, precisa de todo o restante', () => {
    const goal = makeGoal({ id: 'g', targetAmount: 50000, targetDate: '2026-10-14' });
    const p = goalProgress(
      goal,
      [makeContribution({ goalId: 'g', amount: 20000, date: '2026-10-01' })],
      TODAY,
    );
    expect(p.monthsLeft).toBe(0);
    expect(p.requiredMonthly).toBe(30000);
    expect(p.track).toBe('vencida');
  });

  it('sem prazo: monthsLeft/requiredMonthly nulos e projeção pelo ritmo', () => {
    const goal = makeGoal({ id: 'g', targetAmount: 100000, targetDate: null });
    const p = goalProgress(
      goal,
      [makeContribution({ goalId: 'g', amount: 30000, date: '2026-09-20' })],
      TODAY,
    );
    expect(p.monthsLeft).toBeNull();
    expect(p.requiredMonthly).toBeNull();
    expect(p.averageMonthlyContribution).toBe(10000);
    expect(p.track).toBe('sem_prazo');
    // 70.000 / 10.000 = 7 meses
    expect(p.projectedCompletionDate).toBe('2027-05-15');
  });

  it('resgates reduzem o saldo, que nunca fica negativo', () => {
    const goal = makeGoal({ id: 'g', targetAmount: 100000 });
    const contributions = [
      makeContribution({ goalId: 'g', amount: 30000, date: '2026-09-01' }),
      makeContribution({ goalId: 'g', amount: -50000, date: '2026-10-01' }),
    ];
    const p = goalProgress(goal, contributions, TODAY);
    expect(p.saved).toBe(0);
    expect(p.remaining).toBe(100000);
    expect(p.percent).toBe(0);
    // Ritmo líquido negativo (-20.000 / 3) => sem projeção e sem -0.
    expect(p.averageMonthlyContribution).toBe(-6667);
    expect(p.projectedCompletionDate).toBeNull();
  });

  it('concluída ao atingir o alvo: percent limitado a 1, nada a aportar, data em que atingiu', () => {
    const goal = makeGoal({ id: 'g', targetAmount: 100000, targetDate: '2027-06-30' });
    const contributions = [
      makeContribution({ goalId: 'g', amount: 60000, date: '2026-05-01' }),
      makeContribution({ goalId: 'g', amount: 50000, date: '2026-08-20' }),
      makeContribution({ goalId: 'g', amount: 10000, date: '2026-09-01' }),
    ];
    const p = goalProgress(goal, contributions, TODAY);
    expect(p.saved).toBe(120000);
    expect(p.remaining).toBe(0);
    expect(p.percent).toBe(1);
    expect(p.requiredMonthly).toBe(0);
    expect(p.track).toBe('concluida');
    expect(p.projectedCompletionDate).toBe('2026-08-20');
  });

  it('status concluída manual vence o saldo; pausada vence tudo', () => {
    const goal = makeGoal({ id: 'g', targetAmount: 100000, status: 'concluida' });
    const contributions = [makeContribution({ goalId: 'g', amount: 40000, date: '2026-03-01' })];
    const done = goalProgress(goal, contributions, TODAY);
    expect(done.track).toBe('concluida');
    expect(done.requiredMonthly).toBe(0);
    expect(done.projectedCompletionDate).toBe('2026-03-01');

    const paused = goalProgress({ ...goal, status: 'pausada', targetAmount: 10000 }, contributions, TODAY);
    expect(paused.track).toBe('pausada');
  });
});

describe('goalsOverview', () => {
  it('ordena ativas por prioridade e prazo, depois pausadas e concluídas, e soma os totais', () => {
    const goals = [
      makeGoal({ id: 'done', name: 'Notebook', targetAmount: 50000, priority: 'alta', status: 'concluida' }),
      makeGoal({ id: 'paused', name: 'Carro', targetAmount: 3000000, priority: 'alta', status: 'pausada' }),
      makeGoal({
        id: 'baixa',
        name: 'Curso',
        targetAmount: 200000,
        priority: 'baixa',
        targetDate: '2026-12-31',
      }),
      makeGoal({
        id: 'alta-tarde',
        name: 'Viagem',
        targetAmount: 600000,
        priority: 'alta',
        targetDate: '2027-12-31',
      }),
      makeGoal({
        id: 'alta-cedo',
        name: 'Reserva',
        targetAmount: 1000000,
        priority: 'alta',
        targetDate: '2027-03-31',
      }),
      makeGoal({ id: 'alta-sem', name: 'Casa', targetAmount: 100000, priority: 'alta', targetDate: null }),
      // Ativa que já atingiu o alvo conta como concluída.
      makeGoal({
        id: 'atingida',
        name: 'Celular',
        targetAmount: 10000,
        priority: 'media',
        targetDate: '2027-01-31',
      }),
    ];
    const contributions = [
      makeContribution({ goalId: 'done', amount: 50000, date: '2026-02-01' }),
      makeContribution({ goalId: 'atingida', amount: 10000, date: '2026-10-01' }),
      makeContribution({ goalId: 'alta-cedo', amount: 400000, date: '2026-10-01' }),
    ];
    const ov = goalsOverview(goals, contributions, TODAY);

    expect(ov.items.map((i) => i.goalId)).toEqual([
      'alta-cedo',
      'alta-tarde',
      'alta-sem',
      'baixa',
      'paused',
      'done', // concluídas também por prioridade: alta antes de média
      'atingida',
    ]);
    expect(ov.activeCount).toBe(4);
    expect(ov.completedCount).toBe(2);
    expect(ov.totalTarget).toBe(4960000);
    expect(ov.totalSaved).toBe(460000);
    // alta-cedo: 600.000 / 5 = 120.000; alta-tarde: 600.000 / 14 = 42.857,14 => 42.858; baixa: 200.000 / 2 = 100.000.
    expect(ov.totalRequiredMonthly).toBe(120000 + 42858 + 100000);
  });

  it('lista vazia', () => {
    expect(goalsOverview([], [], TODAY)).toEqual({
      totalTarget: 0,
      totalSaved: 0,
      activeCount: 0,
      completedCount: 0,
      totalRequiredMonthly: 0,
      items: [],
    });
  });
});
