import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

const TABS = [
  { value: 'juros', label: 'Juros compostos' },
  { value: 'tempo', label: 'Quanto tempo até…' },
  { value: 'comprar', label: 'Posso comprar?' },
  { value: 'reserva', label: 'Reserva de emergência' },
  { value: 'quitar', label: 'Quitar ou investir?' },
];

function Tabs({ initial = 'juros' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <SegmentedControl aria-label="Simuladores" options={TABS} value={value} onChange={setValue} idPrefix="sim" />;
}

/** Barra de 328 px com 5 abas de 158 px (rolagem horizontal), como no celular. */
function stubScrollableLayout() {
  const scroll = { left: 0 };
  const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft');
  Object.defineProperty(HTMLElement.prototype, 'scrollLeft', {
    configurable: true,
    get: () => scroll.left,
    set: (v: number) => {
      scroll.left = v;
    },
  });
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(790);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(328);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const box = (left: number, width: number) =>
      ({ left, right: left + width, width, top: 0, bottom: 36, height: 36, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
    if (this.getAttribute('role') === 'tablist') return box(16, 328);
    const index = TABS.findIndex((t) => t.label === this.textContent);
    return box(16 + 4 + index * 158 - scroll.left, 158);
  });
  return {
    scroll,
    restore: () => {
      delete (HTMLElement.prototype as { scrollLeft?: number }).scrollLeft;
      if (original) Object.defineProperty(Element.prototype, 'scrollLeft', original);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SegmentedControl', () => {
  it("modo 'radio': escolha de valor anunciada como radiogroup/radio (não como abas)", async () => {
    function Choice() {
      const [v, setV] = useState('pago');
      return (
        <SegmentedControl
          mode="radio"
          aria-label="Situação"
          options={[
            { value: 'pago', label: 'Pago' },
            { value: 'pendente', label: 'Pendente' },
          ]}
          value={v}
          onChange={setV}
        />
      );
    }
    render(<Choice />);
    expect(screen.getByRole('radiogroup', { name: 'Situação' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Pago' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Pendente' }));
    expect(screen.getByRole('radio', { name: 'Pendente' })).toBeChecked();
  });

  it("modo 'tabs' com idPrefix liga a aba ao painel (aria-controls)", () => {
    render(<Tabs />);
    const tab = screen.getByRole('tab', { name: 'Juros compostos' });
    expect(tab).toHaveAttribute('id', 'sim-tab-juros');
    expect(tab).toHaveAttribute('aria-controls', 'sim-panel-juros');
  });

  it('link direto para uma aba fora da vista rola a barra até ela', () => {
    const layout = stubScrollableLayout();
    try {
      render(<Tabs initial="quitar" />);
      // 'Quitar ou investir?' fica em 652..810 com a barra em 16..344: rola até a aba aparecer inteira.
      expect(layout.scroll.left).toBeGreaterThanOrEqual(810 - 344);
    } finally {
      layout.restore();
    }
  });

  it('setas do teclado trazem a aba focada para a vista', async () => {
    const layout = stubScrollableLayout();
    try {
      const user = userEvent.setup();
      render(<Tabs />);
      expect(layout.scroll.left).toBe(0);
      screen.getByRole('tab', { name: 'Juros compostos' }).focus();
      await user.keyboard('{ArrowRight}{ArrowRight}');
      expect(screen.getByRole('tab', { name: 'Posso comprar?' })).toHaveFocus();
      // 'Posso comprar?' fica em 336..494: passa do fim da barra (344), então a barra rola.
      expect(layout.scroll.left).toBeGreaterThanOrEqual(494 - 344);
    } finally {
      layout.restore();
    }
  });
});
