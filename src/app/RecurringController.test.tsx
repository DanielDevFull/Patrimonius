import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '@/components/ui';
import { db } from '@/db/db';
import { resetDb } from '@/test/render';
import { makeAccount, makeRecurring } from '@/test/factories';
import { HideValuesController } from './HideValuesController';
import { RecurringController } from './RecurringController';
import { RECURRING_FAILED_MESSAGE } from './startup-error';
import { updateSettings } from '@/db/repo';

async function seedRent() {
  const account = makeAccount();
  await db.accounts.add(account);
  // Já gerado em outubro; a próxima ocorrência (05/11) ainda não existe.
  await db.recurring.add(
    makeRecurring({ accountId: account.id, description: 'Aluguel', startDate: '2026-10-05', nextDate: '2026-11-05' }),
  );
}

async function generatedDates(): Promise<string[]> {
  return (await db.transactions.toArray()).map((t) => t.date).sort();
}

function renderController(props: { startupFailed?: boolean } = {}) {
  return render(
    <FeedbackProvider>
      <RecurringController {...props} />
    </FeedbackProvider>,
  );
}

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('RecurringController', () => {
  it('gera os pendentes do novo mês quando o mês vira com o app aberto', async () => {
    await seedRent();
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(2026, 9, 31, 23, 58));
    renderController();
    expect(await generatedDates()).toEqual([]);

    vi.setSystemTime(new Date(2026, 10, 1, 8, 0));
    act(() => vi.advanceTimersByTime(61_000));
    vi.useRealTimers();
    await waitFor(async () => expect(await generatedDates()).toEqual(['2026-11-05']));
  });

  it('ao voltar para a aba (visibilitychange) atualiza a data na hora e gera o novo mês', async () => {
    await seedRent();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 31, 23, 58));
    renderController();
    vi.setSystemTime(new Date(2026, 10, 1, 7, 0));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(async () => expect(await generatedDates()).toEqual(['2026-11-05']));
  });

  it('não gera de novo no mesmo mês da abertura', async () => {
    await seedRent();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 20, 10, 0));
    renderController();
    await new Promise((r) => setTimeout(r, 30));
    expect(await generatedDates()).toEqual([]);
  });

  it('avisa quando a geração na abertura falhou', async () => {
    renderController({ startupFailed: true });
    expect(await screen.findByText(RECURRING_FAILED_MESSAGE)).toBeInTheDocument();
  });
});

describe('HideValuesController', () => {
  it('aplica .hide-values no <html> (vale para modais e notificações, que são portais no <body>)', async () => {
    render(<HideValuesController />);
    expect(document.documentElement).not.toHaveClass('hide-values');
    await act(async () => {
      await updateSettings({ hideValues: true });
    });
    await waitFor(() => expect(document.documentElement).toHaveClass('hide-values'));
    await act(async () => {
      await updateSettings({ hideValues: false });
    });
    await waitFor(() => expect(document.documentElement).not.toHaveClass('hide-values'));
  });
});
