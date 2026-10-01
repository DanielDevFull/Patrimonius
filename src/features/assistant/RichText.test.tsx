import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InlineText, RichText } from './RichText';

describe('RichText', () => {
  it('converte negrito, listas e quebras de linha em elementos React', () => {
    const { container } = render(
      <RichText text={'Olá **Ana**!\nSegunda linha\n\nO que faço:\n• Registrar\n• Consultar'} />,
    );
    expect(container.querySelector('strong')?.textContent).toBe('Ana');
    expect(container.querySelectorAll('p')).toHaveLength(2);
    expect(container.querySelectorAll('br')).toHaveLength(1);
    const items = [...container.querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toEqual(['Registrar', 'Consultar']);
  });

  it('marca valores em reais com a classe .money (modo ocultar valores)', () => {
    const { container } = render(<RichText text="Você gastou **R$ 1.234,56** e recebeu R$ 10,00." />);
    const values = [...container.querySelectorAll('.money')].map((el) => el.textContent);
    expect(values).toEqual(['R$ 1.234,56', 'R$ 10,00']);
  });

  it('não interpreta HTML: o texto "<b>x</b>" aparece literal e nenhum elemento é criado', () => {
    const { container } = render(<RichText text={'<b>x</b> <img src=x onerror="alert(1)"> <script>alert(1)</script>'} />);
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<b>x</b>');
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  it('InlineText renderiza só a linha (sem blocos)', () => {
    const { container } = render(<InlineText text="Limite **R$ 800,00**" />);
    expect(container.querySelector('p')).toBeNull();
    expect(container.querySelector('strong .money')?.textContent).toBe('R$ 800,00');
  });
});
