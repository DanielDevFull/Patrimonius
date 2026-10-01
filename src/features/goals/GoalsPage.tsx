import { CalendarClock, PiggyBank, Plus, Target, Trophy } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { emergencyFund, goalsOverview, type GoalProgress } from '@/analytics';
import {
  Button,
  Card,
  EmptyState,
  Money,
  PageHeader,
  ProgressBar,
  Spinner,
  StatCard,
  useConfirm,
  useToast,
} from '@/components/ui';
import { useFinanceData, useToday } from '@/db/hooks';
import { deleteGoal, deleteGoalContribution, updateGoal } from '@/db/repo';
import { formatDateBR, monthKey } from '@/domain/dates';
import { formatPercent } from '@/domain/money';
import { plural } from '@/domain/text';
import type { Goal, GoalContribution, ID } from '@/domain/types';
import { ContributionModal } from './ContributionModal';
import { GoalCard } from './GoalCard';
import { GoalFormModal } from './GoalFormModal';
import {
  contributionsOf,
  goalTemplates,
  reconcileStatus,
  savedFor,
  sectionOf,
  type ContributionMode,
  type GoalSection,
  type GoalTemplate,
} from './goal-utils';

/** Quanto tempo o destaque de comemoração fica visível. */
const CELEBRATION_MS = 12_000;

type FormState = { goal: Goal | null; template: GoalTemplate | null };
type ContributionState = { goalId: ID; mode: ContributionMode };

const SECTION_TITLES: Record<GoalSection, string> = {
  andamento: 'Em andamento',
  pausadas: 'Pausadas',
  concluidas: 'Concluídas',
};

function TemplatePicker({
  templates,
  onPick,
  compact,
}: {
  templates: GoalTemplate[];
  onPick: (t: GoalTemplate) => void;
  compact?: boolean;
}) {
  return (
    <ul className={compact ? 'flex flex-wrap gap-2' : 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'}>
      {templates.map((t) => (
        <li key={t.key}>
          <button
            type="button"
            onClick={() => onPick(t)}
            aria-label={`Criar meta a partir do modelo ${t.name}`}
            className={
              compact
                ? 'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-brand-500 hover:bg-brand-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-brand-950'
                : 'flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-brand-500 hover:bg-brand-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-brand-950'
            }
          >
            <span aria-hidden className={compact ? 'text-base' : 'text-2xl'}>
              {t.icon}
            </span>
            {compact ? (
              t.name
            ) : (
              <span className="min-w-0">
                <span className="block font-medium text-slate-800 dark:text-slate-100">{t.name}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {t.target ? (
                    <>
                      Sugestão: <Money value={t.target} /> · {t.description}
                    </>
                  ) : (
                    t.description
                  )}
                </span>
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function GoalsPage() {
  const data = useFinanceData();
  const today = useToday();
  const toast = useToast();
  const confirm = useConfirm();
  const templatesTitleId = useId();
  const [form, setForm] = useState<FormState | null>(null);
  const [contribution, setContribution] = useState<ContributionState | null>(null);
  const [celebratingId, setCelebratingId] = useState<ID | null>(null);

  useEffect(() => {
    if (!celebratingId) return;
    const t = window.setTimeout(() => setCelebratingId(null), CELEBRATION_MS);
    return () => window.clearTimeout(t);
  }, [celebratingId]);

  const view = useMemo(() => {
    if (!data) return null;
    const overview = goalsOverview(data.goals, data.goalContributions, today);
    const emergency = emergencyFund(data, today);
    const sections: Record<GoalSection, GoalProgress[]> = { andamento: [], pausadas: [], concluidas: [] };
    for (const item of overview.items) sections[sectionOf(item.track)].push(item);
    return { overview, sections, templates: goalTemplates(emergency) };
  }, [data, today]);

  if (!data || !view) return <Spinner />;

  const { overview, sections, templates } = view;
  const goalsById = new Map(data.goals.map((g) => [g.id, g]));
  const accountsById = new Map(data.accounts.map((a) => [a.id, a]));
  const overallPercent = overview.totalTarget > 0 ? Math.min(1, overview.totalSaved / overview.totalTarget) : 0;

  const contributionGoal = contribution ? goalsById.get(contribution.goalId) : undefined;
  const contributionProgress = contribution
    ? overview.items.find((i) => i.goalId === contribution.goalId)
    : undefined;
  const formSaved = form?.goal ? savedFor(form.goal.id, data.goalContributions) : 0;
  const formGoalId = form?.goal?.id;
  const formContributedThisMonth =
    formGoalId !== undefined &&
    data.goalContributions.some(
      (c) => c.goalId === formGoalId && c.amount > 0 && monthKey(c.date) === monthKey(today),
    );

  async function togglePause(goal: Goal) {
    const saved = savedFor(goal.id, data?.goalContributions ?? []);
    const resuming = goal.status === 'pausada';
    try {
      await updateGoal(goal.id, {
        status: resuming ? reconcileStatus('ativa', saved, goal.targetAmount) : 'pausada',
      });
      toast(resuming ? 'Meta retomada.' : 'Meta pausada. Ela não entra no aporte mensal necessário.', 'info');
    } catch {
      toast('Não foi possível alterar a meta.', 'error');
    }
  }

  async function removeGoal(goal: Goal) {
    const count = (data?.goalContributions ?? []).filter((c) => c.goalId === goal.id).length;
    const ok = await confirm({
      title: `Excluir a meta “${goal.name}”?`,
      message:
        count > 0
          ? `O histórico de ${plural(count, 'aporte', 'aportes')} será apagado. Lançamentos já criados nas suas contas não são alterados.`
          : 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteGoal(goal.id);
      toast('Meta excluída.');
    } catch {
      toast('Não foi possível excluir a meta.', 'error');
    }
  }

  async function removeContribution(goal: Goal, c: GoalContribution) {
    const kind = c.amount >= 0 ? 'aporte' : 'resgate';
    const ok = await confirm({
      title: `Excluir ${kind} de ${formatDateBR(c.date)}?`,
      message: c.transactionId
        ? `O lançamento criado na conta junto com este ${kind} também será excluído.`
        : `O valor guardado na meta será recalculado.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteGoalContribution(c.id, true);
      // O repositório não recalcula o status ao remover um aporte: mantém a meta coerente com o valor guardado.
      const remaining = (data?.goalContributions ?? []).filter((x) => x.id !== c.id);
      const status = reconcileStatus(goal.status, savedFor(goal.id, remaining), goal.targetAmount);
      if (status !== goal.status) await updateGoal(goal.id, { status });
      toast(kind === 'aporte' ? 'Aporte excluído.' : 'Resgate excluído.');
    } catch {
      toast('Não foi possível excluir.', 'error');
    }
  }

  function celebrate(goal: Goal) {
    setCelebratingId(goal.id);
    toast(`🎉 Parabéns! Você concluiu a meta “${goal.name}”!`);
  }

  const renderSection = (key: GoalSection) => {
    const items = sections[key];
    if (items.length === 0) return null;
    return (
      <section key={key} aria-label={SECTION_TITLES[key]} className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {SECTION_TITLES[key]} ({items.length})
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => {
            const goal = goalsById.get(p.goalId);
            if (!goal) return null;
            return (
              <GoalCard
                key={goal.id}
                goal={goal}
                progress={p}
                history={contributionsOf(goal.id, data.goalContributions)}
                account={goal.accountId ? accountsById.get(goal.accountId) : undefined}
                celebrating={celebratingId === goal.id}
                onDismissCelebration={() => setCelebratingId(null)}
                onContribute={(g, mode) => setContribution({ goalId: g.id, mode })}
                onEdit={(g) => setForm({ goal: g, template: null })}
                onTogglePause={(g) => void togglePause(g)}
                onDelete={(g) => void removeGoal(g)}
                onDeleteContribution={(g, c) => void removeContribution(g, c)}
              />
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div>
      <PageHeader
        title="Metas"
        subtitle="Transforme sonhos em planos: quanto guardar, por quanto tempo e se você está no ritmo."
        actions={
          <Button icon={<Plus size={16} aria-hidden />} onClick={() => setForm({ goal: null, template: null })}>
            Nova meta
          </Button>
        }
      />

      {data.goals.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Target size={40} aria-hidden />}
            title="Nenhuma meta ainda"
            description="Metas dão direção ao seu dinheiro. Defina quanto quer juntar e até quando — eu calculo quanto guardar por mês e aviso se você estiver fora do ritmo."
            action={
              <Button icon={<Plus size={16} aria-hidden />} onClick={() => setForm({ goal: null, template: null })}>
                Criar minha primeira meta
              </Button>
            }
          />
          <section aria-labelledby={templatesTitleId} className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <h2 id={templatesTitleId} className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Ou comece com um modelo
            </h2>
            <TemplatePicker templates={templates} onPick={(t) => setForm({ goal: null, template: t })} />
          </section>
        </Card>
      ) : (
        <div className="space-y-6">
          <section aria-label="Resumo das metas" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Total guardado"
              tone="brand"
              icon={<PiggyBank size={20} aria-hidden />}
              value={<Money value={overview.totalSaved} />}
              hint={
                <>
                  de <Money value={overview.totalTarget} /> ({formatPercent(overallPercent)})
                </>
              }
            />
            <StatCard
              label="Aporte mensal necessário"
              icon={<CalendarClock size={20} aria-hidden />}
              value={<Money value={overview.totalRequiredMonthly} />}
              hint="Soma das metas em andamento com prazo a vencer (metas vencidas não entram)"
            />
            <StatCard
              label="Metas"
              tone="positive"
              icon={<Trophy size={20} aria-hidden />}
              value={`${overview.activeCount} em andamento`}
              hint={plural(overview.completedCount, 'concluída', 'concluídas')}
            />
          </section>
          <ProgressBar value={overallPercent} tone="brand" label="Progresso total das metas" className="-mt-2" />

          <section aria-labelledby={templatesTitleId}>
            <h2 id={templatesTitleId} className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Modelos rápidos
            </h2>
            <TemplatePicker compact templates={templates} onPick={(t) => setForm({ goal: null, template: t })} />
          </section>

          {renderSection('andamento')}
          {renderSection('pausadas')}
          {renderSection('concluidas')}
        </div>
      )}

      {form && (
        <GoalFormModal
          goal={form.goal}
          template={form.template}
          saved={formSaved}
          contributedThisMonth={formContributedThisMonth}
          accounts={data.accounts}
          today={today}
          onClose={() => setForm(null)}
        />
      )}
      {contribution && contributionGoal && contributionProgress && (
        <ContributionModal
          goal={contributionGoal}
          progress={contributionProgress}
          mode={contribution.mode}
          accounts={data.accounts}
          today={today}
          onClose={() => setContribution(null)}
          onDone={({ completed }) => {
            if (completed) celebrate(contributionGoal);
          }}
          onLinkAccount={() => {
            setContribution(null);
            setForm({ goal: contributionGoal, template: null });
          }}
        />
      )}
    </div>
  );
}
