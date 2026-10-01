import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as chartThemeModule from '@/components/charts/theme';
import { MiniChart } from './MiniChart';

vi.mock('@/components/charts/theme', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/components/charts/theme')>();
  return {
    ...original,
    useChartTheme: vi.fn(original.useChartTheme),
    useHideValues: vi.fn(() => false),
  };
});

vi.mock('@/components/ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/components/ui')>();
  // Money lê as configurações do banco; aqui só importa o texto.
  return { ...original, Money: ({ value }: { value: number }) => <span>{value}</span> };
});

describe('MiniChart', () => {
  beforeEach(() => {
    vi.mocked(chartThemeModule.useChartTheme).mockClear();
    vi.mocked(chartThemeModule.useHideValues).mockClear();
  });

  it('usa o tema compartilhado dos gráficos (claro/escuro) e o "ocultar valores" de @/components/charts', () => {
    render(<MiniChart kind="bar" title="Gastos por mês" data={[{ label: 'set', value: 1000 }]} />);
    expect(screen.getByRole('img', { name: 'Gráfico de barras: Gastos por mês' })).toBeInTheDocument();
    expect(chartThemeModule.useChartTheme).toHaveBeenCalled();
    expect(chartThemeModule.useHideValues).toHaveBeenCalled();
  });

  it('pizza: legenda com nome e participação', () => {
    render(
      <MiniChart
        kind="pie"
        title="Despesas"
        data={[
          { label: 'Mercado', value: 3000, color: '#22c55e' },
          { label: 'Lazer', value: 1000 },
        ]}
      />,
    );
    const legend = screen.getByRole('list', { name: 'Legenda: Despesas' });
    expect(legend).toHaveTextContent('Mercado');
    expect(legend).toHaveTextContent('75%');
    expect(chartThemeModule.useChartTheme).toHaveBeenCalled();
  });
});
