/**
 * Regras puras da tela de Patrimônio (composição, variações, histórico de avaliações, formulário de bens).
 */
import type { NetWorthBreakdown, NetWorthPoint } from '@/analytics';
import { formatMonthShort, isISODate } from '@/domain/dates';
import type { Asset, AssetType, AssetValuation, Cents, ID, ISODate, MonthKey } from '@/domain/types';

/** Avaliações de um bem, da mais recente para a mais antiga (data, depois criação). */
export function valuationsOf(assetId: ID, valuations: AssetValuation[]): AssetValuation[] {
  return valuations
    .filter((v) => v.assetId === assetId)
    .sort((a, b) =>
      a.date !== b.date
        ? a.date < b.date
          ? 1
          : -1
        : a.createdAt === b.createdAt
          ? 0
          : a.createdAt < b.createdAt
            ? 1
            : -1,
    );
}

export interface AssetVariation {
  /** Valor de referência (aquisição ou 1ª avaliação). */
  base: Cents;
  basis: 'aquisicao' | 'primeira_avaliacao';
  diff: Cents;
  /** diff / base (null se base = 0). */
  ratio: number | null;
}

/**
 * Variação do valor atual do bem: em relação ao valor de aquisição (se informado e > 0) ou,
 * sem ele, à avaliação mais antiga (somente se houver mais de uma). null quando não há referência.
 */
export function assetVariation(asset: Asset, history: AssetValuation[]): AssetVariation | null {
  if (asset.acquisitionValue !== null && asset.acquisitionValue > 0) {
    const diff = asset.value - asset.acquisitionValue;
    return { base: asset.acquisitionValue, basis: 'aquisicao', diff, ratio: diff / asset.acquisitionValue };
  }
  if (history.length < 2) return null;
  const oldest = history[history.length - 1];
  const diff = asset.value - oldest.value;
  return {
    base: oldest.value,
    basis: 'primeira_avaliacao',
    diff,
    ratio: oldest.value > 0 ? diff / oldest.value : null,
  };
}

export interface ValuationRow {
  valuation: AssetValuation;
  /** Diferença para a avaliação anterior (mais antiga); null na primeira. */
  change: Cents | null;
  ratio: number | null;
}

/** Histórico (mais recente primeiro) com a variação de cada avaliação em relação à anterior. */
export function valuationRows(history: AssetValuation[]): ValuationRow[] {
  return history.map((valuation, i) => {
    const previous = history[i + 1];
    if (!previous) return { valuation, change: null, ratio: null };
    const change = valuation.value - previous.value;
    return { valuation, change, ratio: previous.value > 0 ? change / previous.value : null };
  });
}

/* ------------------------------------------------------------------ */
/* Composição                                                          */
/* ------------------------------------------------------------------ */

export interface CompositionRow {
  key: string;
  label: string;
  total: Cents;
  /** Fração do total do lado (ativos ou passivos), 0..1. */
  share: number;
  /** Detalhes (ex.: contas que compõem a linha). */
  items: { id: string; label: string; total: Cents }[];
  assetType?: AssetType;
}

export interface Composition {
  assets: CompositionRow[];
  liabilities: CompositionRow[];
}

function withShares(rows: Omit<CompositionRow, 'share'>[], total: Cents): CompositionRow[] {
  return rows.filter((r) => r.total > 0).map((r) => ({ ...r, share: total > 0 ? r.total / total : 0 }));
}

/**
 * Agrupa o patrimônio em linhas legíveis:
 * - ativos: contas com saldo positivo (uma linha, detalhada por conta) + bens por tipo;
 * - passivos: faturas de cartão (saldos negativos de cartões), outras contas no negativo (cheque especial) e dívidas.
 */
export function netWorthComposition(nw: NetWorthBreakdown): Composition {
  const positive = nw.accounts.filter((a) => a.balance > 0);
  const cards = nw.accounts.filter((a) => a.balance < 0 && a.type === 'cartao_credito');
  const overdraft = nw.accounts.filter((a) => a.balance < 0 && a.type !== 'cartao_credito');
  const sum = (list: { balance: Cents }[]) => list.reduce((s, a) => s + Math.abs(a.balance), 0);
  const detail = (list: typeof nw.accounts) =>
    list.map((a) => ({ id: a.accountId, label: a.name, total: Math.abs(a.balance) }));

  const assets = withShares(
    [
      { key: 'contas', label: 'Contas e investimentos', total: sum(positive), items: detail(positive) },
      ...nw.byAssetType.map((t) => ({
        key: `bem-${t.type}`,
        label: t.label,
        total: t.total,
        items: [],
        assetType: t.type,
      })),
    ],
    nw.totalAssets,
  );
  const liabilities = withShares(
    [
      { key: 'cartoes', label: 'Cartões de crédito', total: sum(cards), items: detail(cards) },
      { key: 'negativo', label: 'Contas no negativo', total: sum(overdraft), items: detail(overdraft) },
      { key: 'dividas', label: 'Dívidas', total: nw.debtsTotal, items: [] },
    ],
    nw.totalLiabilities,
  );
  return { assets, liabilities };
}

/* ------------------------------------------------------------------ */
/* Evolução                                                            */
/* ------------------------------------------------------------------ */

export interface HistoryRow extends NetWorthPoint {
  label: string;
}

export function historyRows(points: NetWorthPoint[]): HistoryRow[] {
  return points.map((p) => ({ ...p, label: formatMonthShort(p.month) }));
}

/** Variação do patrimônio líquido do mês anterior para o último ponto (null com menos de 2 pontos). */
export function lastChange(points: NetWorthPoint[]): { diff: Cents; previousMonth: MonthKey } | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const previous = points[points.length - 2];
  return { diff: last.netWorth - previous.netWorth, previousMonth: previous.month };
}

/* ------------------------------------------------------------------ */
/* Formulários                                                         */
/* ------------------------------------------------------------------ */

export interface AssetFormValues {
  name: string;
  type: AssetType;
  value: Cents | null;
  acquisitionValue: Cents | null;
  acquisitionDate: string;
  notes: string;
}

export type AssetFormField = 'name' | 'value' | 'acquisitionValue' | 'acquisitionDate';
export const ASSET_FORM_ORDER: AssetFormField[] = ['name', 'value', 'acquisitionValue', 'acquisitionDate'];

export function assetToFormValues(asset: Asset | null): AssetFormValues {
  return {
    name: asset?.name ?? '',
    type: asset?.type ?? 'imovel',
    value: asset?.value ?? null,
    acquisitionValue: asset?.acquisitionValue ?? null,
    acquisitionDate: asset?.acquisitionDate ?? '',
    notes: asset?.notes ?? '',
  };
}

export function validateAssetForm(
  v: AssetFormValues,
  today: ISODate,
): Partial<Record<AssetFormField, string>> {
  const errors: Partial<Record<AssetFormField, string>> = {};
  if (!v.name.trim()) errors.name = 'Informe o nome do bem.';
  if (v.value === null) errors.value = 'Informe o valor atual estimado.';
  else if (v.value < 0) errors.value = 'O valor não pode ser negativo.';
  if (v.acquisitionValue !== null && v.acquisitionValue < 0) errors.acquisitionValue = 'Valor inválido.';
  if (v.acquisitionDate) {
    if (!isISODate(v.acquisitionDate)) errors.acquisitionDate = 'Data inválida.';
    else if (v.acquisitionDate > today)
      errors.acquisitionDate = 'A data de aquisição não pode estar no futuro.';
  }
  return errors;
}

/** Campos editáveis do bem (o valor atual só muda por avaliação — revalueAsset). */
export function assetFormToFields(
  v: AssetFormValues,
): Pick<Asset, 'name' | 'type' | 'acquisitionValue' | 'acquisitionDate' | 'notes'> {
  return {
    name: v.name.trim().replace(/\s+/g, ' '),
    type: v.type,
    acquisitionValue: v.acquisitionValue,
    acquisitionDate: v.acquisitionDate || null,
    notes: v.notes.trim(),
  };
}

export function validateRevaluation(
  value: Cents | null,
  date: string,
  today: ISODate,
): { value?: string; date?: string } {
  const errors: { value?: string; date?: string } = {};
  if (value === null) errors.value = 'Informe o novo valor.';
  else if (value < 0) errors.value = 'O valor não pode ser negativo.';
  if (!date) errors.date = 'Informe a data da avaliação.';
  else if (!isISODate(date)) errors.date = 'Data inválida.';
  else if (date > today) errors.date = 'A data não pode estar no futuro.';
  return errors;
}
