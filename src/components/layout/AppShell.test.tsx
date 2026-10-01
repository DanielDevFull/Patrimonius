import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '@/test/render';
import { AppShell } from './AppShell';

function renderShell(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<h1>Painel</h1>} />
          <Route path="*" element={<h1>Página</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await resetDb();
});

describe('AppShell', () => {
  it('título da aba do navegador acompanha a página', async () => {
    renderShell('/metas');
    await waitFor(() => expect(document.title).toBe('Metas · Patrimonius'));
  });

  it('título da página inexistente', async () => {
    renderShell('/xyz');
    await waitFor(() => expect(document.title).toBe('Página não encontrada · Patrimonius'));
  });

  it('link "Pular para o conteúdo" é o primeiro focável e leva o foco ao <main> sem mudar a rota', async () => {
    const user = userEvent.setup();
    renderShell('/lancamentos');
    const skip = await screen.findByRole('link', { name: 'Pular para o conteúdo' });
    await user.tab();
    expect(skip).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Página' })).toBeInTheDocument();
  });

  it('em páginas do menu "Mais", o botão "Mais" fica destacado e expõe o estado do menu', async () => {
    const user = userEvent.setup();
    renderShell('/metas');
    const bottom = await screen.findByRole('navigation', { name: 'Navegação' });
    const more = within(bottom).getByRole('button', { name: 'Mais' });
    expect(more).toHaveClass('text-brand-700');
    expect(more).toHaveAttribute('aria-haspopup', 'dialog');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    const sheet = screen.getByRole('dialog', { name: 'Menu' });
    const current = within(sheet).getByRole('link', { name: 'Metas' });
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current).toHaveClass('bg-brand-50');
    expect(within(sheet).getByRole('link', { name: 'Contas' })).not.toHaveClass('bg-brand-50');
  });

  it('em páginas da barra, o "Mais" não fica destacado; rótulos inativos com contraste no tema escuro', async () => {
    renderShell('/lancamentos');
    const bottom = await screen.findByRole('navigation', { name: 'Navegação' });
    const more = within(bottom).getByRole('button', { name: 'Mais' });
    expect(more).not.toHaveClass('text-brand-700');
    expect(more).toHaveClass('text-slate-500', 'dark:text-slate-400');
    expect(within(bottom).getByRole('link', { name: 'Painel' })).toHaveClass('dark:text-slate-400');
  });

  it('aviso de privacidade do menu lateral com contraste AA (slate-500, não slate-400)', async () => {
    renderShell('/');
    const note = await screen.findByText('Seus dados ficam só neste dispositivo.');
    expect(note).toHaveClass('text-slate-500');
    expect(note).not.toHaveClass('text-slate-400');
  });

  it('o modo "ocultar valores" não fica preso ao AppShell (é aplicado no <html>)', async () => {
    const { container } = renderShell('/');
    await screen.findByRole('navigation', { name: 'Navegação' });
    expect(container.querySelector('.hide-values')).toBeNull();
    // A barra inferior é a referência do menu de ações para não abrir por baixo dela.
    expect(screen.getByRole('navigation', { name: 'Navegação' })).toHaveAttribute('data-bottom-nav');
  });
});
