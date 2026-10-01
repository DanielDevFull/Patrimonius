import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Cents } from '@/domain/types';
import { MoneyInput } from './MoneyInput';

function Controlled({ initial = null, spy }: { initial?: Cents | null; spy?: (v: Cents | null) => void }) {
  const [value, setValue] = useState<Cents | null>(initial);
  return (
    <>
      <MoneyInput
        aria-label="Valor"
        value={value}
        onChange={(v) => {
          spy?.(v);
          setValue(v);
        }}
      />
      <button type="button" onClick={() => setValue(null)}>
        Limpar
      </button>
      <button type="button" onClick={() => setValue(4250)}>
        Carregar
      </button>
      <output>{value === null ? 'vazio' : String(value)}</output>
    </>
  );
}

describe('MoneyInput', () => {
  it('prefixo R$ com contraste AA também no tema escuro', () => {
    render(<Controlled />);
    expect(screen.getByText('R$')).toHaveClass('text-slate-500', 'dark:text-slate-400');
  });

  it("aceita '2 mil' digitado letra a letra (prefixo inválido '2 m' não apaga o texto)", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled spy={spy} />);
    const input = screen.getByLabelText('Valor');
    await user.click(input);
    await user.keyboard('2 m');
    expect(input).toHaveValue('2 m');
    expect(spy).toHaveBeenLastCalledWith(null);
    await user.keyboard('il');
    expect(input).toHaveValue('2 mil');
    expect(spy).toHaveBeenLastCalledWith(200000);
    await user.tab();
    expect(input).toHaveValue('2.000,00');
    expect(screen.getByRole('status')).toHaveTextContent('200000');
  });

  it("não apaga '150,5' ao digitar um caractere inválido; ao sair do campo inválido, limpa", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByLabelText('Valor');
    await user.click(input);
    await user.keyboard('150,5x');
    expect(input).toHaveValue('150,5x');
    await user.keyboard('{Backspace}');
    expect(input).toHaveValue('150,5');
    expect(screen.getByRole('status')).toHaveTextContent('15050');
    await user.keyboard('x');
    await user.tab();
    expect(input).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('vazio');
  });

  it('valor limpo ou trocado de fora atualiza o texto, mesmo com o campo em foco', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={1000} />);
    const input = screen.getByLabelText('Valor');
    expect(input).toHaveValue('10,00');
    await user.click(input);
    await user.clear(input);
    await user.keyboard('35');
    expect(input).toHaveValue('35');
    // "Salvar e novo": o formulário zera o valor (o clique tira o foco do campo; o foco volta em seguida).
    await user.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(input).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Carregar' }));
    expect(input).toHaveValue('42,50');
  });
});
