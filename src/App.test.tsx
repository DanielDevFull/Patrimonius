import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECURRING_FAILED_MESSAGE } from '@/app/startup-error';
import { db } from '@/db/db';
import { resetDb } from '@/test/render';
import { makeAccount, makeRecurring } from '@/test/factories';
import App from './App';

beforeEach(async () => {
  await resetDb();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('App: abertura', () => {
  it('falha ao gravar as recorrências do mês (armazenamento cheio) não bloqueia o acesso aos dados', async () => {
    const account = makeAccount({ name: 'Conta' });
    await db.accounts.add(account);
    // Regra mensal com ocorrência ainda não gerada neste mês.
    await db.recurring.add(
      makeRecurring({ accountId: account.id, description: 'Aluguel', startDate: '2000-01-05', nextDate: '2000-01-05' }),
    );
    vi.spyOn(db.transactions, 'bulkAdd').mockRejectedValue(new DOMException('Quota exceeded', 'QuotaExceededError'));

    render(<App />);
    expect(await screen.findByText(RECURRING_FAILED_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText('Não foi possível abrir seus dados')).not.toBeInTheDocument();
    // O app abriu: o menu está disponível (dá para chegar a Configurações e exportar um backup).
    expect(await screen.findByRole('navigation', { name: 'Menu principal' })).toBeInTheDocument();
  });

  it('falha ao abrir o banco mostra mensagem em pt-BR, sem o texto técnico do navegador', async () => {
    const missing = Object.assign(new Error('IndexedDB API missing. Please visit https://tinyurl.com/y2uuvskb'), {
      name: 'MissingAPIError',
    });
    vi.spyOn(db.categories, 'count').mockRejectedValue(missing);
    render(<App />);
    expect(await screen.findByText('Não foi possível abrir seus dados')).toBeInTheDocument();
    expect(screen.getByText(/janelas anônimas\/privadas/)).toBeInTheDocument();
    expect(screen.queryByText(/tinyurl|IndexedDB API missing/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();
  });
});
