import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '@/components/ui';
import { resetDb } from '@/test/render';
import { CHUNK_RELOAD_KEY, isChunkLoadError, reloadOnceForChunkError } from './route-error';
import { routes } from './router';

/** Página de Metas trocada por uma que pode falhar ao renderizar. */
const page = vi.hoisted(() => ({ error: null as Error | null }));
vi.mock('@/features/goals/GoalsPage', () => ({
  default: function FakeGoalsPage() {
    if (page.error) throw page.error;
    return <h1>Metas</h1>;
  },
}));
vi.mock('@/features/assistant/AssistantPage', () => ({
  default: function FakeAssistantPage() {
    return <h1>Assistente do teste</h1>;
  },
}));

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <FeedbackProvider>
      <RouterProvider router={router} />
    </FeedbackProvider>,
  );
  return router;
}

beforeEach(async () => {
  await resetDb();
  page.error = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('rotas: tela de erro (errorElement)', () => {
  it('erro de renderização numa página mostra a tela de erro em pt-BR e mantém o menu do app', async () => {
    page.error = new TypeError("Cannot read properties of undefined (reading 'trim')");
    renderAt('/metas');
    expect(await screen.findByRole('heading', { name: 'Algo deu errado nesta página' })).toBeInTheDocument();
    expect(screen.queryByText(/Unexpected Application Error/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reading 'trim'/)).not.toBeInTheDocument();
    // O AppShell continua: dá para sair da página quebrada pelo menu.
    const menu = screen.getByRole('navigation', { name: 'Menu principal' });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para Configurações' })).toHaveAttribute('href', '/configuracoes');
    expect(screen.getByRole('button', { name: 'Exportar backup' })).toBeInTheDocument();
  });

  it('sair da página quebrada pelo menu limpa o erro', async () => {
    page.error = new Error('falha');
    renderAt('/metas');
    await screen.findByRole('heading', { name: 'Algo deu errado nesta página' });
    const menu = screen.getByRole('navigation', { name: 'Menu principal' });
    await userEvent.click(menu.querySelector('a[href="/assistente"]') as HTMLElement);
    expect(await screen.findByRole('heading', { name: 'Assistente do teste' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Algo deu errado nesta página' })).not.toBeInTheDocument();
  });

  it('chunk de versão antiga: mensagem de atualização e recarga automática uma vez', async () => {
    page.error = new TypeError('Failed to fetch dynamically imported module: http://localhost/assets/GoalsPage-abc.js');
    renderAt('/metas');
    expect(await screen.findByRole('heading', { name: 'O Patrimonius foi atualizado' })).toBeInTheDocument();
    // A recarga automática foi registrada (guarda contra laço).
    expect(Number(sessionStorage.getItem(CHUNK_RELOAD_KEY))).toBeGreaterThan(0);
  });
});

describe('reloadOnceForChunkError', () => {
  const chunkError = new TypeError('Failed to fetch dynamically imported module: x.js');

  it('identifica erros de carregamento de chunk (Chrome, Safari, Firefox)', () => {
    expect(isChunkLoadError(chunkError)).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('boom'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it('recarrega uma vez e não entra em laço', () => {
    const reload = vi.fn();
    expect(reloadOnceForChunkError(chunkError, reload, sessionStorage, 1_000_000)).toBe(true);
    expect(reloadOnceForChunkError(chunkError, reload, sessionStorage, 1_010_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    // Bem depois (nova atualização na mesma aba), pode recarregar de novo.
    expect(reloadOnceForChunkError(chunkError, reload, sessionStorage, 1_200_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('não recarrega por outros erros nem sem sessionStorage', () => {
    const reload = vi.fn();
    expect(reloadOnceForChunkError(new Error('boom'), reload, sessionStorage)).toBe(false);
    expect(reloadOnceForChunkError(chunkError, reload, null)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
