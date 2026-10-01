import { ArrowLeftRight, Eye, EyeOff, Plus, Wallet } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  Money,
  PageHeader,
  Spinner,
  StatCard,
  useConfirm,
  useToast,
} from '@/components/ui';
import { useFinanceData, useToday } from '@/db/hooks';
import { deleteOrArchiveAccount, updateAccount } from '@/db/repo';
import type { Account, Cents } from '@/domain/types';
import { activeAccounts } from '@/features/transactions/form-utils';
import { TransactionFormModal, type TransactionFormInitial } from '@/features/transactions/TransactionForm';
import { AccountCard } from './AccountCard';
import { AccountFormModal } from './AccountFormModal';
import { accountsTotals, balancesView, sortAccountsForDisplay } from './account-utils';
import { AdjustBalanceModal } from './AdjustBalanceModal';

export default function AccountsPage() {
  const data = useFinanceData();
  const today = useToday();
  const toast = useToast();
  const confirm = useConfirm();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<{ account: Account | null } | null>(null);
  const [adjusting, setAdjusting] = useState<Account | null>(null);
  const [txForm, setTxForm] = useState<TransactionFormInitial | null>(null);
  const [txSeq, setTxSeq] = useState(0);

  const balances = useMemo(
    () => (data ? balancesView(data.accounts, data.transactions, today) : null),
    [data, today],
  );
  const openTransfer = useCallback((initial: TransactionFormInitial) => {
    setTxSeq((s) => s + 1);
    setTxForm(initial);
  }, []);

  if (!data || !balances) return <Spinner />;

  const totals = accountsTotals(data.accounts, balances);
  const sorted = sortAccountsForDisplay(data.accounts);
  const active = sorted.filter((a) => !a.archived);
  const archived = sorted.filter((a) => a.archived);

  function payInvoice(card: Account, amount: Cents) {
    const source = activeAccounts(data?.accounts ?? []).find(
      (a) => a.id !== card.id && a.type !== 'cartao_credito' && a.type !== 'investimento',
    );
    openTransfer({
      type: 'transferencia',
      amount,
      toAccountId: card.id,
      accountId: source?.id ?? null,
      description: `Pagamento da fatura ${card.name}`,
      date: today,
    });
  }

  async function remove(account: Account) {
    const ok = await confirm({
      title: `Excluir a conta “${account.name}”?`,
      message:
        'Se houver lançamentos ou recorrências ligados a ela, a conta será arquivada em vez de excluída, para preservar o seu histórico.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    try {
      const result = await deleteOrArchiveAccount(account.id);
      if (result === 'deleted') toast('Conta excluída.');
      else
        toast(
          'A conta tem lançamentos ou recorrências, por isso foi arquivada (o histórico foi mantido). Veja em “Mostrar arquivadas”.',
          'info',
        );
    } catch {
      toast('Não foi possível excluir a conta.', 'error');
    }
  }

  async function restore(account: Account) {
    try {
      await updateAccount(account.id, { archived: false });
      toast('Conta reativada.');
    } catch {
      toast('Não foi possível reativar a conta.', 'error');
    }
  }

  const cardHandlers = {
    today,
    onEdit: (account: Account) => setEditing({ account }),
    onAdjust: (account: Account) => setAdjusting(account),
    onTransfer: (account: Account) => openTransfer({ type: 'transferencia', accountId: account.id }),
    onPayInvoice: payInvoice,
    onDelete: (account: Account) => void remove(account),
    onRestore: (account: Account) => void restore(account),
  };

  return (
    <div>
      <PageHeader
        title="Contas"
        subtitle="Bancos, carteira, investimentos e cartões de crédito."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<ArrowLeftRight size={16} />}
              disabled={active.length < 2}
              title={active.length < 2 ? 'Cadastre pelo menos duas contas para transferir.' : undefined}
              onClick={() => openTransfer({ type: 'transferencia' })}
            >
              Transferir
            </Button>
            <Button icon={<Plus size={16} />} onClick={() => setEditing({ account: null })}>
              Nova conta
            </Button>
          </>
        }
      />

      {data.accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Wallet size={40} aria-hidden />}
            title="Nenhuma conta cadastrada"
            description="Cadastre suas contas bancárias, carteira e cartões para acompanhar seus saldos. Tudo fica só neste dispositivo."
            action={
              <Button icon={<Plus size={16} />} onClick={() => setEditing({ account: null })}>
                Cadastrar primeira conta
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <section aria-label="Totais" className="mb-6 grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Total em contas"
              tone="brand"
              value={<Money value={totals.current} colored={totals.current < 0} />}
              hint="Patrimônio em contas (saldo atual)"
            />
            <StatCard
              label="Previsto no fim do mês"
              value={<Money value={totals.projected} colored={totals.projected < 0} />}
              hint="Incluindo lançamentos pendentes"
            />
            <StatCard
              label="Faturas de cartão"
              tone={totals.cardInvoices > 0 ? 'negative' : 'neutral'}
              value={<Money value={totals.cardInvoices} />}
              hint={totals.cardInvoices > 0 ? 'Já descontadas do total' : 'Nenhuma fatura em aberto'}
            />
          </section>

          {active.length === 0 ? (
            <Card className="mb-4">
              <EmptyState
                title="Todas as contas estão arquivadas"
                description="Reative uma conta ou cadastre uma nova para registrar lançamentos."
              />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {active.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  balance={balances[account.id]}
                  {...cardHandlers}
                />
              ))}
            </div>
          )}

          {archived.length > 0 && (
            <div className="mt-6">
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={showArchived}
                icon={showArchived ? <EyeOff size={14} /> : <Eye size={14} />}
                onClick={() => setShowArchived((v) => !v)}
              >
                {showArchived ? 'Ocultar arquivadas' : `Mostrar arquivadas (${archived.length})`}
              </Button>
              {showArchived && (
                <section aria-label="Contas arquivadas" className="mt-3">
                  <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                    Contas arquivadas não aparecem nos formulários nem nos totais, mas o histórico continua
                    nos relatórios.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {archived.map((account) => (
                      <AccountCard
                        key={account.id}
                        account={account}
                        balance={balances[account.id]}
                        {...cardHandlers}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}

      {editing && (
        <AccountFormModal
          account={editing.account}
          accounts={data.accounts}
          onClose={() => setEditing(null)}
        />
      )}
      {adjusting && (
        <AdjustBalanceModal
          account={adjusting}
          currentBalance={balances[adjusting.id]?.current ?? adjusting.initialBalance}
          categories={data.categories}
          today={today}
          onClose={() => setAdjusting(null)}
        />
      )}
      <TransactionFormModal
        key={txSeq}
        open={txForm !== null}
        initial={txForm ?? undefined}
        onClose={() => setTxForm(null)}
      />
    </div>
  );
}
