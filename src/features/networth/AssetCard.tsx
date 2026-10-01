import {
  Archive,
  ArchiveRestore,
  Briefcase,
  Car,
  Gem,
  Home,
  Package,
  Pencil,
  PiggyBank,
  RefreshCw,
  Trash2,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { Badge, Button, Card, IconButton, Money, cn } from '@/components/ui';
import { formatDateBR } from '@/domain/dates';
import { ASSET_TYPE_LABELS, type Asset, type AssetType, type AssetValuation } from '@/domain/types';
import { formatSignedPercent } from '@/features/simulators/shared/format';
import { assetVariation } from './networth-utils';

const ASSET_ICONS: Record<AssetType, LucideIcon> = {
  imovel: Home,
  veiculo: Car,
  investimento: TrendingUp,
  previdencia: PiggyBank,
  participacao: Briefcase,
  bem_pessoal: Gem,
  outro: Package,
};

export interface AssetCardProps {
  asset: Asset;
  /** Avaliações do bem, da mais recente para a mais antiga. */
  history: AssetValuation[];
  onRevalue: (asset: Asset) => void;
  onEdit: (asset: Asset) => void;
  onToggleArchive: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;
}

export function AssetCard({ asset, history, onRevalue, onEdit, onToggleArchive, onDelete }: AssetCardProps) {
  const Icon = ASSET_ICONS[asset.type] ?? Package;
  const variation = assetVariation(asset, history);
  const latest = history[0];

  return (
    <Card
      role="region"
      aria-label={asset.name}
      className={cn('flex flex-col gap-3', asset.archived && 'opacity-80')}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-400">
          <Icon size={20} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="break-words font-semibold text-slate-900 dark:text-white">{asset.name}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {ASSET_TYPE_LABELS[asset.type] ?? ASSET_TYPE_LABELS.outro}
            {asset.archived && ' · arquivado'}
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton label={`Editar ${asset.name}`} size="sm" onClick={() => onEdit(asset)}>
            <Pencil size={16} />
          </IconButton>
          <IconButton
            label={asset.archived ? `Desarquivar ${asset.name}` : `Arquivar ${asset.name}`}
            size="sm"
            onClick={() => onToggleArchive(asset)}
          >
            {asset.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          </IconButton>
          <IconButton
            label={`Excluir ${asset.name}`}
            size="sm"
            variant="danger"
            onClick={() => onDelete(asset)}
          >
            <Trash2 size={16} />
          </IconButton>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">
            <Money value={asset.value} />
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {latest ? `Avaliado em ${formatDateBR(latest.date)}` : 'Sem avaliação registrada'}
            {history.length > 1 && ` · ${history.length} avaliações`}
          </p>
        </div>
        {variation && (
          <Badge tone={variation.diff > 0 ? 'positive' : variation.diff < 0 ? 'negative' : 'neutral'}>
            {variation.ratio !== null ? (
              formatSignedPercent(variation.ratio)
            ) : (
              <Money value={variation.diff} signed />
            )}{' '}
            {variation.basis === 'aquisicao' ? 'desde a aquisição' : 'desde a 1ª avaliação'}
          </Badge>
        )}
      </div>

      {(asset.acquisitionValue !== null || asset.acquisitionDate) && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Adquirido
          {asset.acquisitionValue !== null && (
            <>
              {' '}
              por <Money value={asset.acquisitionValue} />
            </>
          )}
          {asset.acquisitionDate && ` em ${formatDateBR(asset.acquisitionDate)}`}
        </p>
      )}
      {asset.notes && <p className="text-xs text-slate-500 dark:text-slate-400">{asset.notes}</p>}

      {!asset.archived && (
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          icon={<RefreshCw size={16} aria-hidden />}
          onClick={() => onRevalue(asset)}
        >
          Atualizar valor
        </Button>
      )}
    </Card>
  );
}
