import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Money } from './Money';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('valor acompanha a largura do cartão e quebra a linha em vez de vazar (cartões em 2 colunas no celular)', () => {
    render(
      <StatCard
        label="Saldo do mês"
        value={<Money value={599713} signed colored />}
        hint="Receitas menos despesas"
      />,
    );
    const money = screen.getByText('+R$ 5.997,13');
    const value = money.parentElement!;
    const card = value.parentElement!.parentElement!;
    // Antes: text-xl fixo e <Money> com whitespace-nowrap => "+R$ 5.997,13" passava 11 px da borda em 360 px.
    expect(card).toHaveClass('@container', 'p-3', 'sm:p-4');
    expect(value).toHaveClass(
      'text-base',
      '@min-[9rem]:text-lg',
      '@min-[10rem]:text-xl',
      '[&_.money]:whitespace-normal',
    );
  });
});
