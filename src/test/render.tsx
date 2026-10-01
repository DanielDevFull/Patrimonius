/**
 * Utilitários para testes de componentes/páginas.
 * Ex.:
 *   await resetDb();
 *   const acc = await addAccount({...});
 *   renderWithProviders(<TransactionsPage />, { route: '/lancamentos' });
 *   expect(await screen.findByText('Lançamentos')).toBeInTheDocument();
 */
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { FeedbackProvider } from '@/components/ui';
import { db } from '@/db/db';
import { ensureInitialized, updateSettings } from '@/db/repo';

/** Limpa o banco (fake-indexeddb) e recria categorias/configurações padrão com onboarding concluído. */
export async function resetDb(): Promise<void> {
  await Promise.all(db.tables.map((t) => t.clear()));
  await ensureInitialized();
  await updateSettings({ onboardingDone: true, userName: 'Teste' });
}

export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}): RenderResult {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <FeedbackProvider>{ui}</FeedbackProvider>
    </MemoryRouter>,
  );
}
