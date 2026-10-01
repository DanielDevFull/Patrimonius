import { AlertTriangle, CalendarClock, Landmark, PartyPopper, Percent, Plus, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { debtsOverview, monthlyToAnnualRate, toPayoffInputs } from '@/analytics';
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
import { deleteDebt, deleteDebtPayment, updateDebt } from '@/db/repo';
import { formatDateBR } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import { plural } from '@/domain/text';
import type { Debt, DebtPayment, ID } from '@/domain/types';
import { formatRate } from '@/features/simulators/shared/format';
import { DebtCard } from './DebtCard';
import { DebtFormModal } from './DebtFormModal';
import { isHighInterest, paymentsOf } from './debt-utils';
import { PayoffPlanSection } from './PayoffPlanSection';
import { PaymentModal } from './PaymentModal';

export default function DebtsPage() {
  const data = useFinanceData();
  const today = useToday();
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState<{ debt: Debt | null } | null>(null);
  const [payingId, setPayingId] = useState<ID | null>(null);

  const view = useMemo(() => {
    if (!data) return null;
    const overview = debtsOverview(data.debts, data.debtPayments);
    const inputs = toPayoffInputs(data.debts, data.debtPayments);
    const active = overview.items.filter((i) => i.debt.status === 'ativa');
    const paid = overview.items.filter((i) => i.debt.status !== 'ativa');
    const highInterest = active.filter((i) => i.currentBalance > 0 && isHighInterest(i.debt));
    return { overview, inputs, active, paid, highInterest };
  }, [data]);

  if (!data || !view) return <Spinner />;
  const { overview, inputs, active, paid, highInterest } = view;
  const paying = payingId ? overview.items.find((i) => i.debt.id === payingId) : undefined;

  async function toggleStatus(debt: Debt) {
    if (debt.status === 'ativa') {
      const item = overview.items.find((i) => i.debt.id === debt.id);
      const remaining = item?.currentBalance ?? 0;
      const ok = await confirm({
        title: `Marcar “${debt.name}” como quitada?`,
        message:
          remaining > 0
            ? `O saldo restante de ${formatBRL(remaining)} deixa de contar nas suas dívidas e no patrimônio. Se ainda falta pagar, registre um pagamento em vez disso.`
            : 'Ela sai do plano de quitação e do total devido.',
        confirmLabel: 'Marcar como quitada',
      });
      if (!ok) return;
      try {
        await updateDebt(debt.id, { status: 'quitada' });
        toast(`🎉 “${debt.name}” quitada!`, 'success');
      } catch {
        toast('Não foi possível alterar a dívida.', 'error');
      }
      return;
    }
    try {
      await updateDebt(debt.id, { status: 'ativa' });
      toast('Dívida reaberta. Confira o saldo devedor.', 'info');
    } catch {
      toast('Não foi possível alterar a dívida.', 'error');
    }
  }

  async function removeDebt(debt: Debt) {
    const count = data?.debtPayments.filter((p) => p.debtId === debt.id).length ?? 0;
    const ok = await confirm({
      title: `Excluir a dívida “${debt.name}”?`,
      message:
        count > 0
          ? `O histórico de ${plural(count, 'pagamento', 'pagamentos')} será apagado. Despesas já lançadas nas suas contas não são alteradas.`
          : 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteDebt(debt.id);
      toast('Dívida excluída.');
    } catch {
      toast('Não foi possível excluir a dívida.', 'error');
    }
  }

  async function removePayment(debt: Debt, payment: DebtPayment) {
    const ok = await confirm({
      title: `Excluir o pagamento de ${formatDateBR(payment.date)}?`,
      message: payment.transactionId
        ? `A despesa de ${formatBRL(payment.amount)} lançada na conta também será excluída, e o saldo de “${debt.name}” volta a subir.`
        : `O saldo de “${debt.name}” volta a subir ${formatBRL(payment.amount)}.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteDebtPayment(payment.id, true);
      toast('Pagamento excluído.');
    } catch {
      toast('Não foi possível excluir o pagamento.', 'error');
    }
  }

  const renderCards = (items: typeof active) => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <DebtCard
          key={item.debt.id}
          item={item}
          history={paymentsOf(item.debt.id, data.debtPayments)}
          today={today}
          onPay={(d) => setPayingId(d.id)}
          onEdit={(d) => setForm({ debt: d })}
          onDelete={(d) => void removeDebt(d)}
          onToggleStatus={(d) => void toggleStatus(d)}
          onDeletePayment={(d, p) => void removePayment(d, p)}
        />
      ))}
    </div>
  );

  const newButton = (
    <Button icon={<Plus size={16} aria-hidden />} onClick={() => setForm({ debt: null })}>
      Nova dívida
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Dívidas"
        subtitle="Saiba quanto você deve, quanto paga de juros e qual o caminho mais rápido para quitar tudo."
        actions={data.debts.length > 0 ? newButton : undefined}
      />

      {data.debts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Landmark size={40} aria-hidden />}
            title="Nenhuma dívida cadastrada"
            description="Cadastre empréstimos, financiamentos, cartão parcelado ou dívidas com pessoas. Eu calculo os juros, acompanho os pagamentos e monto um plano para você sair do vermelho."
            action={
              <Button icon={<Plus size={16} aria-hidden />} onClick={() => setForm({ debt: null })}>
                Cadastrar dívida
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <section aria-label="Resumo das dívidas" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatCard
              label="Total devido"
              tone="negative"
              icon={<Landmark size={20} aria-hidden />}
              value={<Money value={overview.totalBalance} />}
              hint={plural(
                active.filter((i) => i.currentBalance > 0).length,
                'dívida ativa',
                'dívidas ativas',
              )}
            />
            <StatCard
              label="Juros estimados por mês"
              tone="warning"
              icon={<TrendingUp size={20} aria-hidden />}
              value={<Money value={overview.monthlyInterest} />}
              hint={
                <>
                  ≈ <Money value={overview.monthlyInterest * 12} /> em um ano
                </>
              }
            />
            <StatCard
              label="Parcelas mínimas"
              icon={<CalendarClock size={20} aria-hidden />}
              value={<Money value={overview.totalMinimum} />}
              hint="Por mês, somando as dívidas ativas"
            />
            <StatCard
              label="Taxa média ponderada"
              tone="brand"
              icon={<Percent size={20} aria-hidden />}
              value={`${formatRate(overview.weightedRate)} a.m.`}
              hint={`≈ ${formatRate(monthlyToAnnualRate(overview.weightedRate))} ao ano`}
            />
          </section>

          {highInterest.length > 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
              <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" />
              <span>
                {highInterest.length === 1
                  ? `“${highInterest[0].debt.name}” tem juros altos.`
                  : `${highInterest.length} dívidas têm juros altos.`}{' '}
                Cartão de crédito, cheque especial e taxas a partir de 4% ao mês crescem muito rápido:
                priorize quitá-las ou troque por um empréstimo mais barato (consignado, portabilidade).
              </span>
            </p>
          )}

          {active.length > 0 && (
            <section aria-label="Dívidas ativas" className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Ativas ({active.length})
              </h2>
              {renderCards(active)}
            </section>
          )}

          {inputs.length > 0 ? (
            <PayoffPlanSection
              inputs={inputs}
              totalMinimum={overview.totalMinimum}
              monthlyInterest={overview.monthlyInterest}
              today={today}
              hideValues={data.settings.hideValues}
            />
          ) : (
            <Card>
              <EmptyState
                icon={<PartyPopper size={36} aria-hidden />}
                title="Nenhuma dívida em aberto"
                description="Parabéns! Use o que você pagava em parcelas para montar sua reserva de emergência ou investir."
              />
            </Card>
          )}

          {paid.length > 0 && (
            <section aria-label="Dívidas quitadas" className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Quitadas ({paid.length})
              </h2>
              {renderCards(paid)}
            </section>
          )}
        </div>
      )}

      {form && (
        <DebtFormModal
          debt={form.debt}
          payments={data.debtPayments}
          today={today}
          onClose={() => setForm(null)}
        />
      )}
      {paying && (
        <PaymentModal
          debt={paying.debt}
          currentBalance={paying.currentBalance}
          accounts={data.accounts}
          today={today}
          onClose={() => setPayingId(null)}
          onDone={({ paidOff }) => {
            if (paidOff) toast(`🎉 Parabéns! Você quitou “${paying.debt.name}”!`, 'success');
          }}
        />
      )}
    </div>
  );
}
