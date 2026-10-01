import { useId, useState, type FormEvent } from 'react';
import { Badge, Button, Field, Input, Modal, Money, MoneyInput, cn, useToast } from '@/components/ui';
import { revalueAsset } from '@/db/repo';
import { formatDateBR } from '@/domain/dates';
import type { Asset, AssetValuation, Cents, ISODate } from '@/domain/types';
import { formatSignedPercent } from '@/domain/format';
import { validateRevaluation, valuationRows } from './networth-utils';

export interface RevalueModalProps {
  asset: Asset;
  /** Avaliações do bem, da mais recente para a mais antiga. */
  history: AssetValuation[];
  today: ISODate;
  onClose: () => void;
}

function ChangeBadge({ ratio, diff }: { ratio: number | null; diff: Cents }) {
  if (diff === 0) return <Badge>sem variação</Badge>;
  return (
    <Badge tone={diff > 0 ? 'positive' : 'negative'}>
      {ratio !== null ? formatSignedPercent(ratio) : <Money value={diff} signed />}
    </Badge>
  );
}

/** Registra uma nova avaliação do bem e mostra o histórico de avaliações. */
export function RevalueModal({ asset, history, today, onClose }: RevalueModalProps) {
  const toast = useToast();
  const ids = { form: useId(), value: useId(), date: useId(), history: useId() };
  const [value, setValue] = useState<Cents | null>(null);
  const [date, setDate] = useState<string>(today);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const errors = validateRevaluation(value, date, today);
  const latest = history[0];
  const olderThanLatest = !!latest && !!date && date < latest.date;
  const diff = value !== null ? value - asset.value : null;
  const rows = valuationRows(history);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (errors.value || errors.date || value === null) {
      document.getElementById(errors.value ? ids.value : ids.date)?.focus();
      return;
    }
    setSaving(true);
    try {
      await revalueAsset(asset.id, value, date);
      toast(olderThanLatest ? 'Avaliação antiga registrada no histórico.' : 'Valor atualizado.');
      onClose();
    } catch {
      toast('Não foi possível atualizar o valor.', 'error');
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Atualizar valor: ${asset.name}`}
      description={
        <>
          Valor atual: <Money value={asset.value} />
        </>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={ids.form} loading={saving}>
            Salvar avaliação
          </Button>
        </>
      }
    >
      <form id={ids.form} onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Novo valor" htmlFor={ids.value} error={submitted ? errors.value : undefined}>
            <MoneyInput id={ids.value} value={value} onChange={setValue} />
          </Field>
          <Field
            label="Data da avaliação"
            htmlFor={ids.date}
            error={submitted ? errors.date : undefined}
            hint={
              olderThanLatest
                ? `Anterior à última avaliação (${formatDateBR(latest.date)}): entra só no histórico, sem mudar o valor atual.`
                : undefined
            }
          >
            <Input
              id={ids.date}
              type="date"
              max={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>
        {diff !== null && !olderThanLatest && (
          <p
            className={cn(
              'rounded-xl p-3 text-sm',
              diff > 0 && 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
              diff < 0 && 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300',
              diff === 0 && 'bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
            )}
          >
            {diff === 0 ? (
              'Mesmo valor da avaliação atual.'
            ) : (
              <>
                {diff > 0 ? 'Valorização' : 'Desvalorização'} de <Money value={Math.abs(diff)} />
                {asset.value > 0 && ` (${formatSignedPercent(diff / asset.value)})`} em relação ao valor
                atual.
              </>
            )}
          </p>
        )}
      </form>

      <section aria-labelledby={ids.history} className="mt-5">
        <h3 id={ids.history} className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Histórico de avaliações
        </h3>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma avaliação registrada.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {rows.map((r) => (
              <li key={r.valuation.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="text-slate-600 dark:text-slate-300">{formatDateBR(r.valuation.date)}</span>
                <span className="flex items-center gap-2">
                  <Money value={r.valuation.value} className="font-medium" />
                  {r.change !== null && <ChangeBadge ratio={r.ratio} diff={r.change} />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Modal>
  );
}
