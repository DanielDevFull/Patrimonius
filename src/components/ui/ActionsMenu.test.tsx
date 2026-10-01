import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionsMenu, BOTTOM_NAV_ATTR } from './ActionsMenu';

function rect(top: number, height: number): DOMRect {
  return { top, bottom: top + height, height, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) };
}

function setup() {
  const onDelete = vi.fn();
  render(
    <>
      <ActionsMenu
        label="Ações de Rendimento"
        items={[
          { label: 'Marcar como pendente', onSelect: vi.fn() },
          { label: 'Duplicar', onSelect: vi.fn() },
          { label: 'Excluir', onSelect: onDelete, danger: true },
        ]}
      />
      <button type="button">Depois</button>
    </>,
  );
  return { onDelete };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ActionsMenu', () => {
  it('abre para cima (acima da barra inferior) quando o menu passaria do limite de baixo da tela', async () => {
    // Celular 760 px: último lançamento no fim da rolagem; a barra inferior fixa começa em 703 px.
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(760);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') === 'menu') return rect(625, 118);
      if (this.hasAttribute(BOTTOM_NAV_ATTR)) return rect(703, 57);
      return rect(585, 36);
    });
    const nav = document.createElement('nav');
    nav.setAttribute(BOTTOM_NAV_ATTR, '');
    document.body.appendChild(nav);
    try {
      setup();
      await userEvent.click(screen.getByRole('button', { name: 'Ações de Rendimento' }));
      const menu = screen.getByRole('menu');
      expect(menu).toHaveClass('bottom-full');
      expect(menu).not.toHaveClass('top-full');
      // Pintado acima da barra inferior (z-30).
      expect(menu).toHaveClass('z-40');
    } finally {
      nav.remove();
    }
  });

  it('abre para baixo quando cabe', async () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(760);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') === 'menu') return rect(240, 118);
      return rect(200, 36);
    });
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Ações de Rendimento' }));
    expect(screen.getByRole('menu')).toHaveClass('top-full');
  });

  it('fecha quando o foco sai do menu com Tab', async () => {
    setup();
    const user = userEvent.setup();
    screen.getByRole('button', { name: 'Ações de Rendimento' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menuitem', { name: 'Marcar como pendente' })).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('menuitem', { name: 'Excluir' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Depois' })).toHaveFocus();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Esc fecha o menu mesmo com o foco fora dele e não chega a outros ouvintes (ex.: modal)', async () => {
    setup();
    const outer = vi.fn();
    document.addEventListener('keydown', outer);
    try {
      await userEvent.click(screen.getByRole('button', { name: 'Ações de Rendimento' }));
      expect(screen.getByRole('menu')).toBeInTheDocument();
      // Foco no corpo da página (ex.: toque numa área sem foco).
      (document.activeElement as HTMLElement).blur();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(outer).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Ações de Rendimento' })).toHaveFocus();
    } finally {
      document.removeEventListener('keydown', outer);
    }
  });

  it('Home/End vão para o primeiro/último item', async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Ações de Rendimento' }));
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Excluir' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'Marcar como pendente' })).toHaveFocus();
  });

  it('escolher um item fecha o menu e executa a ação', async () => {
    const { onDelete } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Ações de Rendimento' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Excluir' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
