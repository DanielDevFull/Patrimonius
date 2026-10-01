import { useId, useState, type FormEvent } from 'react';
import { Button, Field, Input, Modal, MoneyInput, Select, Textarea, useToast } from '@/components/ui';
import { addAsset, updateAsset } from '@/db/repo';
import { ASSET_TYPE_LABELS, type Asset, type AssetType, type ISODate } from '@/domain/types';
import {
  ASSET_FORM_ORDER,
  assetFormToFields,
  assetToFormValues,
  validateAssetForm,
  type AssetFormField,
  type AssetFormValues,
} from './networth-utils';

export interface AssetFormModalProps {
  /** Bem em edição (null = novo). */
  asset: Asset | null;
  today: ISODate;
  onClose: () => void;
}

const TYPES = Object.keys(ASSET_TYPE_LABELS) as AssetType[];

/** Cadastro/edição de um bem. O valor atual só é informado na criação; depois, use "Atualizar valor". */
export function AssetFormModal({ asset, today, onClose }: AssetFormModalProps) {
  const toast = useToast();
  const ids: Record<AssetFormField | 'form' | 'type' | 'notes', string> = {
    form: useId(),
    name: useId(),
    type: useId(),
    value: useId(),
    acquisitionValue: useId(),
    acquisitionDate: useId(),
    notes: useId(),
  };
  const [values, setValues] = useState<AssetFormValues>(() => assetToFormValues(asset));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const errors = validateAssetForm(values, today);
  const show = (f: AssetFormField) => (submitted ? errors[f] : undefined);
  const set = <K extends keyof AssetFormValues>(key: K, value: AssetFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const first = ASSET_FORM_ORDER.find((f) => errors[f]);
    if (first || values.value === null) {
      document.getElementById(ids[first ?? 'value'])?.focus();
      return;
    }
    setSaving(true);
    const fields = assetFormToFields(values);
    try {
      if (asset) {
        await updateAsset(asset.id, fields);
        toast('Bem atualizado.');
      } else {
        await addAsset({ ...fields, value: values.value, archived: false }, today);
        toast('Bem cadastrado.');
      }
      onClose();
    } catch {
      toast('Não foi possível salvar o bem.', 'error');
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={asset ? 'Editar bem' : 'Novo bem'}
      description="Imóveis, veículos, investimentos fora das contas, previdência, participações…"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={ids.form} loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <form id={ids.form} onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome" htmlFor={ids.name} error={show('name')}>
            <Input
              id={ids.name}
              value={values.name}
              maxLength={60}
              placeholder="Ex.: Apartamento, Carro"
              aria-invalid={!!show('name')}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
          <Field label="Tipo" htmlFor={ids.type}>
            <Select
              id={ids.type}
              value={values.type}
              onChange={(e) => set('type', e.target.value as AssetType)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {ASSET_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Valor atual estimado"
          htmlFor={ids.value}
          error={show('value')}
          hint={
            asset
              ? 'Para mudar o valor, use “Atualizar valor”: assim o histórico de avaliações é mantido.'
              : 'Quanto você conseguiria vender hoje (tabela FIPE, avaliação, extrato).'
          }
        >
          <MoneyInput
            id={ids.value}
            value={values.value}
            onChange={(v) => set('value', v)}
            disabled={!!asset}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Valor de aquisição (opcional)"
            htmlFor={ids.acquisitionValue}
            error={show('acquisitionValue')}
          >
            <MoneyInput
              id={ids.acquisitionValue}
              value={values.acquisitionValue}
              onChange={(v) => set('acquisitionValue', v)}
            />
          </Field>
          <Field
            label="Data de aquisição (opcional)"
            htmlFor={ids.acquisitionDate}
            error={show('acquisitionDate')}
          >
            <Input
              id={ids.acquisitionDate}
              type="date"
              max={today}
              value={values.acquisitionDate}
              aria-invalid={!!show('acquisitionDate')}
              onChange={(e) => set('acquisitionDate', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Observações (opcional)" htmlFor={ids.notes}>
          <Textarea
            id={ids.notes}
            value={values.notes}
            maxLength={500}
            onChange={(e) => set('notes', e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}
