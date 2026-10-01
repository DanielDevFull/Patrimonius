import { describe, expect, it } from 'vitest';
import { describeStartupError } from './startup-error';

const named = (name: string, inner?: unknown) => Object.assign(new Error(`${name} (texto técnico)`), { name, inner });

describe('describeStartupError', () => {
  it('traduz as causas conhecidas para pt-BR, inclusive dentro do erro do Dexie (inner)', () => {
    expect(describeStartupError(new DOMException('Quota exceeded', 'QuotaExceededError'))).toMatch(/armazenamento.*cheio/);
    expect(describeStartupError(named('OpenFailedError', named('VersionError')))).toMatch(/versão mais nova/);
    expect(describeStartupError(named('MissingAPIError'))).toMatch(/não permite o armazenamento local/);
    expect(describeStartupError(named('OpenFailedError', named('InvalidStateError')))).toMatch(/anônimas/);
  });

  it('erro desconhecido: mensagem genérica, sem o texto original', () => {
    const text = describeStartupError(new Error('Something went wrong at https://example.com'));
    expect(text).toMatch(/erro inesperado/);
    expect(text).not.toMatch(/example\.com|Something/);
    expect(describeStartupError('falhou')).toMatch(/erro inesperado/);
  });
});
