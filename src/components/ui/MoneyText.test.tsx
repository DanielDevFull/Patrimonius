import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MoneyText } from '@/components/ui';

describe('MoneyText', () => {
  it('marca cada valor em reais com a classe money, preservando o texto', () => {
    const text = 'Seu saldo previsto é R$ 1.234,56; ficaria negativo em -R$ 10,00 por mês.';
    const { container } = render(
      <p>
        <MoneyText text={text} />
      </p>,
    );
    expect(container.textContent).toBe(text);
    expect([...container.querySelectorAll('.money')].map((el) => el.textContent)).toEqual([
      'R$ 1.234,56',
      '-R$ 10,00',
    ]);
  });

  it('texto sem valores fica intacto', () => {
    const { container } = render(<MoneyText text="Sua reserva de emergência está completa." />);
    expect(container.textContent).toBe('Sua reserva de emergência está completa.');
    expect(container.querySelector('.money')).toBeNull();
  });
});
