import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from './FeedbackProvider';
import { useConfirm, useToast } from './feedback-context';

function Buttons() {
  const toast = useToast();
  const confirm = useConfirm();
  return (
    <>
      <button onClick={() => toast('Lançamento salvo.')}>Salvar</button>
      <button onClick={() => toast('Falhou.', 'error', 8000)}>Falhar</button>
      <button
        onClick={() =>
          void confirm({ title: 'Registrar pagamento?', message: 'Pagar R$ 4.300,00 da dívida Cartão?' })
        }
      >
        Pagar
      </button>
    </>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('FeedbackProvider', () => {
  it('toast de sucesso com fundo emerald-700 (contraste AA com texto branco)', async () => {
    render(
      <FeedbackProvider>
        <Buttons />
      </FeedbackProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Lançamento salvo.');
    expect(toast).toHaveClass('bg-emerald-700');
    expect(toast).not.toHaveClass('bg-emerald-600');
  });

  it('notificações ficam num portal no <body>, fora do app (que fica inerte com modal aberto)', async () => {
    const { container } = render(
      <FeedbackProvider>
        <Buttons />
      </FeedbackProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(container).not.toContainElement(screen.getByRole('status'));
  });

  it('valores em reais na mensagem de confirmação recebem a classe money (modo ocultar valores)', async () => {
    render(
      <FeedbackProvider>
        <Buttons />
      </FeedbackProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));
    const dialog = screen.getByRole('dialog', { name: 'Registrar pagamento?' });
    const money = dialog.querySelector('.money');
    expect(money).toHaveTextContent('R$ 4.300,00');
    expect(dialog).toHaveTextContent('Pagar R$ 4.300,00 da dívida Cartão?');
  });

  it('aceita duração personalizada', async () => {
    vi.useFakeTimers();
    render(
      <FeedbackProvider>
        <Buttons />
      </FeedbackProvider>,
    );
    act(() => screen.getByRole('button', { name: 'Falhar' }).click());
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByRole('status')).toHaveTextContent('Falhou.');
    act(() => vi.advanceTimersByTime(4100));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
