/**
 * Tema dos gráficos (Recharts). As cores ficam em variáveis CSS definidas no contêiner do gráfico,
 * com passos próprios para o modo escuro (validados para contraste e daltonismo sobre as superfícies
 * dos cartões: branco no claro, slate-900 no escuro).
 *
 * - série 1 (azul) e série 2 (laranja): par categórico para comparar duas séries;
 * - marca (teal): série única (ex.: evolução do patrimônio);
 * - grade/eixos em cinza recessivo; textos dos eixos em tom "muted".
 */
export const CHART_VARS_CLASS =
  '[--chart-1:#2a78d6] [--chart-2:#eb6834] [--chart-brand:#0d9488] [--chart-grid:#e2e8f0] [--chart-axis:#cbd5e1] [--chart-muted:#64748b] [--chart-surface:#ffffff] ' +
  'dark:[--chart-1:#3987e5] dark:[--chart-2:#d95926] dark:[--chart-brand:#0d9488] dark:[--chart-grid:#1e293b] dark:[--chart-axis:#334155] dark:[--chart-muted:#94a3b8] dark:[--chart-surface:#0f172a]';

export const SERIES_COLORS = {
  primary: 'var(--chart-1)',
  secondary: 'var(--chart-2)',
  brand: 'var(--chart-brand)',
} as const;

export const CHART_GRID = 'var(--chart-grid)';
export const CHART_AXIS = 'var(--chart-axis)';
export const CHART_SURFACE = 'var(--chart-surface)';

/** Estilo dos textos dos eixos. */
export const AXIS_TICK = { fill: 'var(--chart-muted)', fontSize: 12 } as const;

/** Linha vertical (crosshair) do tooltip. */
export const CROSSHAIR = { stroke: 'var(--chart-muted)', strokeWidth: 1 } as const;

/** Linha de dados do ponto ativo do tooltip (Recharts entrega o objeto original em `payload[0].payload`). */
export function activeRow<T>(payload: ReadonlyArray<{ payload?: unknown }> | undefined): T | undefined {
  const row = payload?.[0]?.payload;
  return row === undefined || row === null ? undefined : (row as T);
}
