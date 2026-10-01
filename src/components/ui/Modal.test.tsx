import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Modal } from './Modal';

/** Modal montado só quando aberto, com campo `autoFocus` (como o formulário de recorrência). */
function AutoFocusForm({ onClose }: { onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="Nova recorrência" footer={<button onClick={onClose}>Cancelar</button>}>
      <input aria-label="Valor" autoFocus />
    </Modal>
  );
}

function Page({ mountOnOpen = false }: { mountOnOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <a href="#fora">Link de fundo</a>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      {mountOnOpen ? (
        open && <AutoFocusForm onClose={() => setOpen(false)} />
      ) : (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Nova conta"
          footer={<button onClick={() => setOpen(false)}>Salvar</button>}
        >
          <input aria-label="Nome" />
          <input aria-label="Saldo" />
        </Modal>
      )}
    </div>
  );
}

afterEach(() => {
  document.getElementById('root')?.remove();
});

describe('Modal', () => {
  it('prende o foco: Tab no último volta ao primeiro e Shift+Tab no primeiro vai ao último', async () => {
    const user = userEvent.setup();
    render(<Page />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveFocus());

    await user.tab(); // Saldo
    await user.tab(); // Salvar (último)
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveFocus();
    for (let i = 0; i < 8; i++) {
      await user.tab({ shift: true });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('devolve o foco ao botão que abriu, mesmo quando um campo do modal tem autoFocus', async () => {
    const user = userEvent.setup();
    render(<Page mountOnOpen />);
    const opener = screen.getByRole('button', { name: 'Abrir' });
    await user.click(opener);
    expect(screen.getByLabelText('Valor')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();

    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(opener).toHaveFocus();
  });

  it('deixa o app (#root) inerte enquanto aberto', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const user = userEvent.setup();
    render(<Page />, { container: root });
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(root).toHaveAttribute('inert');
    // O diálogo é um portal no <body>, fora do #root inerte.
    expect(root).not.toContainElement(screen.getByRole('dialog'));
    await user.keyboard('{Escape}');
    expect(root).not.toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus();
  });

  it('Esc fecha só o modal do topo (confirmação aberta por cima de um formulário)', async () => {
    function Nested() {
      const [outer, setOuter] = useState(true);
      const [inner, setInner] = useState(false);
      return (
        <Modal open={outer} onClose={() => setOuter(false)} title="Formulário">
          <input aria-label="Campo" />
          <button type="button" onClick={() => setInner(true)}>
            Excluir
          </button>
          <Modal open={inner} onClose={() => setInner(false)} title="Confirmar">
            <button>Ok</button>
          </Modal>
        </Modal>
      );
    }
    const user = userEvent.setup();
    render(<Nested />);
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    await user.keyboard('{Escape}');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Formulário' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
