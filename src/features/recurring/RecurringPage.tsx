import { Pause, Pencil, Play, Plus, Repeat, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { detectRecurringCandidates } from '@/analytics/recurring';
import type { RecurringCandidate } from '@/analytics/types';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Modal,
  Money,
  PageHeader,
  SegmentedControl,
  Spinner,
  StatCard,
  useConfirm,
  useToast,
} from '@/components/ui';
import { useFinanceData, useToday } from '@/db/hooks';
import { deleteRecurring, runRecurring, updateRecurring } from '@/db/repo';
import { formatDateBR, formatDateRelative, parseISO } from '@/domain/dates';
import { formatPercent } from '@/domain/money';
import { plural } from '@/domain/text';
import {
  FREQUENCY_LABELS,
  type Account,
  type Category,
  type ISODate,
  type RecurringRule,
} from '@/domain/types';
import { ActionsMenu } from '@/features/transactions/ActionsMenu';
import { RecurringFormModal, type RecurringFormInitial } from './RecurringFormModal';
import {
  isEnded,
  monthlyEquivalent,
  pendingByRule,
  recurringTotals,
  resumeNextDate,
  ruleNextDue,
  skipToCurrentMonth,
  type NextDue,
} from './recurring-utils';

type TypeFilter = 'todas' | 'despesa' | 'receita';

const FILTER_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'despesa', label: 'Despesas' },
  { value: 'receita', label: 'Receitas' },
];

interface FormState {
  rule: RecurringRule | null;
  initial?: RecurringFormInitial;
}

/** 'hoje', 'amanhã', 'ontem' ou 'DD/MM/AAAA'. */
function dueLabel(due: NextDue, today: ISODate): string {
  return formatDateRelative(due.date, today);
}

export default function RecurringPage() {
  const data = useFinanceData();
  const today = useToday();
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState<FormState | null>(null);
  const [deleting, setDeleting] = useState<RecurringRule | null>(null);
  const [filter, setFilter] = useState<TypeFilter>('todas');

  const pending = useMemo(() => pendingByRule(data?.transactions ?? []), [data]);
  const candidates = useMemo(() => (data ? detectRecurringCandidates(data, today) : []), [data, today]);
  const sortedRules = useMemo(() => {
    if (!data) return [];
    const rank = (r: RecurringRule) => (!r.active ? 2 : isEnded(r) ? 1 : 0);
    const dueOf = (r: RecurringRule) => ruleNextDue(r, pending, today)?.date ?? '9999-12-31';
    return [...data.recurring].sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (dueOf(a) < dueOf(b) ? -1 : dueOf(a) > dueOf(b) ? 1 : 0) ||
        a.description.localeCompare(b.description, 'pt-BR'),
    );
  }, [data, pending, today]);

  if (!data) return <Spinner />;

  const totals = recurringTotals(data.recurring);
  const accountsById = new Map(data.accounts.map((a) => [a.id, a]));
  const categoriesById = new Map(data.categories.map((c) => [c.id, c]));
  const visible = sortedRules.filter((r) => filter === 'todas' || r.type === filter);
  const fixedShare = totals.income > 0 ? totals.expense / totals.income : null;

  async function toggleActive(rule: RecurringRule) {
    try {
      if (rule.active) {
        await updateRecurring(rule.id, { active: false });
        toast('Recorrência pausada. Os lançamentos já gerados foram mantidos.');
      } else {
        await updateRecurring(rule.id, { active: true, nextDate: resumeNextDate(rule, today) });
        await runRecurring();
        toast('Recorrência reativada.');
      }
    } catch {
      toast('Não foi possível alterar a recorrência.', 'error');
    }
  }

  async function remove(rule: RecurringRule) {
    if ((pending.get(rule.id)?.length ?? 0) > 0) {
      setDeleting(rule);
      return;
    }
    const ok = await confirm({
      title: 'Excluir recorrência?',
      message: `“${rule.description}” deixará de gerar lançamentos. Os lançamentos já registrados continuam no histórico.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    await finishDelete(rule, false);
  }

  async function finishDelete(rule: RecurringRule, removePending: boolean) {
    setDeleting(null);
    try {
      await deleteRecurring(rule.id, removePending);
      toast(removePending ? 'Recorrência e lançamentos pendentes excluídos.' : 'Recorrência excluída.');
    } catch {
      toast('Não foi possível excluir a recorrência.', 'error');
    }
  }

  function registerCandidate(c: RecurringCandidate) {
    const account = accountsById.get(c.accountId);
    setForm({
      rule: null,
      initial: {
        type: c.type === 'receita' ? 'receita' : 'despesa',
        amount: c.amount,
        description: c.description,
        categoryId: c.categoryId,
        accountId: account && !account.archived ? account.id : null,
        frequency: c.frequency,
        startDate: skipToCurrentMonth(c.nextExpectedDate, c.frequency, parseISO(c.lastDate).day, today),
        autoGenerate: true,
      },
    });
  }

  return (
    <div>
      <PageHeader
        title="Recorrências"
        subtitle="Contas fixas, assinaturas e receitas que se repetem."
        actions={
          <Button icon={<Plus size={16} />} onClick={() => setForm({ rule: null })}>
            Nova recorrência
          </Button>
        }
      />

      <section aria-label="Totais mensais" className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Receitas recorrentes"
          tone="positive"
          value={<Money value={totals.income} className="text-emerald-700 dark:text-emerald-400" />}
          hint="Equivalente por mês"
        />
        <StatCard
          label="Custo fixo mensal"
          tone="negative"
          value={<Money value={totals.expense} className="text-rose-700 dark:text-rose-400" />}
          hint={
            fixedShare !== null
              ? `${formatPercent(fixedShare)} das receitas recorrentes`
              : 'Despesas recorrentes por mês'
          }
        />
        <StatCard
          label="Sobra recorrente"
          value={<Money value={totals.net} signed colored />}
          hint={`${plural(totals.activeCount, 'regra ativa', 'regras ativas')}${totals.pausedCount ? ` · ${totals.pausedCount} pausada${totals.pausedCount > 1 ? 's' : ''}` : ''}`}
        />
      </section>

      <Card className="mb-6">
        <CardHeader
          title="Suas recorrências"
          icon={<Repeat size={18} aria-hidden />}
          actions={
            data.recurring.length > 0 ? (
              <SegmentedControl
                aria-label="Filtrar recorrências"
                options={FILTER_OPTIONS}
                value={filter}
                onChange={setFilter}
              />
            ) : undefined
          }
          className="flex-wrap"
        />
        {data.recurring.length === 0 ? (
          <EmptyState
            icon={<Repeat size={36} aria-hidden />}
            title="Nenhuma recorrência cadastrada"
            description="Cadastre aluguel, assinaturas, salário e outras contas fixas: o Pat gera os lançamentos pendentes e prevê o seu mês."
            action={
              <Button icon={<Plus size={16} />} onClick={() => setForm({ rule: null })}>
                Cadastrar recorrência
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Nenhuma recorrência de {filter === 'despesa' ? 'despesa' : 'receita'}.
          </p>
        ) : (
          <ul className="-mx-2 divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                category={categoriesById.get(rule.categoryId)}
                account={accountsById.get(rule.accountId)}
                due={ruleNextDue(rule, pending, today)}
                today={today}
                onEdit={() => setForm({ rule })}
                onToggle={() => void toggleActive(rule)}
                onDelete={() => void remove(rule)}
              />
            ))}
          </ul>
        )}
      </Card>

      {candidates.length > 0 && (
        <Card>
          <CardHeader
            title="Detectamos possíveis recorrências"
            subtitle="Lançamentos que se repetem todo mês com valor parecido e ainda não estão cadastrados."
            icon={<Sparkles size={18} aria-hidden />}
          />
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {candidates.map((c) => (
              <CandidateRow
                key={c.key}
                candidate={c}
                category={c.categoryId ? categoriesById.get(c.categoryId) : undefined}
                onRegister={() => registerCandidate(c)}
              />
            ))}
          </ul>
        </Card>
      )}

      {form && (
        <RecurringFormModal
          rule={form.rule}
          initial={form.initial}
          data={data}
          today={today}
          onClose={() => setForm(null)}
        />
      )}
      <DeleteRecurringModal
        rule={deleting}
        pendingCount={deleting ? (pending.get(deleting.id)?.length ?? 0) : 0}
        onClose={() => setDeleting(null)}
        onConfirm={(rule, removePending) => void finishDelete(rule, removePending)}
      />
    </div>
  );
}

interface RuleRowProps {
  rule: RecurringRule;
  category: Category | undefined;
  account: Account | undefined;
  due: NextDue | null;
  today: ISODate;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

function RuleRow({ rule, category, account, due, today, onEdit, onToggle, onDelete }: RuleRowProps) {
  const ended = isEnded(rule);
  const signed = rule.type === 'receita' ? rule.amount : -rule.amount;
  const monthly = monthlyEquivalent(rule.amount, rule.frequency);
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        onClick={onEdit}
        title="Editar recorrência"
        className="flex min-w-0 flex-1 items-start gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
      >
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-lg"
          style={{ backgroundColor: `${category?.color ?? '#94a3b8'}26` }}
        >
          {category?.icon ?? '❔'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
            {rule.description}
          </span>
          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
            {category?.name ?? 'Sem categoria'} • {account?.name ?? 'Conta removida'} •{' '}
            {FREQUENCY_LABELS[rule.frequency]}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            {rule.active && due && <span>Próxima: {dueLabel(due, today)}</span>}
            {rule.active && !ended && <Badge tone="positive">Ativa</Badge>}
            {!rule.active && <Badge tone="neutral">Pausada</Badge>}
            {ended && <Badge tone="neutral">Encerrada</Badge>}
            {rule.autoGenerate && <Badge tone="info">Automática</Badge>}
            {due?.overdue && <Badge tone="negative">Atrasada</Badge>}
          </span>
        </span>
        <span className="shrink-0 text-right text-sm font-semibold">
          <Money value={signed} signed colored />
          {rule.frequency !== 'mensal' && (
            <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
              ≈ <Money value={monthly} />
              /mês
            </span>
          )}
        </span>
      </button>
      <ActionsMenu
        label={`Ações de ${rule.description}`}
        items={[
          { label: 'Editar', icon: <Pencil size={16} aria-hidden />, onSelect: onEdit },
          rule.active
            ? { label: 'Pausar', icon: <Pause size={16} aria-hidden />, onSelect: onToggle }
            : { label: 'Ativar', icon: <Play size={16} aria-hidden />, onSelect: onToggle },
          { label: 'Excluir', icon: <Trash2 size={16} aria-hidden />, onSelect: onDelete, danger: true },
        ]}
      />
    </li>
  );
}

function CandidateRow({
  candidate,
  category,
  onRegister,
}: {
  candidate: RecurringCandidate;
  category: Category | undefined;
  onRegister: () => void;
}) {
  const signed = candidate.type === 'receita' ? candidate.amount : -candidate.amount;
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full text-lg"
        style={{ backgroundColor: `${category?.color ?? '#94a3b8'}26` }}
      >
        {category?.icon ?? '❔'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
          {candidate.description}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {category?.name ?? 'Sem categoria'} • {plural(candidate.occurrences, 'ocorrência', 'ocorrências')} •
          última em {formatDateBR(candidate.lastDate)}
        </p>
      </div>
      <span className="text-sm font-semibold">
        <Money value={signed} signed colored />
      </span>
      <Button
        size="sm"
        variant="secondary"
        onClick={onRegister}
        aria-label={`Cadastrar ${candidate.description} como recorrência`}
      >
        Cadastrar
      </Button>
    </li>
  );
}

function DeleteRecurringModal({
  rule,
  pendingCount,
  onClose,
  onConfirm,
}: {
  rule: RecurringRule | null;
  pendingCount: number;
  onClose: () => void;
  onConfirm: (rule: RecurringRule, removePending: boolean) => void;
}) {
  return (
    <Modal
      open={!!rule}
      onClose={onClose}
      size="sm"
      title="Excluir recorrência?"
      description={rule ? `“${rule.description}” deixará de gerar lançamentos.` : undefined}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      }
    >
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        Ela tem {plural(pendingCount, 'lançamento pendente gerado', 'lançamentos pendentes gerados')}. O que
        fazer com {pendingCount === 1 ? 'ele' : 'eles'}? Lançamentos já pagos continuam no histórico.
      </p>
      <div className="flex flex-col gap-2">
        <Button variant="danger" fullWidth data-autofocus onClick={() => rule && onConfirm(rule, true)}>
          Excluir e remover pendentes
        </Button>
        <Button variant="secondary" fullWidth onClick={() => rule && onConfirm(rule, false)}>
          Excluir e manter pendentes
        </Button>
      </div>
    </Modal>
  );
}
