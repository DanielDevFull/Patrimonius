import { ArrowLeftRight, ListPlus, Minus, Plus, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { monthSummary } from '@/analytics/summary';
import {
  Button,
  Card,
  EmptyState,
  Input,
  Money,
  MonthPicker,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  useConfirm,
  useToast,
} from '@/components/ui';
import { useFinanceData, useToday } from '@/db/hooks';
import { deleteTransaction, setTransactionStatus } from '@/db/repo';
import { formatMonthLong, monthKey } from '@/domain/dates';
import { plural } from '@/domain/text';
import type { Account, Category, ISODate, MonthKey, Transaction, TransactionType } from '@/domain/types';
import { DeleteInstallmentModal, type DeleteScope } from './DeleteInstallmentModal';
import {
  activeFilterCount,
  buildLookups,
  compareForList,
  dayLabel,
  EMPTY_FILTERS,
  filteredTotals,
  filterTransactions,
  groupByDay,
  type Lookups,
  type TransactionFilters,
} from './filters';
import { stripInstallmentSuffix } from './form-utils';
import { TransactionFormModal, type TransactionFormInitial } from './TransactionForm';
import { TransactionRow } from './TransactionRow';

/** Quantidade de linhas renderizadas por vez (dias inteiros; "Mostrar mais" carrega o restante). */
const PAGE_SIZE = 150;

const NEW_TYPES: readonly TransactionType[] = ['despesa', 'receita', 'transferencia'];

function isNewType(value: string | null): value is TransactionType {
  return value !== null && (NEW_TYPES as readonly string[]).includes(value);
}

interface FormState {
  transaction: Transaction | null;
  initial?: TransactionFormInitial;
}

interface Handlers {
  onEdit: (tx: Transaction) => void;
  onToggleStatus: (tx: Transaction) => void;
  onDuplicate: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}

export default function TransactionsPage() {
  const data = useFinanceData();
  const today = useToday();
  const toast = useToast();
  const confirm = useConfirm();
  const [month, setMonth] = useState<MonthKey>(() => monthKey(today));
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);
  const [form, setForm] = useState<FormState | null>(null);
  const [formSeq, setFormSeq] = useState(0);
  const [deleting, setDeleting] = useState<Transaction | null>(null);

  // ?novo=despesa|receita|transferencia abre o formulário (o parâmetro é removido em seguida).
  const [searchParams, setSearchParams] = useSearchParams();
  const novoParam = searchParams.get('novo');
  const [handledNovo, setHandledNovo] = useState<string | null>(null);
  if (novoParam !== handledNovo) {
    setHandledNovo(novoParam);
    if (isNewType(novoParam)) {
      setFormSeq((s) => s + 1);
      setForm({ transaction: null, initial: { type: novoParam } });
    }
  }
  useEffect(() => {
    if (novoParam === null) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('novo');
        return next;
      },
      { replace: true },
    );
  }, [novoParam, setSearchParams]);

  const openForm = useCallback((state: FormState) => {
    setFormSeq((s) => s + 1);
    setForm(state);
  }, []);

  const lookups = useMemo(() => (data ? buildLookups(data.accounts, data.categories) : null), [data]);
  const summary = useMemo(() => (data ? monthSummary(data.transactions, month) : null), [data, month]);
  const monthItems = useMemo(
    () => (data ? data.transactions.filter((t) => t.date.startsWith(month)) : []),
    [data, month],
  );
  const filtered = useMemo(
    () => (lookups ? filterTransactions(monthItems, month, filters, lookups).sort(compareForList) : []),
    [monthItems, month, filters, lookups],
  );
  const pendingCount = useMemo(() => monthItems.filter((t) => t.status === 'pendente').length, [monthItems]);

  const handlers = useMemo<Handlers>(
    () => ({
      onEdit: (tx) => openForm({ transaction: tx }),
      onDuplicate: (tx) =>
        openForm({
          transaction: null,
          initial: {
            type: tx.type,
            amount: tx.amount,
            description: stripInstallmentSuffix(tx.description),
            categoryId: tx.categoryId,
            accountId: tx.accountId,
            toAccountId: tx.toAccountId,
            notes: tx.notes,
            tags: tx.tags,
          },
        }),
      onToggleStatus: (tx) => {
        const next = tx.status === 'pago' ? 'pendente' : 'pago';
        void setTransactionStatus(tx.id, next).then(
          () =>
            toast(
              next === 'pendente'
                ? 'Marcado como pendente.'
                : tx.type === 'receita'
                  ? 'Marcado como recebido.'
                  : 'Marcado como pago.',
            ),
          () => toast('Não foi possível alterar a situação.', 'error'),
        );
      },
      onDelete: (tx) => {
        if (tx.installment) {
          setDeleting(tx);
          return;
        }
        void (async () => {
          const ok = await confirm({
            title: 'Excluir lançamento?',
            message: tx.recurringId
              ? `“${tx.description}” será excluído. A recorrência que o gerou continua ativa.`
              : `“${tx.description}” será excluído permanentemente.`,
            confirmLabel: 'Excluir',
            danger: true,
          });
          if (!ok) return;
          try {
            await deleteTransaction(tx.id);
            toast('Lançamento excluído.');
          } catch {
            toast('Não foi possível excluir o lançamento.', 'error');
          }
        })();
      },
    }),
    [confirm, openForm, toast],
  );

  async function confirmInstallmentDelete(scope: DeleteScope) {
    const tx = deleting;
    setDeleting(null);
    if (!tx?.installment || !data) return;
    const siblings = data.transactions.filter((t) => t.installment?.groupId === tx.installment!.groupId);
    const count =
      scope === 'one'
        ? 1
        : scope === 'group'
          ? siblings.length
          : siblings.filter((t) => t.installment!.number >= tx.installment!.number).length;
    try {
      await deleteTransaction(tx.id, scope);
      toast(count === 1 ? 'Parcela excluída.' : `${count} parcelas excluídas.`);
    } catch {
      toast('Não foi possível excluir as parcelas.', 'error');
    }
  }

  if (!data || !lookups || !summary) return <Spinner />;

  const filterCount = activeFilterCount(filters);
  const totals = filteredTotals(filtered);
  const hasAny = data.transactions.length > 0;
  const setFilter = <K extends keyof TransactionFilters>(key: K, value: TransactionFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  return (
    <div>
      <PageHeader
        title="Lançamentos"
        subtitle="Tudo o que entrou e saiu das suas contas, dia a dia."
        actions={
          <>
            <Button
              icon={<Minus size={16} />}
              onClick={() => openForm({ transaction: null, initial: { type: 'despesa' } })}
            >
              Nova despesa
            </Button>
            <Button
              variant="secondary"
              icon={<Plus size={16} />}
              onClick={() => openForm({ transaction: null, initial: { type: 'receita' } })}
            >
              Nova receita
            </Button>
            <Button
              variant="secondary"
              icon={<ArrowLeftRight size={16} />}
              onClick={() => openForm({ transaction: null, initial: { type: 'transferencia' } })}
            >
              Transferência
            </Button>
          </>
        }
      />

      {!hasAny ? (
        <Card>
          <EmptyState
            icon={<ListPlus size={40} aria-hidden />}
            title="Nenhum lançamento ainda"
            description="Registre sua primeira despesa ou receita. Quanto mais você registra, melhores ficam as análises e dicas do Pat."
            action={
              <Button
                icon={<Plus size={16} />}
                onClick={() => openForm({ transaction: null, initial: { type: 'despesa' } })}
              >
                Registrar primeiro lançamento
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="mb-4 flex justify-center sm:justify-start">
            <MonthPicker value={month} onChange={setMonth} />
          </div>

          <section aria-label="Resumo do mês" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Receitas"
              tone="positive"
              value={<Money value={summary.income} className="text-emerald-700 dark:text-emerald-400" />}
              hint={
                summary.pendingIncome > 0 ? (
                  <>
                    A receber: <Money value={summary.pendingIncome} />
                  </>
                ) : (
                  'Tudo recebido'
                )
              }
            />
            <StatCard
              label="Despesas"
              tone="negative"
              value={<Money value={summary.expense} className="text-rose-700 dark:text-rose-400" />}
              hint={
                summary.pendingExpense > 0 ? (
                  <>
                    A pagar: <Money value={summary.pendingExpense} />
                  </>
                ) : (
                  'Tudo pago'
                )
              }
            />
            <StatCard
              label="Saldo do mês"
              value={<Money value={summary.net} signed colored />}
              hint={summary.net >= 0 ? 'Receitas menos despesas' : 'Despesas maiores que receitas'}
            />
            <StatCard
              label="Pendentes"
              tone="warning"
              value={pendingCount}
              hint={
                pendingCount === 0
                  ? 'Nada pendente'
                  : plural(pendingCount, 'lançamento', 'lançamentos') + ' a confirmar'
              }
            />
          </section>

          <FiltersBar
            accounts={data.accounts}
            categories={data.categories}
            filters={filters}
            setFilter={setFilter}
          />

          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-slate-500 dark:text-slate-400">
            <span aria-live="polite">
              {plural(totals.count, 'lançamento', 'lançamentos')}
              {filterCount > 0 && (
                <>
                  {' · '}receitas <Money value={totals.income} /> · despesas <Money value={totals.expense} />
                </>
              )}
            </span>
            {filterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                icon={<X size={14} />}
                onClick={() => setFilters(EMPTY_FILTERS)}
              >
                Limpar filtros ({filterCount})
              </Button>
            )}
          </div>

          {monthItems.length === 0 ? (
            <Card>
              <EmptyState
                title={`Nenhum lançamento em ${formatMonthLong(month)}`}
                description="Use os botões acima para registrar uma despesa, receita ou transferência neste mês."
              />
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Search size={36} aria-hidden />}
                title="Nenhum lançamento encontrado"
                description="Nenhum lançamento deste mês corresponde aos filtros escolhidos."
                action={
                  <Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>
                    Limpar filtros
                  </Button>
                }
              />
            </Card>
          ) : (
            <TransactionList
              key={`${month}|${JSON.stringify(filters)}`}
              items={filtered}
              lookups={lookups}
              today={today}
              handlers={handlers}
            />
          )}
        </>
      )}

      <TransactionFormModal
        key={formSeq}
        open={!!form}
        transaction={form?.transaction ?? null}
        initial={form?.initial}
        onClose={() => setForm(null)}
      />
      <DeleteInstallmentModal
        transaction={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={(scope) => void confirmInstallmentDelete(scope)}
      />
    </div>
  );
}

interface FiltersBarProps {
  accounts: Account[];
  categories: Category[];
  filters: TransactionFilters;
  setFilter: <K extends keyof TransactionFilters>(key: K, value: TransactionFilters[K]) => void;
}

function FiltersBar({ accounts, categories, filters, setFilter }: FiltersBarProps) {
  const sortedAccounts = useMemo(
    () =>
      [...accounts].sort(
        (a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, 'pt-BR'),
      ),
    [accounts],
  );
  const byKind = useMemo(() => {
    const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return {
      despesa: sorted.filter((c) => c.kind === 'despesa'),
      receita: sorted.filter((c) => c.kind === 'receita'),
    };
  }, [categories]);

  return (
    <Card className="mb-4">
      <div className="relative">
        <Search
          size={16}
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-3 my-auto text-slate-400"
        />
        <Input
          type="search"
          aria-label="Buscar lançamentos"
          placeholder="Buscar por descrição, categoria, conta ou tag…"
          className="pl-9"
          value={filters.query}
          onChange={(e) => setFilter('query', e.target.value)}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Select
          aria-label="Filtrar por tipo"
          value={filters.type}
          onChange={(e) => setFilter('type', e.target.value as TransactionFilters['type'])}
        >
          <option value="todos">Todos os tipos</option>
          <option value="despesa">Despesas</option>
          <option value="receita">Receitas</option>
          <option value="transferencia">Transferências</option>
        </Select>
        <Select
          aria-label="Filtrar por situação"
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value as TransactionFilters['status'])}
        >
          <option value="todos">Todas as situações</option>
          <option value="pago">Pagos/recebidos</option>
          <option value="pendente">Pendentes</option>
        </Select>
        <Select
          aria-label="Filtrar por conta"
          value={filters.accountId}
          onChange={(e) => setFilter('accountId', e.target.value)}
        >
          <option value="todas">Todas as contas</option>
          {sortedAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.archived ? ' (arquivada)' : ''}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filtrar por categoria"
          value={filters.categoryId}
          onChange={(e) => setFilter('categoryId', e.target.value)}
        >
          <option value="todas">Todas as categorias</option>
          {(['despesa', 'receita'] as const).map((kind) => (
            <optgroup key={kind} label={kind === 'despesa' ? 'Despesas' : 'Receitas'}>
              {byKind[kind].map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                  {c.archived ? ' (arquivada)' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>
    </Card>
  );
}

interface TransactionListProps {
  items: Transaction[];
  lookups: Lookups;
  today: ISODate;
  handlers: Handlers;
}

/** Lista agrupada por dia. Renderiza dias inteiros até ~PAGE_SIZE linhas; "Mostrar mais" carrega o resto. */
function TransactionList({ items, lookups, today, handlers }: TransactionListProps) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const groups = useMemo(() => groupByDay(items), [items]);
  const visibleGroups = useMemo(() => {
    const result: typeof groups = [];
    let rows = 0;
    for (const g of groups) {
      if (rows >= limit) break;
      result.push(g);
      rows += g.transactions.length;
    }
    return result;
  }, [groups, limit]);
  const shownRows = visibleGroups.reduce((n, g) => n + g.transactions.length, 0);
  const remaining = items.length - shownRows;

  return (
    <div className="space-y-3">
      {visibleGroups.map((group) => {
        const headingId = `dia-${group.date}`;
        return (
          <Card key={group.date} className="p-2 sm:p-3">
            <section aria-labelledby={headingId}>
              <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-1">
                <h3
                  id={headingId}
                  className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >
                  {dayLabel(group.date, today)}
                </h3>
                <span className="text-xs font-semibold" aria-label="Saldo do dia">
                  <Money value={group.subtotal} signed colored />
                </span>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {group.transactions.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    category={tx.categoryId ? lookups.categories.get(tx.categoryId) : undefined}
                    account={lookups.accounts.get(tx.accountId)}
                    toAccount={tx.toAccountId ? lookups.accounts.get(tx.toAccountId) : undefined}
                    today={today}
                    onEdit={handlers.onEdit}
                    onToggleStatus={handlers.onToggleStatus}
                    onDuplicate={handlers.onDuplicate}
                    onDelete={handlers.onDelete}
                  />
                ))}
              </ul>
            </section>
          </Card>
        );
      })}
      {remaining > 0 && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            Mostrar mais ({remaining})
          </Button>
        </div>
      )}
    </div>
  );
}
