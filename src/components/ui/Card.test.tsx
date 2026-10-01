import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card, CardHeader } from './Card';

describe('Card', () => {
  it('pode encolher dentro de grid/flex (min-w-0), para não alargar a página no celular', () => {
    // Sem min-w-0, o min-content de um título com "truncate" (nowrap) alargava a coluna do grid além da tela.
    render(
      <Card className="lg:col-span-2" data-testid="card">
        <CardHeader title="Um título bem comprido que não cabe na largura de um celular" actions={<a href="#/">Ver todos</a>} />
      </Card>,
    );
    const card = screen.getByTestId('card');
    expect(card).toHaveClass('min-w-0', 'lg:col-span-2');
    // O título quebra em até 2 linhas (sem esconder o texto) dentro de um contêiner que também pode encolher.
    const title = screen.getByRole('heading', { name: /Um título bem comprido/ });
    expect(title).toHaveClass('line-clamp-2', 'wrap-break-word');
    expect(title).not.toHaveClass('truncate');
    expect(title).toHaveAttribute('title', 'Um título bem comprido que não cabe na largura de um celular');
    expect(title.parentElement).toHaveClass('min-w-0');
  });
});
