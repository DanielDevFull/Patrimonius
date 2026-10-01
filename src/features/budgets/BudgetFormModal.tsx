import { Lightbulb } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { categorySpent, suggestBudgets, type BudgetStatus } from '@/analytics';
import { Button, Field, Modal, Money, MoneyInput, Select, useToast } from '@/components/ui';
import { deleteBudget, setBudget } from '@/db/repo';
import { formatMonthLong } from '@/domain/dates';
import type { Budget, Category, Cents, ID, MonthKey, Transaction } from '@/domain/types';
import { defaultBudgetOf, planBudgetSave, type BudgetScope } from './budget-utils';

export interface BudgetFormModalProps {
  month: MonthKey;
  /** Orçamento vigente em edição (null = novo orçamento). */
  item: BudgetStatus | null;
  /** Categoria pré-selecionada ao criar. */
  initialCategoryId?: ID | null;
  /** Categorias disponíveis ao criar (despesas ativas sem orçamento no mês). */
  available: Category[];
  categories: Category[];
  budgets: Budget[];
  transactions: Transaction[];
  onClose: () => void;
}

/** Criação/edição do valor de um orçamento, com escolha entre "todos os meses" e "só este mês". */
export function BudgetFormModal({
  month,
  item,
  initialCategoryId,
  available,
  categories,
  budgets,
  transactions,
  onClose,
}: BudgetFormModalProps) {
  const toast = useToast();
  const ids = { form: useId(), category: useId(), amount: useId(), scope: useId() };
  const [categoryId, setCategoryId] = useState<ID>(
    item?.categoryId ?? initialCategoryId ?? available[0]?.id ?? '',
  );
  const [amount, setAmount] = useState<Cents | null>(item ? item.budgeted : null);
  const [scope, setScope] = useState<BudgetScope>(item && !item.isDefault ? 'mes' : 'padrao');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const monthLabel = formatMonthLong(month);
  const suggestion = useMemo(
    () => suggestBudgets(transactions, categories, month).find((s) => s.categoryId === categoryId) ?? null,
    [transactions, categories, month, categoryId],
  );
  const spent = useMemo(() => categorySpent(transactions, categoryId, month), [transactions, categoryId, month]);
  const fallback = categoryId ? defaultBudgetOf(budgets, categoryId) : null;
  const hasSpecific = !!item && !item.isDefault;

  const errors: { category?: string; amount?: string } = {};
  if (!categoryId) errors.category = 'Escolha uma categoria.';
  if (amount === null || amount <= 0) errors.amount = 'Informe um valor maior que zero.';
  const show = (f: keyof typeof errors) => (submitted ? errors[f] : undefined);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (errors.category || errors.amount || amount === null) {
      document.getElementById(errors.category ? ids.category : ids.amount)?.focus();
      return;
    }
    setSaving(true);
    try {
      const plan = planBudgetSave(budgets, categoryId, scope, month);
      await setBudget(categoryId, amount, plan.month);
      for (const id of plan.removeIds) await deleteBudget(id);
      toast(item ? 'Orçamento atualizado.' : 'Orçamento criado.');
      onClose();
    } catch {
      toast('Não foi possível salvar o orçamento.', 'error');
      setSaving(false);
    }
  }

  const noCategories = !item && available.length === 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? `Orçamento de ${item.categoryName}` : 'Novo orçamento'}
      description={item ? `Limite de gastos da categoria em ${monthLabel}.` : 'Defina um limite mensal de gastos.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={ids.form} loading={saving} disabled={noCategories}>
            Salvar
          </Button>
        </>
      }
    >
      {noCategories ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Todas as categorias de despesa já têm orçamento em {monthLabel}. Para mudar um valor, use o botão de
          editar na lista.
        </p>
      ) : (
        <form id={ids.form} onSubmit={onSubmit} noValidate className="space-y-4">
          {!item && (
            <Field label="Categoria" htmlFor={ids.category} error={show('category')}>
              <Select id={ids.category} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Valor mensal" htmlFor={ids.amount} error={show('amount')}>
            <MoneyInput id={ids.amount} value={amount} onChange={setAmount} />
          </Field>

          <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            <p>
              Gasto em {monthLabel}: <Money value={spent} />
            </p>
            {suggestion ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5">
                  <Lightbulb size={14} aria-hidden className="shrink-0 text-amber-500" />
                  <span>
                    Média dos últimos meses: <Money value={suggestion.average} />
                  </span>
                </p>
                <Button size="sm" variant="ghost" onClick={() => setAmount(suggestion.suggested)}>
                  Usar <Money value={suggestion.suggested} />
                </Button>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sem histórico recente nesta categoria para sugerir um valor.
              </p>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Vale para</legend>
            <ScopeOption
              name={ids.scope}
              value="padrao"
              checked={scope === 'padrao'}
              onSelect={setScope}
              label="Todos os meses (padrão)"
              hint={
                hasSpecific
                  ? `Vira o padrão de todos os meses e substitui o valor específico de ${monthLabel}.`
                  : 'Vale para todos os meses que não tiverem um valor específico.'
              }
            />
            <ScopeOption
              name={ids.scope}
              value="mes"
              checked={scope === 'mes'}
              onSelect={setScope}
              label={`Somente ${monthLabel}`}
              hint={
                fallback ? (
                  <>
                    Os outros meses continuam com o padrão de <Money value={fallback.amount} />.
                  </>
                ) : (
                  'Use para meses atípicos (férias, Natal, uma viagem…).'
                )
              }
            />
          </fieldset>
        </form>
      )}
    </Modal>
  );
}

function ScopeOption({
  name,
  value,
  checked,
  onSelect,
  label,
  hint,
}: {
  name: string;
  value: BudgetScope;
  checked: boolean;
  onSelect: (v: BudgetScope) => void;
  label: string;
  hint: ReactNode;
}) {
  const id = useId();
  return (
    <div
      className={
        checked
          ? 'flex gap-3 rounded-xl border border-brand-500 bg-brand-50/60 p-3 dark:border-brand-600 dark:bg-brand-950/40'
          : 'flex gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700'
      }
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        aria-describedby={`${id}-hint`}
        className="mt-0.5 size-4 shrink-0 accent-brand-700"
      />
      <div>
        <label htmlFor={id} className="block text-sm font-medium text-slate-800 dark:text-slate-100">
          {label}
        </label>
        <p id={`${id}-hint`} className="text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      </div>
    </div>
  );
}
