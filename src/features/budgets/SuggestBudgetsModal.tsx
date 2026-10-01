import { Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import { Button, EmptyState, Modal, Money, MoneyInput, useToast } from '@/components/ui';
import { setBudget } from '@/db/repo';
import { formatPercent } from '@/domain/money';
import { plural } from '@/domain/text';
import type { Cents, ID } from '@/domain/types';
import type { SuggestionRow } from './budget-utils';

export interface SuggestBudgetsModalProps {
  rows: SuggestionRow[];
  /** Renda base (para mostrar quanto da renda os orçamentos selecionados representam). */
  income: Cents;
  onClose: () => void;
}

interface RowState {
  checked: boolean;
  amount: Cents | null;
}

/** Sugestões automáticas (média dos últimos 3 meses) com valores editáveis; aplica como orçamento padrão. */
export function SuggestBudgetsModal({ rows, income, onClose }: SuggestBudgetsModalProps) {
  const toast = useToast();
  const baseId = useId();
  const [state, setState] = useState<Record<ID, RowState>>(() =>
    Object.fromEntries(rows.map((r) => [r.categoryId, { checked: r.checked, amount: r.suggested }])),
  );
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = rows.filter((r) => state[r.categoryId]?.checked);
  const invalid = selected.filter((r) => {
    const amount = state[r.categoryId]?.amount ?? null;
    return amount === null || amount <= 0;
  });
  const total = selected.reduce((s, r) => s + (state[r.categoryId]?.amount ?? 0), 0);
  const allChecked = rows.length > 0 && selected.length === rows.length;

  function update(id: ID, patch: Partial<RowState>) {
    setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  }

  function toggleAll() {
    setState((s) =>
      Object.fromEntries(rows.map((r) => [r.categoryId, { ...s[r.categoryId], checked: !allChecked }])),
    );
  }

  async function apply() {
    setSubmitted(true);
    if (invalid.length > 0 || selected.length === 0) return;
    setSaving(true);
    try {
      for (const r of selected) {
        const amount = state[r.categoryId]?.amount;
        if (amount) await setBudget(r.categoryId, amount, null);
      }
      toast(
        selected.length === 1
          ? '1 orçamento aplicado como padrão.'
          : `${selected.length} orçamentos aplicados como padrão.`,
      );
      onClose();
    } catch {
      toast('Não foi possível aplicar as sugestões.', 'error');
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Sugerir orçamentos"
      description="Valores calculados pela média dos seus gastos nos últimos 3 meses, arredondados para cima."
      footer={
        rows.length > 0 ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => void apply()} loading={saving} disabled={selected.length === 0}>
              {selected.length === 1 ? 'Aplicar 1 orçamento' : `Aplicar ${selected.length} orçamentos`}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        )
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={36} aria-hidden />}
          title="Ainda não há histórico suficiente"
          description="As sugestões usam os gastos dos 3 meses anteriores. Registre suas despesas por algumas semanas ou defina os orçamentos manualmente."
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-slate-600 dark:text-slate-300">
              Marque as categorias e ajuste os valores. Eles serão salvos como padrão para todos os meses.
            </p>
            <Button size="sm" variant="ghost" onClick={toggleAll}>
              {allChecked ? 'Desmarcar todas' : 'Marcar todas'}
            </Button>
          </div>

          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {rows.map((r) => {
              const rowState = state[r.categoryId] ?? { checked: false, amount: null };
              const checkId = `${baseId}-${r.categoryId}`;
              const rowInvalid = submitted && rowState.checked && (rowState.amount === null || rowState.amount <= 0);
              return (
                <li key={r.categoryId} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <input
                      id={checkId}
                      type="checkbox"
                      checked={rowState.checked}
                      onChange={(e) => update(r.categoryId, { checked: e.target.checked })}
                      className="mt-1 size-4 shrink-0 accent-brand-700"
                    />
                    <div className="min-w-0">
                      <label htmlFor={checkId} className="block font-medium text-slate-800 dark:text-slate-100">
                        <span aria-hidden>{r.icon}</span> {r.name}
                      </label>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Média <Money value={r.average} /> · {plural(r.monthsWithData, 'mês', 'meses')} com gasto
                      </p>
                      {r.current && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {r.current.isDefault ? 'Padrão atual' : 'Valor específico deste mês'}:{' '}
                          <Money value={r.current.amount} />
                          {!r.current.isDefault && ' (continua valendo neste mês)'}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="sm:w-40">
                    <MoneyInput
                      value={rowState.amount}
                      onChange={(v) => update(r.categoryId, { amount: v })}
                      disabled={!rowState.checked}
                      aria-label={`Valor para ${r.name}`}
                    />
                    {rowInvalid && (
                      <p className="mt-1 text-xs text-rose-600 dark:text-rose-400" role="alert">
                        Informe um valor.
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
            <p className="text-slate-700 dark:text-slate-200">
              Total selecionado: <Money value={total} className="font-semibold" />
            </p>
            {income > 0 && total > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Equivale a {formatPercent(total / income)} da sua renda mensal de referência.
                {total > income && ' Atenção: é mais do que você ganha — reduza alguns valores.'}
              </p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
