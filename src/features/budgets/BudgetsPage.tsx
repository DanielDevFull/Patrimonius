import { CalendarClock, Copy, PiggyBank, Plus, Sparkles } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { budgetOverview, suggestBudgets, type BudgetStatus } from '@/analytics';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Money,
  MonthPicker,
  PageHeader,
  ProgressBar,
  Spinner,
  useConfirm,
  useToast,
} from '@/components/ui';
import { useFinanceData, useToday } from '@/db/hooks';
import { copyBudgets, deleteBudget } from '@/db/repo';
import { formatMonthLong, monthKey } from '@/domain/dates';
import { formatPercent } from '@/domain/money';
import { plural } from '@/domain/text';
import type { ID, MonthKey } from '@/domain/types';
import { BudgetFormModal } from './BudgetFormModal';
import { BudgetRow } from './BudgetRow';
import {
  buildSuggestionRows,
  categoriesWithoutBudget,
  dailyAllowance,
  defaultBudgetOf,
  previousMonth,
  ruleAnalysis,
  specificBudgetCount,
  unbudgetedSpending,
} from './budget-utils';
import { RuleCard } from './RuleCard';
import { SuggestBudgetsModal } from './SuggestBudgetsModal';

type EditorState = { item: BudgetStatus } | { item: null; categoryId: ID | null };

export default function BudgetsPage() {
  const data = useFinanceData();
  const today = useToday();
  const toast = useToast();
  const confirm = useConfirm();
  const [month, setMonth] = useState<MonthKey>(() => monthKey(today));
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const unbudgetedTitleId = useId();

  const view = useMemo(() => {
    if (!data) return null;
    const overview = budgetOverview(data.budgets, data.transactions, data.categories, month, today);
    return {
      overview,
      available: categoriesWithoutBudget(data.categories, overview.items),
      unbudgeted: unbudgetedSpending(data.transactions, data.categories, month, overview.items),
      suggestions: buildSuggestionRows(
        suggestBudgets(data.transactions, data.categories, month),
        data.categories,
        overview.items,
      ),
      rule: ruleAnalysis(overview.items, data.categories, data.transactions, data.settings, month),
      allowance: dailyAllowance(overview.totalRemaining, month, today),
    };
  }, [data, month, today]);

  if (!data || !view) return <Spinner />;

  const { overview, available, unbudgeted, suggestions, rule, allowance } = view;
  const monthLabel = formatMonthLong(month);
  const prev = previousMonth(month);
  const prevSpecific = specificBudgetCount(data.budgets, prev);
  const isCurrentMonth = month === monthKey(today);
  const hasBudgets = overview.items.length > 0;

  async function copyFromPrevious() {
    if (prevSpecific === 0) {
      toast(
        `${formatMonthLong(prev)} não tem orçamentos específicos para copiar. Os orçamentos padrão já valem para todos os meses.`,
        'info',
      );
      return;
    }
    const ok = await confirm({
      title: `Copiar orçamentos de ${formatMonthLong(prev)}?`,
      message: `${plural(prevSpecific, 'orçamento específico será copiado', 'orçamentos específicos serão copiados')} para ${monthLabel}, substituindo os valores das mesmas categorias neste mês.`,
      confirmLabel: 'Copiar',
    });
    if (!ok) return;
    setCopying(true);
    try {
      const n = await copyBudgets(prev, month);
      toast(n === 1 ? '1 orçamento copiado.' : `${n} orçamentos copiados.`);
    } catch {
      toast('Não foi possível copiar os orçamentos.', 'error');
    } finally {
      setCopying(false);
    }
  }

  async function remove(item: BudgetStatus) {
    const fallback = item.isDefault ? null : defaultBudgetOf(data?.budgets ?? [], item.categoryId);
    const ok = await confirm({
      title: `Remover o orçamento de ${item.categoryName}?`,
      message: item.isDefault
        ? 'Este é o orçamento padrão: ele deixa de valer para todos os meses que não têm um valor específico. Seus lançamentos não são alterados.'
        : fallback
          ? `Remove só o valor específico de ${monthLabel}. O orçamento padrão da categoria volta a valer neste mês.`
          : `Remove o orçamento de ${monthLabel}. Seus lançamentos não são alterados.`,
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteBudget(item.budgetId);
      toast('Orçamento removido.');
    } catch {
      toast('Não foi possível remover o orçamento.', 'error');
    }
  }

  const actions = (
    <div className="mb-4 flex flex-wrap gap-2">
      <Button
        icon={<Plus size={16} aria-hidden />}
        onClick={() => setEditor({ item: null, categoryId: null })}
        disabled={available.length === 0}
        title={available.length === 0 ? 'Todas as categorias de despesa já têm orçamento.' : undefined}
      >
        Adicionar orçamento
      </Button>
      <Button variant="secondary" icon={<Sparkles size={16} aria-hidden />} onClick={() => setSuggestOpen(true)}>
        Sugerir orçamentos
      </Button>
      <Button
        variant="secondary"
        icon={<Copy size={16} aria-hidden />}
        loading={copying}
        onClick={() => void copyFromPrevious()}
      >
        Copiar do mês anterior
      </Button>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Orçamentos"
        subtitle="Limites de gastos por categoria para manter o mês sob controle."
        actions={<MonthPicker value={month} onChange={setMonth} />}
      />

      {actions}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {hasBudgets ? (
            <>
              <Card>
                <section aria-label="Visão geral do mês" className="space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Gasto no mês
                      </p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">
                        <Money value={overview.totalSpent} />{' '}
                        <span className="text-base font-medium text-slate-500 dark:text-slate-400">
                          de <Money value={overview.totalBudgeted} />
                        </span>
                      </p>
                    </div>
                    <p className="tabular text-sm font-medium text-slate-600 dark:text-slate-300">
                      {formatPercent(overview.percent)} do orçado
                    </p>
                  </div>
                  <ProgressBar value={overview.percent} label="Uso total dos orçamentos" />
                  <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Orçado</dt>
                      <dd className="font-semibold">
                        <Money value={overview.totalBudgeted} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        {overview.totalRemaining < 0 ? 'Excedido' : 'Restante'}
                      </dt>
                      <dd
                        className={
                          overview.totalRemaining < 0
                            ? 'font-semibold text-rose-600 dark:text-rose-400'
                            : 'font-semibold text-emerald-700 dark:text-emerald-400'
                        }
                      >
                        <Money value={Math.abs(overview.totalRemaining)} />
                      </dd>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <dt className="text-slate-500 dark:text-slate-400">Gastos fora do orçamento</dt>
                      <dd className="font-semibold">
                        <Money value={overview.unbudgetedSpent} />
                      </dd>
                    </div>
                  </dl>
                  {allowance && (
                    <p className="flex items-start gap-2 rounded-lg bg-slate-50 p-2.5 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                      <CalendarClock size={16} aria-hidden className="mt-0.5 shrink-0 text-brand-700 dark:text-brand-400" />
                      {allowance.perDay > 0 ? (
                        <span>
                          {allowance.daysLeft === 1 ? 'Último dia do mês' : `Faltam ${allowance.daysLeft} dias`}: dá
                          para gastar até <Money value={allowance.perDay} className="font-semibold" /> por dia nas
                          categorias orçadas.
                        </span>
                      ) : (
                        <span>
                          O total orçado já foi usado. Até o fim do mês, tente segurar os gastos nas categorias
                          orçadas.
                        </span>
                      )}
                    </p>
                  )}
                </section>
              </Card>

              <Card>
                <CardHeader
                  title="Categorias"
                  subtitle={`${plural(overview.items.length, 'orçamento', 'orçamentos')} em ${monthLabel}`}
                />
                <ul className="divide-y divide-slate-200 dark:divide-slate-800" aria-label="Orçamentos por categoria">
                  {overview.items.map((item) => (
                    <BudgetRow
                      key={item.budgetId}
                      item={item}
                      showProjection={isCurrentMonth}
                      onEdit={(i) => setEditor({ item: i })}
                      onRemove={(i) => void remove(i)}
                    />
                  ))}
                </ul>
              </Card>
            </>
          ) : (
            <Card>
              <EmptyState
                icon={<PiggyBank size={40} aria-hidden />}
                title={`Nenhum orçamento em ${monthLabel}`}
                description={
                  <>
                    Orçamento é um limite de gastos que você define para cada categoria — por exemplo,{' '}
                    <Money value={80000} /> de mercado por mês. Assim você sabe quanto ainda pode gastar e o Pat
                    avisa quando algo estiver perto de estourar.{' '}
                    {suggestions.length > 0
                      ? 'Posso sugerir valores com base na média dos seus gastos recentes.'
                      : 'Quando você tiver alguns meses de gastos registrados, eu sugiro valores automaticamente.'}
                  </>
                }
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    {suggestions.length > 0 && (
                      <Button icon={<Sparkles size={16} aria-hidden />} onClick={() => setSuggestOpen(true)}>
                        Ver sugestões automáticas
                      </Button>
                    )}
                    <Button
                      variant={suggestions.length > 0 ? 'secondary' : 'primary'}
                      icon={<Plus size={16} aria-hidden />}
                      onClick={() => setEditor({ item: null, categoryId: null })}
                    >
                      Criar manualmente
                    </Button>
                  </div>
                }
              />
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <RuleCard analysis={rule} />

          {unbudgeted.length > 0 && (
            <Card>
              <section aria-labelledby={unbudgetedTitleId}>
                <CardHeader
                  title={<span id={unbudgetedTitleId}>Gastos fora do orçamento</span>}
                  subtitle={
                    <>
                      <Money value={overview.unbudgetedSpent} /> em categorias sem limite
                    </>
                  }
                />
                <ul className="space-y-2">
                  {unbudgeted.slice(0, 6).map((row) => (
                    <li key={row.categoryId ?? 'sem-categoria'} className="flex items-center gap-2 text-sm">
                      <span aria-hidden className="w-6 shrink-0 text-center">
                        {row.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{row.name}</span>
                      <Money value={row.total} className="font-medium" />
                      {row.canBudget && row.categoryId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Definir orçamento para ${row.name}`}
                          onClick={() => setEditor({ item: null, categoryId: row.categoryId })}
                        >
                          <Plus size={14} aria-hidden />
                          Limite
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </Card>
          )}
        </div>
      </div>

      {editor && (
        <BudgetFormModal
          month={month}
          item={editor.item}
          initialCategoryId={editor.item ? null : editor.categoryId}
          available={available}
          categories={data.categories}
          budgets={data.budgets}
          transactions={data.transactions}
          onClose={() => setEditor(null)}
        />
      )}
      {suggestOpen && (
        <SuggestBudgetsModal rows={suggestions} income={rule.income} onClose={() => setSuggestOpen(false)} />
      )}
    </div>
  );
}
