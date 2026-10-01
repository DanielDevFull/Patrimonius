import { describe, expect, it } from 'vitest';
import { extractPeriod } from './period';

// Hoje: quinta-feira, 01/10/2026.
const TODAY = '2026-10-01';

describe('extractPeriod', () => {
  it.each([
    ['hoje', '2026-10-01', '2026-10-01', 'hoje'],
    ['hj', '2026-10-01', '2026-10-01', 'hoje'],
    ['ontem', '2026-09-30', '2026-09-30', 'ontem'],
    ['anteontem', '2026-09-29', '2026-09-29', 'anteontem'],
    ['amanhã', '2026-10-02', '2026-10-02', 'amanhã'],
    ['esta semana', '2026-09-28', '2026-10-04', 'esta semana'],
    ['essa semana', '2026-09-28', '2026-10-04', 'esta semana'],
    ['nesta semana', '2026-09-28', '2026-10-04', 'esta semana'],
    ['o que vence na semana?', '2026-09-28', '2026-10-04', 'esta semana'],
    ['semana passada', '2026-09-21', '2026-09-27', 'semana passada'],
    ['próxima semana', '2026-10-05', '2026-10-11', 'próxima semana'],
    ['este mês', '2026-10-01', '2026-10-31', 'este mês'],
    ['esse mes', '2026-10-01', '2026-10-31', 'este mês'],
    ['neste mês', '2026-10-01', '2026-10-31', 'este mês'],
    ['resumo do mês', '2026-10-01', '2026-10-31', 'este mês'],
    ['mês passado', '2026-09-01', '2026-09-30', 'mês passado'],
    ['no mês anterior', '2026-09-01', '2026-09-30', 'mês passado'],
    ['último mês', '2026-09-01', '2026-09-30', 'mês passado'],
    ['mês retrasado', '2026-08-01', '2026-08-31', 'mês retrasado'],
    ['próximo mês', '2026-11-01', '2026-11-30', 'próximo mês'],
    ['mês que vem', '2026-11-01', '2026-11-30', 'próximo mês'],
    ['em setembro', '2026-09-01', '2026-09-30', 'setembro de 2026'],
    ['em outubro', '2026-10-01', '2026-10-31', 'outubro de 2026'],
    ['em fevereiro', '2026-02-01', '2026-02-28', 'fevereiro de 2026'],
    ['em março', '2026-03-01', '2026-03-31', 'março de 2026'],
    ['setembro de 2025', '2025-09-01', '2025-09-30', 'setembro de 2025'],
    ['set/25', '2025-09-01', '2025-09-30', 'setembro de 2025'],
    ['este ano', '2026-01-01', '2026-12-31', 'este ano'],
    ['neste ano', '2026-01-01', '2026-12-31', 'este ano'],
    ['ano passado', '2025-01-01', '2025-12-31', 'ano passado'],
    ['em 2025', '2025-01-01', '2025-12-31', '2025'],
    ['últimos 3 meses', '2026-07-02', '2026-10-01', 'últimos 3 meses'],
    ['ultimos seis meses', '2026-04-02', '2026-10-01', 'últimos 6 meses'],
    ['últimos 30 dias', '2026-09-02', '2026-10-01', 'últimos 30 dias'],
    ['últimas 2 semanas', '2026-09-18', '2026-10-01', 'últimas 2 semanas'],
    ['próximos 7 dias', '2026-10-01', '2026-10-07', 'próximos 7 dias'],
  ])('%s => %s..%s (%s)', (text, start, end, label) => {
    expect(extractPeriod(text, TODAY)).toEqual({ start, end, label });
  });

  it('mês que ainda não chegou é do ano anterior', () => {
    expect(extractPeriod('gastos em dezembro', TODAY)).toEqual({
      start: '2025-12-01',
      end: '2025-12-31',
      label: 'dezembro de 2025',
    });
  });

  it('fevereiro de ano bissexto', () => {
    expect(extractPeriod('fevereiro de 2028', TODAY)?.end).toBe('2028-02-29');
  });

  it('semana de segunda a domingo também quando hoje é domingo', () => {
    expect(extractPeriod('esta semana', '2026-10-04')).toEqual({
      start: '2026-09-28',
      end: '2026-10-04',
      label: 'esta semana',
    });
  });

  it('"mês passado" em janeiro volta para dezembro do ano anterior', () => {
    expect(extractPeriod('mês passado', '2027-01-15')).toEqual({
      start: '2026-12-01',
      end: '2026-12-31',
      label: 'mês passado',
    });
  });

  it('"mês passado" tem prioridade sobre "mês"', () => {
    expect(extractPeriod('como foi o mês passado', TODAY)?.label).toBe('mês passado');
  });

  it.each(['por mês', 'todo mês', 'quanto gastei?', 'nada aqui', ''])('sem período: "%s"', (text) => {
    expect(extractPeriod(text, TODAY)).toBeNull();
  });
});
