import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { chartTheme, useChartTheme } from './theme';

describe('tema dos gráficos', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('acompanha a classe .dark do <html> (alternância claro/escuro em tempo real)', async () => {
    const { result } = renderHook(() => useChartTheme());
    expect(result.current.dark).toBe(false);
    expect(result.current.surface).toBe('#ffffff');

    await act(async () => {
      document.documentElement.classList.add('dark');
      // MutationObserver é assíncrono (microtarefa).
      await Promise.resolve();
    });
    expect(result.current.dark).toBe(true);
    expect(result.current.surface).toBe('#0f172a');
  });

  it('usa a mesma matiz por série nos dois modos, com passos próprios para o escuro', () => {
    const light = chartTheme(false);
    const dark = chartTheme(true);
    for (const key of ['income', 'expense', 'balance'] as const) {
      expect(light[key]).not.toBe(dark[key]);
    }
    expect(new Set([light.income, light.expense, light.balance]).size).toBe(3);
  });
});
