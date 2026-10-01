import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';
import { Money } from './Money';

describe('Money', () => {
  it('valor positivo colorido usa emerald-700 no tema claro (contraste AA em fundo branco)', () => {
    render(<Money value={965000} signed colored />);
    const el = screen.getByText('+R$ 9.650,00');
    expect(el).toHaveClass('money', 'text-emerald-700', 'dark:text-emerald-400');
    expect(el).not.toHaveClass('text-emerald-600');
  });

  it('valor negativo colorido em rose', () => {
    render(<Money value={-5232} signed colored />);
    expect(screen.getByText('-R$ 52,32')).toHaveClass('text-rose-600', 'dark:text-rose-400');
  });
});

describe('Button success', () => {
  it('fundo emerald-700 (texto branco com contraste AA)', () => {
    render(<Button variant="success">Marcar como pago</Button>);
    const button = screen.getByRole('button', { name: 'Marcar como pago' });
    expect(button).toHaveClass('bg-emerald-700');
    expect(button).not.toHaveClass('bg-emerald-600');
  });
});
