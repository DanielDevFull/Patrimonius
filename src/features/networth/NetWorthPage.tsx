import { ChevronDown, Gem, Plus, Scale, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { netWorth, netWorthHistory } from '@/analytics';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Money,
  PageHeader,
  ProgressBar,
  Spinner,
  StatCard,
  cn,
  useConfirm,
  useToast,
} from '@/components/ui';
import { ROUTES } from '@/app/navigation';
import { useFinanceData, useToday } from '@/db/hooks';
import { deleteAsset, updateAsset } from '@/db/repo';
import { formatMonthShort, monthKey } from '@/domain/dates';
import { formatPercent } from '@/domain/money';
import { plural } from '@/domain/text';
import type { Asset, ID } from '@/domain/types';
import { AssetCard } from './AssetCard';
import { AssetFormModal } from './AssetFormModal';
import { NetWorthChart } from './NetWorthChart';
import {
  historyRows,
  lastChange,
  netWorthComposition,
  valuationsOf,
  type CompositionRow,
} from './networth-utils';
import { RevalueModal } from './RevalueModal';

const HISTORY_MONTHS = 12;

function CompositionList({
  rows,
  side,
  empty,
}: {
  rows: CompositionRow[];
  side: 'ativos' | 'passivos';
  empty: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-slate-500 dark:text-slate-400">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{row.label}</span>
            <span className="shrink-0 font-semibold">
              <Money value={row.total} />
              <span className="ml-1.5 text-xs font-normal text-slate-500 dark:text-slate-400">
                {formatPercent(row.share)}
              </span>
            </span>
          </div>
          <ProgressBar
            value={row.share}
            size="sm"
            tone={side === 'ativos' ? 'brand' : 'negative'}
            label={`${row.label}: ${formatPercent(row.share)} dos ${side}`}
          />
          {row.items.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 pl-3 text-xs text-slate-500 dark:text-slate-400">
              {row.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{item.label}</span>
                  <Money value={item.total} />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function NetWorthPage() {
  const data = useFinanceData();
  const today = useToday();
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState<{ asset: Asset | null } | null>(null);
  const [revaluingId, setRevaluingId] = useState<ID | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const view = useMemo(() => {
    if (!data) return null;
    const nw = netWorth(data, today);
    const history = netWorthHistory(data, monthKey(today), HISTORY_MONTHS, today);
    const sorted = [...data.assets].sort(
      (a, b) => b.value - a.value || a.name.localeCompare(b.name, 'pt-BR'),
    );
    return {
      nw,
      composition: netWorthComposition(nw),
      rows: historyRows(history),
      change: lastChange(history),
      active: sorted.filter((a) => !a.archived),
      archived: sorted.filter((a) => a.archived),
    };
  }, [data, today]);

  if (!data || !view) return <Spinner />;
  const { nw, composition, rows, change, active, archived } = view;
  const revaluing = revaluingId ? data.assets.find((a) => a.id === revaluingId) : undefined;
  const debtRatio = nw.totalAssets > 0 ? nw.totalLiabilities / nw.totalAssets : null;

  async function toggleArchive(asset: Asset) {
    try {
      await updateAsset(asset.id, { archived: !asset.archived });
      toast(
        asset.archived ? 'Bem desarquivado.' : 'Bem arquivado: ele deixa de contar no patrimônio.',
        'info',
      );
    } catch {
      toast('Não foi possível alterar o bem.', 'error');
    }
  }

  async function removeAsset(asset: Asset) {
    const count = data?.assetValuations.filter((v) => v.assetId === asset.id).length ?? 0;
    const ok = await confirm({
      title: `Excluir “${asset.name}”?`,
      message: `O bem e o histórico de ${plural(count, 'avaliação', 'avaliações')} serão apagados, inclusive da evolução do patrimônio. Se você vendeu o bem, arquivar mantém o histórico.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteAsset(asset.id);
      toast('Bem excluído.');
    } catch {
      toast('Não foi possível excluir o bem.', 'error');
    }
  }

  const renderAssets = (assets: Asset[]) => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {assets.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          history={valuationsOf(asset.id, data.assetValuations)}
          onRevalue={(a) => setRevaluingId(a.id)}
          onEdit={(a) => setForm({ asset: a })}
          onToggleArchive={(a) => void toggleArchive(a)}
          onDelete={(a) => void removeAsset(a)}
        />
      ))}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Patrimônio"
        subtitle="Tudo o que você tem menos tudo o que você deve."
        actions={
          <Button icon={<Plus size={16} aria-hidden />} onClick={() => setForm({ asset: null })}>
            Novo bem
          </Button>
        }
      />

      <div className="space-y-6">
        <section aria-label="Patrimônio líquido" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card className="sm:col-span-2">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Patrimônio líquido</p>
            <p
              className={cn(
                'mt-1 text-3xl font-bold tracking-tight sm:text-5xl',
                nw.netWorth < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white',
              )}
            >
              <Money value={nw.netWorth} />
            </p>
            {change && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                {change.diff >= 0 ? (
                  <TrendingUp size={16} aria-hidden className="text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <TrendingDown size={16} aria-hidden className="text-rose-600 dark:text-rose-400" />
                )}
                <span>
                  <Money value={change.diff} signed /> desde {formatMonthShort(change.previousMonth)}
                </span>
              </p>
            )}
          </Card>
          <StatCard
            label="Ativos"
            tone="positive"
            icon={<Wallet size={20} aria-hidden />}
            value={<Money value={nw.totalAssets} />}
            hint="Saldos positivos das contas + bens"
          />
          <StatCard
            label="Passivos"
            tone="negative"
            icon={<Scale size={20} aria-hidden />}
            value={<Money value={nw.totalLiabilities} />}
            hint={
              debtRatio !== null && nw.totalLiabilities > 0
                ? `Equivalem a ${formatPercent(debtRatio)} dos seus ativos`
                : 'Faturas, contas no negativo e dívidas'
            }
          />
        </section>

        <section aria-label="Composição do patrimônio" className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader
              title="O que você tem"
              subtitle={<Money value={nw.totalAssets} />}
              actions={
                <Link
                  to={ROUTES.accounts}
                  className="rounded text-sm font-medium text-brand-700 hover:underline dark:text-brand-400"
                >
                  Ver contas
                </Link>
              }
            />
            <CompositionList
              rows={composition.assets}
              side="ativos"
              empty="Nenhum ativo ainda. Cadastre suas contas e seus bens."
            />
          </Card>
          <Card>
            <CardHeader
              title="O que você deve"
              subtitle={<Money value={nw.totalLiabilities} />}
              actions={
                <Link
                  to={ROUTES.debts}
                  className="rounded text-sm font-medium text-brand-700 hover:underline dark:text-brand-400"
                >
                  Ver dívidas
                </Link>
              }
            />
            <CompositionList
              rows={composition.liabilities}
              side="passivos"
              empty="Nenhuma dívida ou fatura em aberto. Ótimo!"
            />
          </Card>
        </section>

        <Card>
          <CardHeader
            title="Evolução"
            subtitle={`Patrimônio líquido no fim de cada mês (últimos ${HISTORY_MONTHS})`}
          />
          <NetWorthChart rows={rows} hideValues={data.settings.hideValues} />
        </Card>

        <section aria-labelledby="bens-title" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="bens-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              Bens ({active.length})
            </h2>
          </div>
          {active.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Gem size={36} aria-hidden />}
                title="Nenhum bem cadastrado"
                description="Imóveis, veículos, investimentos fora das contas, previdência… Cadastre o que você possui e atualize o valor de tempos em tempos para acompanhar a evolução do seu patrimônio."
                action={
                  <Button icon={<Plus size={16} aria-hidden />} onClick={() => setForm({ asset: null })}>
                    Cadastrar bem
                  </Button>
                }
              />
            </Card>
          ) : (
            renderAssets(active)
          )}

          {archived.length > 0 && (
            <div>
              <button
                type="button"
                aria-expanded={showArchived}
                onClick={() => setShowArchived((v) => !v)}
                className="flex items-center gap-1 rounded text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              >
                <ChevronDown
                  size={16}
                  aria-hidden
                  className={cn('transition-transform', showArchived && 'rotate-180')}
                />
                Arquivados ({archived.length})
              </button>
              {showArchived && <div className="mt-3">{renderAssets(archived)}</div>}
            </div>
          )}
        </section>
      </div>

      {form && <AssetFormModal asset={form.asset} today={today} onClose={() => setForm(null)} />}
      {revaluing && (
        <RevalueModal
          asset={revaluing}
          history={valuationsOf(revaluing.id, data.assetValuations)}
          today={today}
          onClose={() => setRevaluingId(null)}
        />
      )}
    </div>
  );
}
