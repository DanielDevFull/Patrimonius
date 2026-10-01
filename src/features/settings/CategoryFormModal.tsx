import { useId, useState, type FormEvent } from 'react';
import { Badge, Button, ColorSwatches, Field, Input, Modal, SegmentedControl, Select, useToast } from '@/components/ui';
import { addCategory, updateCategory } from '@/db/repo';
import { COLOR_PALETTE } from '@/domain/defaults';
import { BUDGET_GROUP_LABELS, type BudgetGroup, type Category, type CategoryKind } from '@/domain/types';
import { CATEGORY_NAME_MAX, categoryNameError, parseKeywords } from './preferences';

const EMOJI_SUGGESTIONS = [
  '🏷️', '🏠', '💡', '🛒', '🚗', '🩺', '📚', '🍽️', '☕', '🎉', '🛍️', '📺',
  '💇', '🐾', '🎁', '✈️', '🎮', '👶', '🏋️', '🧾', '📈', '💳', '💼', '💰',
];

const KIND_OPTIONS: { value: CategoryKind; label: string }[] = [
  { value: 'despesa', label: 'Despesa' },
  { value: 'receita', label: 'Receita' },
];

export interface CategoryFormModalProps {
  /** Categoria em edição ou null para criar. */
  category: Category | null;
  /** Tipo inicial ao criar. */
  initialKind: CategoryKind;
  categories: Category[];
  onClose: () => void;
}

/** Criação/edição de categoria (montado somente quando aberto, para reiniciar o formulário). */
export function CategoryFormModal({ category, initialKind, categories, onClose }: CategoryFormModalProps) {
  const toast = useToast();
  const ids = { name: useId(), icon: useId(), group: useId(), keywords: useId(), form: useId() };
  const editing = category !== null;
  const [name, setName] = useState(category?.name ?? '');
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? initialKind);
  const [icon, setIcon] = useState(category?.icon ?? '🏷️');
  const [color, setColor] = useState(category?.color ?? COLOR_PALETTE[0]);
  const [group, setGroup] = useState<BudgetGroup>(category?.group ?? 'desejos');
  const [keywordsText, setKeywordsText] = useState(category?.keywords.join(', ') ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const nameError = categoryNameError(name, kind, categories, category?.id ?? null);
  const iconError = icon.trim() ? null : 'Escolha um emoji.';
  const keywords = parseKeywords(keywordsText);
  const colors = COLOR_PALETTE.includes(color) ? COLOR_PALETTE : [...COLOR_PALETTE, color];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (nameError || iconError) return;
    setSaving(true);
    const payload = {
      name: name.trim(),
      icon: icon.trim(),
      color,
      group: kind === 'despesa' ? group : null,
      keywords,
    };
    try {
      if (category) {
        await updateCategory(category.id, payload);
        toast('Categoria atualizada.');
      } else {
        await addCategory({ ...payload, kind, archived: false });
        toast('Categoria criada.');
      }
      onClose();
    } catch {
      toast('Não foi possível salvar a categoria.', 'error');
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Editar categoria' : 'Nova categoria'}
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
      <form id={ids.form} onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Nome" htmlFor={ids.name} error={submitted ? nameError : null}>
          <Input
            id={ids.name}
            value={name}
            maxLength={CATEGORY_NAME_MAX}
            placeholder="Ex.: Academia, Filhos, Viagens"
            aria-invalid={submitted && !!nameError}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Tipo</span>
          {editing ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              <Badge tone={kind === 'despesa' ? 'negative' : 'positive'}>{kind === 'despesa' ? 'Despesa' : 'Receita'}</Badge>{' '}
              O tipo não pode ser alterado depois de criada.
            </p>
          ) : (
            <SegmentedControl aria-label="Tipo da categoria" options={KIND_OPTIONS} value={kind} onChange={setKind} className="self-start" />
          )}
        </div>

        <Field label="Emoji" htmlFor={ids.icon} error={submitted ? iconError : null}>
          <div className="flex items-center gap-3">
            <div className="w-20 shrink-0">
              <Input
                id={ids.icon}
                value={icon}
                maxLength={8}
                className="text-center"
                onChange={(e) => setIcon(e.target.value)}
              />
            </div>
            <span
              className="flex size-10 items-center justify-center rounded-xl text-xl"
              style={{ backgroundColor: color }}
              aria-hidden
            >
              {icon}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Sugestões de emoji">
            {EMOJI_SUGGESTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Usar ${emoji}`}
                aria-pressed={icon === emoji}
                onClick={() => setIcon(emoji)}
                className="flex size-9 items-center justify-center rounded-lg text-lg hover:bg-slate-100 aria-pressed:bg-brand-100 dark:hover:bg-slate-800 dark:aria-pressed:bg-brand-950"
              >
                {emoji}
              </button>
            ))}
          </div>
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Cor</span>
          <ColorSwatches value={color} onChange={setColor} colors={colors} />
        </div>

        {kind === 'despesa' && (
          <Field
            label="Grupo (regra 50/30/20)"
            htmlFor={ids.group}
            hint="Necessidades: essenciais. Desejos: estilo de vida. Objetivos: poupança, investimentos e dívidas."
          >
            <Select id={ids.group} value={group} onChange={(e) => setGroup(e.target.value as BudgetGroup)}>
              {(Object.keys(BUDGET_GROUP_LABELS) as BudgetGroup[]).map((g) => (
                <option key={g} value={g}>
                  {BUDGET_GROUP_LABELS[g]}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field
          label="Palavras-chave"
          htmlFor={ids.keywords}
          hint="Separadas por vírgula. O agente usa para sugerir esta categoria ao registrar um lançamento."
        >
          <Input
            id={ids.keywords}
            value={keywordsText}
            placeholder="Ex.: padaria, café, pão"
            onChange={(e) => setKeywordsText(e.target.value)}
          />
        </Field>
        {keywords.length > 0 && (
          <div className="-mt-2 flex flex-wrap gap-1" aria-label="Palavras-chave que serão salvas">
            {keywords.map((k) => (
              <Badge key={k}>{k}</Badge>
            ))}
          </div>
        )}
      </form>
    </Modal>
  );
}
