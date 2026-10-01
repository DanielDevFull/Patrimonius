import { useSyncExternalStore } from 'react';
import { useSettings } from '@/db/hooks';

/**
 * Cores dos gráficos (Recharts desenha SVG com cores literais, então o modo escuro é resolvido em JS).
 *
 * Paleta validada (dataviz/validate_palette, todos os pares, superfícies reais dos cards: branco e slate-900):
 * receitas = aqua, despesas = laranja, saldo = azul. Mesmas matizes nos dois modos, com passos próprios para o escuro.
 * No modo claro o aqua fica abaixo de 3:1 sobre o branco — por isso todo gráfico tem legenda visível e tabela.
 */
export interface ChartTheme {
  dark: boolean;
  /** Superfície do card (usada para o espaço de 2px entre fatias/barras e o anel dos marcadores). */
  surface: string;
  grid: string;
  axis: string;
  tick: string;
  cursor: string;
  income: string;
  expense: string;
  balance: string;
  /** Linha de referência do zero quando o saldo fica negativo. */
  danger: string;
  /** Cor neutra para "Outras" / valores de referência. */
  muted: string;
}

const LIGHT: ChartTheme = {
  dark: false,
  surface: '#ffffff',
  grid: '#e2e8f0',
  axis: '#cbd5e1',
  tick: '#64748b',
  cursor: '#f1f5f9',
  income: '#1baf7a',
  expense: '#eb6834',
  balance: '#2a78d6',
  danger: '#d03b3b',
  muted: '#94a3b8',
};

const DARK: ChartTheme = {
  dark: true,
  surface: '#0f172a',
  grid: '#1e293b',
  axis: '#334155',
  tick: '#94a3b8',
  cursor: '#1e293b',
  income: '#199e70',
  expense: '#d95926',
  balance: '#3987e5',
  danger: '#e66767',
  muted: '#64748b',
};

function subscribe(onChange: () => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

function isDarkNow(): boolean {
  return document.documentElement.classList.contains('dark');
}

/** true quando o app está no modo escuro (classe .dark no <html>, aplicada pelo ThemeController). */
export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, isDarkNow, () => false);
}

export function chartTheme(dark: boolean): ChartTheme {
  return dark ? DARK : LIGHT;
}

/** Cores do gráfico para o tema atual (re-renderiza ao alternar claro/escuro). */
export function useChartTheme(): ChartTheme {
  return chartTheme(useIsDark());
}

/** true quando o usuário ativou "ocultar valores" (os eixos dos gráficos também são mascarados). */
export function useHideValues(): boolean {
  return useSettings()?.hideValues ?? false;
}
