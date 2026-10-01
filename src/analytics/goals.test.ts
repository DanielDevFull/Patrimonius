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
      averageMonthlyContribution: 200000, // (300.000 + 100.000 + 200.000) / 3 meses (ago, set e out, que já teve aporte)
      projectedCompletionDate: '2027-01-15', // 600.000 / 200.000 = 3 meses
      track: 'no_ritmo',
    });
  });

  it('aporte fora da janela de 3 meses não conta no ritmo => atrasada e sem projeção', () => {
    const goal = makeGoal({ id: 'g', targetAmount: 1200000, targetDate: '2027-03-31' });
    // Janela em 15/10 sem aporte no mês: jul, ago e set.
    const contributions = [makeContribution({ goalId: 'g', amount: 600000, date: '2026-06-30' })];
    const p = goalProgress(goal, contributions, TODAY);
    expect(p.averageMonthlyContribution).toBe(0);
    expect(p.track).toBe('atrasada');
    expect(p.projectedCompletionDate).toBeNull();
  });

  it('arredonda o aporte necessário para cima e a média ao centavo', () => {
    const goal = makeGoal({ id: 'g', targetAmount: 100000, targetDate: '2027-01-10' });
    const contributions = [makeContribution({ goalId: 'g', amount: 100, date: '2026-10-01' })];
    const p = goalProgress(goal, contributions, TODAY);
    // Outubro já teve aporte: restam nov, dez e jan => 99.900 / 3 = 33.300 exatos; meta começou em outubro => média 100.
    expect(p.monthsLeft).toBe(3);
    expect(p.requiredMonthly).toBe(33300);
    expect(p.averageMonthlyContribution).toBe(100);

    const odd = goalProgress(
      makeGoal({ id: 'h', targetAmount: 100000, targetDate: '2026-12-10' }),
      [],
      TODAY,
    );
    expect(odd.monthsLeft).toBe(3); // out (ainda sem aporte), nov e dez
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
    // Primeiro aporte em setembro e outubro ainda sem aporte: só setembro na janela.
    expect(p.averageMonthlyContribution).toBe(30000);
    expect(p.track).toBe('sem_prazo');
    // 70.000 / 30.000 => 3 meses
    expect(p.projectedCompletionDate).toBe('2027-01-15');
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
    // Ritmo líquido negativo (-20.000 em set e out) => sem projeção.
    expect(p.averageMonthlyContribution).toBe(-10000);
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

describe('goalProgress — ritmo estável ao longo do mês', () => {
  // R$ 12.000 até 31/01/2027, aporte de R$ 1.000 todo dia 5 de jan a set (R$ 9.000 guardados).
  const goal = makeGoal({
    id: 'g',
    targetAmount: 1200000,
    targetDate: '2027-01-31',
    createdAt: '2026-01-02T12:00:00.000Z',
  });
  const monthly = Array.from({ length: 9 }, (_, i) =>
    makeContribution({ goalId: 'g', amount: 100000, date: `2026-${String(i + 1).padStart(2, '0')}-05` }),
  );

  it('antes do aporte do mês continua no ritmo (o mês corrente incompleto não entra na média)', () => {
    const p = goalProgress(goal, monthly, '2026-10-01');
    // Antes: média 666,67 (÷ 3 com outubro vazio), 'atrasada' e previsão em mar/2027.
    expect(p.averageMonthlyContribution).toBe(100000);
    expect(p.monthsLeft).toBe(4); // out, nov, dez e jan
    expect(p.requiredMonthly).toBe(75000);
    expect(p.track).toBe('no_ritmo');
    expect(p.projectedCompletionDate).toBe('2027-01-01');
  });

  it('depois do aporte do mês: mesma média e o mês atual deixa de contar como disponível', () => {
    const after = [...monthly, makeContribution({ goalId: 'g', amount: 100000, date: '2026-10-05' })];
    const p = goalProgress(goal, after, '2026-10-05');
    expect(p.averageMonthlyContribution).toBe(100000);
    expect(p.monthsLeft).toBe(3);
    expect(p.requiredMonthly).toBe(66667);
    expect(p.track).toBe('no_ritmo');
  });

  it('meta nova: o ritmo divide só pelos meses desde o início da meta', () => {
    const nova = makeGoal({ id: 'n', targetAmount: 600000, targetDate: '2027-04-30', createdAt: '2026-10-01T12:00:00.000Z' });
    const p = goalProgress(nova, [makeContribution({ goalId: 'n', amount: 100000, date: '2026-10-01' })], '2026-10-01');
    // Antes: média 333,33, 'atrasada' e previsão em fev/2028.
    expect(p.averageMonthlyContribution).toBe(100000);
    expect(p.monthsLeft).toBe(6); // nov a abr
    expect(p.requiredMonthly).toBe(83334);
    expect(p.track).toBe('no_ritmo');
    expect(p.projectedCompletionDate).toBe('2027-03-01');
  });

  it('prazo no fim do ano visto em 1º/10 conta outubro como mês de aporte', () => {
    const p = goalProgress(makeGoal({ id: 'x', targetAmount: 300000, targetDate: '2026-12-31' }), [], '2026-10-01');
    expect(p.monthsLeft).toBe(3);
    expect(p.requiredMonthly).toBe(100000); // antes: 150.000 (só nov e dez)
  });
});

describe('goalProgress — meta recém-criada', () => {
  it('criada neste mês e sem aportes ainda não está atrasada', () => {
    const goal = makeGoal({ id: 'v', targetAmount: 300000, targetDate: '2027-06-30', createdAt: '2026-10-01T12:00:00.000Z' });
    const p = goalProgress(goal, [], '2026-10-01');
    expect(p.averageMonthlyContribution).toBe(0);
    expect(p.track).toBe('no_ritmo'); // antes: 'atrasada' no mesmo dia da criação
  });

  it('criada em mês anterior e sem aportes fica atrasada', () => {
    const goal = makeGoal({ id: 'v', targetAmount: 300000, targetDate: '2027-06-30', createdAt: '2026-08-10T12:00:00.000Z' });
    expect(goalProgress(goal, [], '2026-10-01').track).toBe('atrasada');
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
    // alta-cedo (aportou em out): 600.000 / 5 = 120.000; alta-tarde (out/26 a dez/27): 600.000 / 15 = 40.000;
    // baixa (out a dez): 200.000 / 3 = 66.666,67 => 66.667.
    expect(ov.totalRequiredMonthly).toBe(120000 + 40000 + 66667);
  });

  it('aporte mensal necessário não soma o saldo inteiro de metas vencidas', () => {
    const goals = [
      makeGoal({ id: 'viagem', targetAmount: 600000, targetDate: '2027-09-30' }),
      makeGoal({ id: 'note', name: 'Notebook', targetAmount: 450000, targetDate: '2026-08-31' }),
    ];
    const ov = goalsOverview(goals, [], '2026-10-01');
    expect(ov.items.find((i) => i.goalId === 'note')?.track).toBe('vencida');
    // Viagem: 600.000 / 12 meses (out/26 a set/27) = 50.000. Antes: + 450.000 da meta vencida.
    expect(ov.totalRequiredMonthly).toBe(50000);
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
