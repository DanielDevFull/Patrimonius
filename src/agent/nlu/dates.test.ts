import { describe, expect, it } from 'vitest';
import { extractDate } from './dates';

// Hoje: quinta-feira, 01/10/2026.
const TODAY = '2026-10-01';

describe('extractDate', () => {
  it.each([
    ['hoje', '2026-10-01', 'hoje'],
    ['hj', '2026-10-01', 'hj'],
    ['ontem', '2026-09-30', 'ontem'],
    ['anteontem', '2026-09-29', 'anteontem'],
    ['antes de ontem', '2026-09-29', 'antes de ontem'],
    ['amanhã', '2026-10-02', 'amanhã'],
    ['depois de amanhã', '2026-10-03', 'depois de amanhã'],
    ['gastei 45,90 no ifood ontem', '2026-09-30', 'ontem'],
    ['dia 1', '2026-10-01', 'dia 1'],
    ['dia primeiro', '2026-10-01', 'dia primeiro'],
    ['15/09', '2026-09-15', '15/09'],
    ['15/09/2026', '2026-09-15', '15/09/2026'],
    ['15/09/25', '2025-09-15', '15/09/25'],
    ['28/02/2027', '2027-02-28', '28/02/2027'],
    ['2026-09-15', '2026-09-15', '2026-09-15'],
    ['15 de setembro', '2026-09-15', '15 de setembro'],
    ['dia 5 de agosto de 2025', '2025-08-05', 'dia 5 de agosto de 2025'],
    ['3 set', '2026-09-03', '3 set'],
  ])('%s => %s', (text, date, match) => {
    expect(extractDate(text, TODAY)).toEqual({ date, match });
  });

  describe('"dia N" usa o mês corrente, ou o anterior se o dia ainda não chegou', () => {
    it.each([
      ['dia 15', '2026-09-15'],
      ['paguei dia 25', '2026-09-25'],
      ['dia 31', '2026-09-30'],
      ['dia quinze', '2026-09-15'],
    ])('%s => %s', (text, date) => {
      expect(extractDate(text, TODAY)?.date).toBe(date);
    });

    it('no meio do mês, um dia que já passou fica no mês corrente', () => {
      expect(extractDate('dia 10', '2026-10-20')?.date).toBe('2026-10-10');
      expect(extractDate('dia 20', '2026-10-20')?.date).toBe('2026-10-20');
      expect(extractDate('dia 21', '2026-10-20')?.date).toBe('2026-09-21');
    });

    it('virada de ano: dia futuro em janeiro vai para dezembro do ano anterior', () => {
      expect(extractDate('dia 20', '2027-01-05')?.date).toBe('2026-12-20');
    });
  });

  describe('dd/mm sem ano', () => {
    it('usa o ano corrente', () => {
      expect(extractDate('15/12', TODAY)?.date).toBe('2026-12-15');
    });
    it('vai para o ano anterior se cairia mais de 6 meses no futuro', () => {
      expect(extractDate('28/12', '2027-01-03')?.date).toBe('2026-12-28');
    });
  });

  describe('dias da semana (hoje é quinta)', () => {
    it.each([
      ['segunda', '2026-09-28'],
      ['segunda-feira', '2026-09-28'],
      ['terça', '2026-09-29'],
      ['quarta-feira', '2026-09-30'],
      ['quinta', '2026-10-01'],
      ['quinta passada', '2026-09-24'],
      ['sexta', '2026-09-25'],
      ['sexta passada', '2026-09-25'],
      ['sábado', '2026-09-26'],
      ['domingo passado', '2026-09-27'],
      ['sábado retrasado', '2026-09-19'],
      ['próxima sexta', '2026-10-02'],
      ['segunda que vem', '2026-10-05'],
    ])('%s => %s', (text, date) => {
      expect(extractDate(text, TODAY)?.date).toBe(date);
    });

    it('não confunde ordinais com dias da semana', () => {
      expect(extractDate('pela segunda vez', TODAY)).toBeNull();
      expect(extractDate('a quinta parcela', TODAY)).toBeNull();
    });
  });

  it.each(['31/02', '45/13', 'texto sem data', 'bom dia', 'dia de pagamento', ''])(
    'sem data: "%s"',
    (text) => {
      expect(extractDate(text, TODAY)).toBeNull();
    },
  );

  it('retorna a primeira data do texto', () => {
    expect(extractDate('ontem ou hoje?', TODAY)?.match).toBe('ontem');
  });
});

describe('extractDate — regressões', () => {
  it('"dia 20/09" inclui o "dia" no trecho', () => {
    expect(extractDate('gastei 80 dia 20/09', TODAY)).toEqual({ date: '2026-09-20', match: 'dia 20/09' });
  });

  it.each([
    ['na 2ª feira', '2026-09-28'],
    ['na 3ª feira', '2026-09-29'],
    ['na 3a feira', '2026-09-29'],
    ['na 6ª-feira passada', '2026-09-25'],
  ])('dia da semana numerado: %s', (text, date) => {
    expect(extractDate(text, TODAY)?.date).toBe(date);
  });
});
