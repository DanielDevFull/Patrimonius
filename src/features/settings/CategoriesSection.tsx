import { Archive, ArchiveRestore, ChevronDown, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, Card, CardHeader, cn, EmptyState, IconButton, SegmentedControl, useToast } from '@/components/ui';
import { updateCategory } from '@/db/repo';
import { RULE_50_30_20 } from '@/domain/defaults';
import { plural } from '@/domain/text';
import type { Budget, BudgetGroup, Category, CategoryKind, ID, RecurringRule, Transaction } from '@/domain/types';
import { CategoryFormModal } from './CategoryFormModal';
import { DeleteCategoryModal, type CategoryUsage } from './DeleteCategoryModal';
import { PROTECTED_CATEGORY_IDS, withAlpha } from './preferences';

const KIND_OPTIONS: { value: CategoryKind; label: string }[] = [
  { value: 'despesa', label: 'Despesas' },
  { value: 'receita', label: 'Receitas' },
];

const GROUP_ORDER: BudgetGroup[] = ['necessidades', 'desejos', 'objetivos'];
const rulePct = (group: BudgetGroup) => `${Math.round(RULE_50_30_20[group] * 100)}%`;
const GROUP_TITLES: Record<BudgetGroup, string> = {
  necessidades: `Necessidades · ${rulePct('necessidades')}`,
  desejos: `Desejos · ${rulePct('desejos')}`,
  objetivos: `Objetivos financeiros · ${rulePct('objetivos')}`,
};
const GROUP_TONES: Record<BudgetGroup, 'info' | 'warning' | 'positive'> = {
  necessidades: 'info',
  desejos: 'warning',
  objetivos: 'positive',
};

const byName = (a: Category, b: Category) => a.name.localeCompare(b.name, 'pt-BR');

export interface CategoriesSectionProps {
  categories: Category[];
  transactions: Transaction[];
  recurring: RecurringRule[];
  budgets: Budget[];
}

type Editing = { category: Category | null } | null;

/** Lista, criação, edição, arquivamento e exclusão de categorias. */
export function CategoriesSection({ categories, transactions, recurring, budgets }: CategoriesSectionProps) {
  const toast = useToast();
  const [kind, setKind] = useState<CategoryKind>('despesa');
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const usage = useMemo(() => {
    const map = new Map<ID, CategoryUsage>();
    const get = (id: ID) => {
      let u = map.get(id);
      if (!u) {
        u = { transactions: 0, recurring: 0, budgets: 0 };
        map.set(id, u);
      }
      return u;
    };
    for (const t of transactions) if (t.categoryId) get(t.categoryId).transactions += 1;
    for (const r of recurring) get(r.categoryId).recurring += 1;
    for (const b of budgets) get(b.categoryId).budgets += 1;
    return map;
  }, [transactions, recurring, budgets]);
  const usageOf = (id: ID): CategoryUsage => usage.get(id) ?? { transactions: 0, recurring: 0, budgets: 0 };

  const ofKind = categories.filter((c) => c.kind === kind);
  const active = ofKind.filter((c) => !c.archived);
  const archived = ofKind.filter((c) => c.archived).sort(byName);
  const sections: { key: string; title: string | null; group: BudgetGroup | null; items: Category[] }[] =
    kind === 'despesa'
      ? [
          ...GROUP_ORDER.map((g) => ({
            key: g,
            title: GROUP_TITLES[g],
            group: g,
            items: active.filter((c) => c.group === g).sort(byName),
          })),
          { key: 'sem-grupo', title: 'Sem grupo', group: null, items: active.filter((c) => c.group === null).sort(byName) },
        ].filter((s) => s.items.length > 0)
      : [{ key: 'receitas', title: null, group: null, items: [...active].sort(byName) }];

  async function toggleArchive(c: Category) {
    try {
      await updateCategory(c.id, { archived: !c.archived });
      toast(c.archived ? `"${c.name}" foi reativada.` : `"${c.name}" foi arquivada.`);
    } catch {
      toast('Não foi possível atualizar a categoria.', 'error');
    }
  }

  function renderRow(c: Category) {
    const u = usageOf(c.id);
    const isProtected = PROTECTED_CATEGORY_IDS.has(c.id);
    return (
      <li key={c.id} className={cn('flex items-center gap-3 py-2.5', c.archived && 'opacity-70')}>
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-xl"
          style={{ backgroundColor: withAlpha(c.color, 0.18), boxShadow: `inset 0 0 0 1px ${withAlpha(c.color, 0.45)}` }}
          aria-hidden
        >
          {c.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{c.name}</p>
            {c.archived && <Badge>Arquivada</Badge>}
          </div>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {u.transactions > 0 ? plural(u.transactions, 'lançamento', 'lançamentos') : 'Sem lançamentos'}
            {c.keywords.length > 0 && ` · ${c.keywords.slice(0, 4).join(', ')}${c.keywords.length > 4 ? '…' : ''}`}
          </p>
        </div>
        <div className="-mr-1 flex shrink-0 items-center">
          <IconButton label={`Editar ${c.name}`} size="sm" onClick={() => setEditing({ category: c })}>
            <Pencil size={16} />
          </IconButton>
          <IconButton
            label={c.archived ? `Reativar ${c.name}` : `Arquivar ${c.name}`}
            size="sm"
            onClick={() => void toggleArchive(c)}
          >
            {c.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          </IconButton>
          <IconButton
            label={isProtected ? `${c.name} é usada pelo app e não pode ser excluída` : `Excluir ${c.name}`}
            size="sm"
            variant="danger"
            disabled={isProtected}
            className="disabled:cursor-not-allowed"
            onClick={() => setDeleting(c)}
          >
            <Trash2 size={16} />
          </IconButton>
        </div>
      </li>
    );
  }

  return (
    <Card id="categorias" className="scroll-mt-20">
      <CardHeader
        icon={<Tags size={20} />}
        title="Categorias"
        subtitle="Organize seus gastos e receitas. Arquivadas não aparecem nos formulários."
        actions={
          <Button size="sm" icon={<Plus size={16} />} onClick={() => setEditing({ category: null })}>
            <span className="hidden sm:inline">Nova categoria</span>
            <span className="sm:hidden">Nova</span>
          </Button>
        }
      />
      <SegmentedControl mode="radio" aria-label="Tipo de categoria" options={KIND_OPTIONS} value={kind} onChange={setKind} className="mb-3" />

      {active.length === 0 ? (
        <EmptyState
          icon={<Tags />}
          title="Nenhuma categoria ativa"
          description="Crie uma categoria ou reative uma arquivada."
        />
      ) : (
        sections.map((s) => (
          <section key={s.key} aria-label={s.title ?? undefined} className="mt-2">
            {s.title && (
              <h3 className="mt-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {s.title}
                <Badge tone={s.group ? GROUP_TONES[s.group] : 'neutral'}>{s.items.length}</Badge>
              </h3>
            )}
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">{s.items.map(renderRow)}</ul>
          </section>
        ))
      )}

      {archived.length > 0 && (
        <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
          <button
            type="button"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center gap-1 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            <ChevronDown size={16} className={cn('transition-transform', showArchived && 'rotate-180')} />
            Arquivadas ({archived.length})
          </button>
          {showArchived && <ul className="divide-y divide-slate-100 dark:divide-slate-800">{archived.map(renderRow)}</ul>}
        </div>
      )}

      {editing && (
        <CategoryFormModal
          category={editing.category}
          initialKind={kind}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <DeleteCategoryModal
          category={deleting}
          categories={categories}
          usage={usageOf(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </Card>
  );
}
