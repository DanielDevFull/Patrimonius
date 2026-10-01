import {
  ChevronDown,
  ChevronUp,
  Link2,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import { useId, useState } from 'react';
import type { GoalProgress } from '@/analytics';
import { Badge, Button, Card, IconButton, Money, ProgressBar, cn } from '@/components/ui';
import { formatDateBR, formatMonthLong, monthKey } from '@/domain/dates';
import { formatPercent } from '@/domain/money';
import { plural } from '@/domain/text';
import { PRIORITY_LABELS, type Account, type Goal, type GoalContribution } from '@/domain/types';
import { TRACK_META, coachTip, type ContributionMode } from './goal-utils';

export interface GoalCardProps {
  goal: Goal;
  progress: GoalProgress;
  /** Aportes/resgates da meta, mais recentes primeiro. */
  history: GoalContribution[];
  account: Account | undefined;
  /** Destaque de comemoração (meta acabou de ser concluída). */
  celebrating: boolean;
  onDismissCelebration: () => void;
  onContribute: (goal: Goal, mode: ContributionMode) => void;
  onEdit: (goal: Goal) => void;
  onTogglePause: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  onDeleteContribution: (goal: Goal, contribution: GoalContribution) => void;
}

function Tip({ progress }: { progress: GoalProgress }) {
  const tip = coachTip(progress);
  if (!tip) return null;
  const base = 'rounded-lg px-3 py-2 text-xs';
  switch (tip.kind) {
    case 'no_ritmo':
      return (
        <p className={cn(base, 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300')}>
          Você está no ritmo certo para cumprir o prazo. Continue assim!
        </p>
      );
    case 'atrasada':
      return (
        <p className={cn(base, 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300')}>
          Para cumprir o prazo, aumente os aportes em cerca de <Money value={tip.extraMonthly} /> por mês ou
          estenda o prazo.
        </p>
      );
    case 'comecar':
      return (
        <p className={cn(base, 'bg-brand-50 text-brand-900 dark:bg-brand-950/50 dark:text-brand-200')}>
          Comece com aportes de <Money value={tip.monthly} /> por mês para chegar lá no prazo.
        </p>
      );
    case 'vencida':
      return (
        <p className={cn(base, 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300')}>
          O prazo passou e ainda faltam <Money value={tip.remaining} />. Que tal definir uma nova data?
        </p>
      );
    case 'sem_prazo_com_ritmo':
      return (
        <p className={cn(base, 'bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300')}>
          No ritmo atual, você conclui em {formatMonthLong(monthKey(tip.date))}. Definir um prazo ajuda a manter o
          foco.
        </p>
      );
    case 'sem_aportes':
      return (
        <p className={cn(base, 'bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300')}>
          Faça o primeiro aporte — mesmo um valor pequeno já coloca a meta em movimento.
        </p>
      );
  }
}

/** Cartão de uma meta com progresso, números do plano, ações e histórico de aportes. */
export function GoalCard({
  goal,
  progress,
  history,
  account,
  celebrating,
  onDismissCelebration,
  onContribute,
  onEdit,
  onTogglePause,
  onDelete,
  onDeleteContribution,
}: GoalCardProps) {
  const headingId = useId();
  const historyId = useId();
  const [showHistory, setShowHistory] = useState(false);
  const track = TRACK_META[progress.track];
  const done = progress.track === 'concluida';
  const paused = goal.status === 'pausada';

  return (
    <Card
      className={cn(
        'flex flex-col gap-4 transition-shadow',
        paused && 'opacity-80',
        celebrating && 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-950',
      )}
    >
      <article aria-labelledby={headingId} className="flex flex-col gap-4">
        {celebrating && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200"
          >
            <span aria-hidden className="text-2xl motion-safe:animate-bounce">
              🎉
            </span>
            <div className="flex-1">
              <p className="font-semibold">Meta concluída! Parabéns!</p>
              <p>Você chegou lá com disciplina. Que tal escolher o próximo objetivo?</p>
            </div>
            <Button size="sm" variant="ghost" onClick={onDismissCelebration}>
              Fechar
            </Button>
          </div>
        )}

        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
            style={{ backgroundColor: `${goal.color}26`, boxShadow: `inset 0 0 0 1px ${goal.color}55` }}
          >
            {goal.icon || '🎯'}
          </span>
          <div className="min-w-0 flex-1">
            <h3 id={headingId} className="truncate font-semibold text-slate-900 dark:text-slate-100">
              {goal.name}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone={track.tone}>{track.label}</Badge>
              {!done && goal.priority === 'alta' && <Badge tone="warning">Prioridade alta</Badge>}
              {!done && goal.priority === 'baixa' && <Badge>Prioridade {PRIORITY_LABELS.baixa.toLowerCase()}</Badge>}
            </div>
          </div>
          <div className="-mr-1 flex shrink-0 items-center">
            <IconButton label={`Editar meta ${goal.name}`} size="sm" onClick={() => onEdit(goal)}>
              <Pencil size={16} aria-hidden />
            </IconButton>
            {goal.status !== 'concluida' && (
              <IconButton
                label={paused ? `Retomar meta ${goal.name}` : `Pausar meta ${goal.name}`}
                size="sm"
                onClick={() => onTogglePause(goal)}
              >
                {paused ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />}
              </IconButton>
            )}
            <IconButton label={`Excluir meta ${goal.name}`} size="sm" variant="danger" onClick={() => onDelete(goal)}>
              <Trash2 size={16} aria-hidden />
            </IconButton>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              <Money value={progress.saved} />{' '}
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                de <Money value={progress.targetAmount} />
              </span>
            </p>
            <span className="tabular text-sm font-semibold text-slate-600 dark:text-slate-300">
              {formatPercent(progress.percent)}
            </span>
          </div>
          <ProgressBar
            value={progress.percent}
            tone={done ? 'positive' : paused ? 'neutral' : 'brand'}
            label={`Progresso da meta ${goal.name}`}
          />
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {!done && (
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Falta</dt>
              <dd className="font-semibold">
                <Money value={progress.remaining} />
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Prazo</dt>
            <dd className="font-semibold">
              {progress.targetDate ? (
                <>
                  {formatDateBR(progress.targetDate)}
                  {!done && progress.monthsLeft !== null && progress.monthsLeft > 0 && (
                    <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                      em {plural(progress.monthsLeft, 'mês', 'meses')}
                    </span>
                  )}
                </>
              ) : (
                'Não definido'
              )}
            </dd>
          </div>
          {!done && progress.requiredMonthly !== null && (
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Aporte mensal necessário</dt>
              <dd className="font-semibold">
                <Money value={progress.requiredMonthly} />
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Média de aportes</dt>
            <dd className="font-semibold">
              <Money value={progress.averageMonthlyContribution} />
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">/mês</span>
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-slate-500 dark:text-slate-400">
              {done ? 'Concluída em' : 'Previsão de conclusão'}
            </dt>
            <dd className="font-semibold">
              {progress.projectedCompletionDate
                ? done
                  ? formatDateBR(progress.projectedCompletionDate)
                  : formatMonthLong(monthKey(progress.projectedCompletionDate))
                : 'Sem previsão — faça aportes para estimar'}
            </dd>
          </div>
        </dl>

        {account && (
          <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Link2 size={14} aria-hidden /> Guardado em {account.icon} {account.name}
          </p>
        )}

        {!paused && <Tip progress={progress} />}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            icon={<Plus size={14} aria-hidden />}
            onClick={() => onContribute(goal, 'aporte')}
            aria-label={`Aportar em ${goal.name}`}
          >
            Aportar
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Minus size={14} aria-hidden />}
            disabled={progress.saved <= 0}
            onClick={() => onContribute(goal, 'resgate')}
            aria-label={`Resgatar de ${goal.name}`}
          >
            Resgatar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            aria-expanded={showHistory}
            aria-controls={historyId}
            icon={showHistory ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
            onClick={() => setShowHistory((v) => !v)}
          >
            Histórico ({history.length})
          </Button>
        </div>

        {showHistory && (
          <div id={historyId}>
            {history.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum aporte registrado ainda.</p>
            ) : (
              <ul
                aria-label={`Histórico de aportes de ${goal.name}`}
                className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800"
              >
                {history.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 dark:text-slate-100">
                        {c.amount >= 0 ? 'Aporte' : 'Resgate'} · {formatDateBR(c.date)}
                      </p>
                      {(c.note || c.transactionId) && (
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {c.note}
                          {c.note && c.transactionId && ' · '}
                          {c.transactionId && 'com lançamento na conta'}
                        </p>
                      )}
                    </div>
                    <Money value={c.amount} signed colored className="font-semibold" />
                    <IconButton
                      label={`Excluir ${c.amount >= 0 ? 'aporte' : 'resgate'} de ${formatDateBR(c.date)}`}
                      size="sm"
                      variant="danger"
                      onClick={() => onDeleteContribution(goal, c)}
                    >
                      <Trash2 size={14} aria-hidden />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </article>
    </Card>
  );
}
