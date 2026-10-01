import { endOfMonth, lastMonths, monthKey } from '@/domain/dates';
import {
  ASSET_TYPE_LABELS,
  type Asset,
  type AssetType,
  type AssetValuation,
  type Cents,
  type Debt,
  type DebtPayment,
  type FinanceData,
  type ID,
  type ISODate,
  type MonthKey,
} from '@/domain/types';
import { accountBalances } from './balances';
import { debtCurrentBalance } from './debts';
import { compareRaw, compareText } from './internal/common';
import type { NetWorthAccountLine, NetWorthBreakdown, NetWorthPoint } from './types';

/** Avaliações agrupadas por bem, da mais recente para a mais antiga (data, depois criação e id). */
function indexValuations(valuations: AssetValuation[]): Map<ID, AssetValuation[]> {
  const byAsset = new Map<ID, AssetValuation[]>();
  for (const v of valuations) {
    const list = byAsset.get(v.assetId) ?? [];
    list.push(v);
    byAsset.set(v.assetId, list);
  }
  for (const list of byAsset.values())
    list.sort(
      (a, b) => compareRaw(b.date, a.date) || compareRaw(b.createdAt, a.createdAt) || compareRaw(b.id, a.id),
    );
  return byAsset;
}

/**
 * Valor de um bem em `asOf`: avaliação mais recente com date <= asOf; sem avaliação até asOf,
 * 0 se foi adquirido depois de asOf; senão o valor da PRIMEIRA avaliação (o bem fica "plano" antes do cadastro,
 * como as contas — um imóvel comprado em 2015 e cadastrado hoje não gera uma valorização falsa no mês do cadastro);
 * sem nenhuma avaliação, acquisitionValue ?? value.
 */
function assetValueAt(asset: Asset, valuations: AssetValuation[] | undefined, asOf: ISODate): Cents {
  const latest = valuations?.find((v) => v.date <= asOf);
  if (latest) return latest.value;
  if (asset.acquisitionDate !== null && asset.acquisitionDate > asOf) return 0;
  const earliest = valuations?.[valuations.length - 1];
  return earliest ? earliest.value : (asset.acquisitionValue ?? asset.value);
}

/**
 * Bem conta no patrimônio em `asOf`? Não arquivado => sim. Arquivado => só antes de `archivedAt` (vendido, por
 * exemplo: o histórico anterior continua com ele). Arquivado antes de existir archivedAt (dados antigos) => até a
 * data da última avaliação.
 */
function assetCountsAt(asset: Asset, valuations: AssetValuation[] | undefined, asOf: ISODate): boolean {
  if (!asset.archived) return true;
  if (asset.archivedAt) return asOf < asset.archivedAt;
  const last = valuations?.[0];
  return last !== undefined && asOf <= last.date;
}

/**
 * Data em que uma dívida 'quitada' foi quitada: a do último pagamento com date >= balanceDate; sem pagamentos,
 * a da última alteração (marcada como quitada à mão).
 */
function payoffDateOf(debt: Debt, payments: DebtPayment[]): ISODate {
  let last: ISODate | null = null;
  for (const p of payments)
    if (p.debtId === debt.id && p.date >= debt.balanceDate && (last === null || p.date > last)) last = p.date;
  return last ?? debt.updatedAt.slice(0, 10);
}

function computeNetWorth(
  data: FinanceData,
  asOf: ISODate,
  valuationsByAsset: Map<ID, AssetValuation[]>,
): NetWorthBreakdown {
  const candidates = data.accounts.filter((a) => a.includeInNetWorth);
  const balances = accountBalances(candidates, data.transactions, { asOf });
  const accounts: NetWorthAccountLine[] = [];
  let accountsPositive = 0;
  let accountsNegative = 0;
  for (const account of candidates) {
    const balance = balances[account.id] ?? 0;
    if (account.archived && balance === 0) continue;
    accounts.push({ accountId: account.id, name: account.name, type: account.type, balance });
    if (balance > 0) accountsPositive += balance;
    else accountsNegative -= balance;
  }

  const byType = new Map<AssetType, Cents>();
  let assetsTotal = 0;
  for (const asset of data.assets) {
    const valuations = valuationsByAsset.get(asset.id);
    if (!assetCountsAt(asset, valuations, asOf)) continue;
    const value = assetValueAt(asset, valuations, asOf);
    assetsTotal += value;
    byType.set(asset.type, (byType.get(asset.type) ?? 0) + value);
  }
  const byAssetType = [...byType]
    .filter(([, total]) => total !== 0)
    .map(([type, total]) => ({ type, label: ASSET_TYPE_LABELS[type] ?? ASSET_TYPE_LABELS.outro, total }))
    .sort((a, b) => b.total - a.total || compareText(a.label, b.label));

  let debtsTotal = 0;
  for (const debt of data.debts) {
    if (debt.status === 'ativa') debtsTotal += debtCurrentBalance(debt, data.debtPayments, asOf);
    // Quitada: o passado continua com a dívida até a quitação (pagar uma dívida não muda o patrimônio).
    else if (asOf < payoffDateOf(debt, data.debtPayments))
      debtsTotal += debtCurrentBalance({ ...debt, status: 'ativa' }, data.debtPayments, asOf);
  }

  const totalAssets = accountsPositive + assetsTotal;
  const totalLiabilities = accountsNegative + debtsTotal;
  return {
    asOf,
    accounts,
    accountsPositive,
    accountsNegative,
    assetsTotal,
    byAssetType,
    debtsTotal,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
  };
}

/**
 * Patrimônio líquido em `asOf`:
 * - contas com includeInNetWorth (arquivadas só se saldo != 0): saldo pago até asOf; positivos somam ativos, negativos passivos;
 * - bens (arquivados só antes de archivedAt): valor da avaliação mais recente com date <= asOf; sem avaliação até
 *   asOf: se acquisitionDate > asOf => 0; senão o valor da primeira avaliação (sem avaliações: acquisitionValue ?? value);
 * - dívidas ativas: debtCurrentBalance(debt, payments, asOf); quitadas entram do mesmo jeito antes da data da
 *   quitação (último pagamento; sem pagamentos, a data da última alteração) — o histórico não é reescrito.
 *
 * Detalhes: `accounts` segue a ordem de data.accounts; `byAssetType` lista só tipos com total != 0, por total desc.
 * Avaliações na mesma data: vale a criada por último (como em revalueAsset).
 */
export function netWorth(data: FinanceData, asOf: ISODate): NetWorthBreakdown {
  return computeNetWorth(data, asOf, indexValuations(data.assetValuations));
}

/**
 * Evolução do patrimônio: um ponto por mês (count meses até endMonth, cronológico), calculado no último dia do mês
 * (ou em `today` para o mês corrente, se today for informado e cair dentro de endMonth).
 */
export function netWorthHistory(
  data: FinanceData,
  endMonth: MonthKey,
  count: number,
  today?: ISODate,
): NetWorthPoint[] {
  if (!(count > 0)) return [];
  const valuations = indexValuations(data.assetValuations);
  return lastMonths(endMonth, Math.floor(count)).map((month) => {
    const asOf =
      today !== undefined && month === endMonth && monthKey(today) === endMonth ? today : endOfMonth(month);
    const nw = computeNetWorth(data, asOf, valuations);
    return {
      month,
      totalAssets: nw.totalAssets,
      totalLiabilities: nw.totalLiabilities,
      netWorth: nw.netWorth,
    };
  });
}
