import { useId, useState } from 'react';
import { Button, Field, Modal, Select, useToast } from '@/components/ui';
import { deleteCategory } from '@/db/repo';
import { plural } from '@/domain/text';
import type { Category, ID } from '@/domain/types';
import { defaultReplacement } from './preferences';

export interface CategoryUsage {
  transactions: number;
  recurring: number;
  budgets: number;
}

export interface DeleteCategoryModalProps {
  category: Category;
  categories: Category[];
  usage: CategoryUsage;
  onClose: () => void;
}

/** Exclusão de categoria com escolha da categoria que recebe os lançamentos e recorrências. */
export function DeleteCategoryModal({ category, categories, usage, onClose }: DeleteCategoryModalProps) {
  const toast = useToast();
  const selectId = useId();
  const options = categories
    .filter((c) => c.kind === category.kind && c.id !== category.id)
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, 'pt-BR'));
  const [replacementId, setReplacementId] = useState<ID>(() => defaultReplacement(category, categories) ?? '');
  const [busy, setBusy] = useState(false);
  const moved = usage.transactions + usage.recurring;

  async function confirm() {
    if (!replacementId) return;
    setBusy(true);
    try {
      await deleteCategory(category.id, replacementId);
      const target = categories.find((c) => c.id === replacementId);
      toast(
        moved > 0 && target ? `Categoria excluída. Registros movidos para "${target.name}".` : 'Categoria excluída.',
      );
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível excluir a categoria.', 'error');
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Excluir "${category.name}"?`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={() => void confirm()} loading={busy} disabled={!replacementId}>
            Excluir categoria
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
        {moved > 0 ? (
          <p>
            {[
              usage.transactions > 0 && plural(usage.transactions, 'lançamento', 'lançamentos'),
              usage.recurring > 0 && plural(usage.recurring, 'recorrência', 'recorrências'),
            ]
              .filter(Boolean)
              .join(' e ')}{' '}
            {moved === 1 ? 'será movido' : 'serão movidos'} para a categoria escolhida abaixo.
          </p>
        ) : (
          <p>Nenhum lançamento usa esta categoria.</p>
        )}
        {usage.budgets > 0 && (
          <p>
            {usage.budgets === 1
              ? 'O orçamento desta categoria será excluído.'
              : `Os ${usage.budgets} orçamentos desta categoria serão excluídos.`}
          </p>
        )}
        <Field label="Mover para" htmlFor={selectId}>
          <Select id={selectId} value={replacementId} onChange={(e) => setReplacementId(e.target.value)}>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
                {c.archived ? ' (arquivada)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-xs text-slate-500 dark:text-slate-400">Prefere manter o histórico? Arquive a categoria em vez de excluir.</p>
      </div>
    </Modal>
  );
}
