import { beforeEach, describe, expect, it } from 'vitest';
import { endOfMonth, isISODate, monthKey } from '@/domain/dates';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { Account, FinanceData, Transaction } from '@/domain/types';
import { resetDb } from '@/test/render';
import { db } from './db';
import { buildDemoData, DEMO_ACCOUNT_IDS, DEMO_SALARY, loadDemoData } from './demo';
import { addAccount, addCategory, addChatMessage, loadFinanceData, updateSettings } from './repo';

const TODAY = '2026-10-01';

/** Saldo pago da conta (cálculo local, independente do módulo de análises). */
function balanceOf(account: Account, txs: Transaction[]): number {
  let total = account.initialBalance;
  for (const tx of txs) {
    if (tx.status !== 'pago') continue;
    if (tx.type === 'receita' && tx.accountId === account.id) total += tx.amount;
    if (tx.type === 'despesa' && tx.accountId === account.id) total -= tx.amount;
    if (tx.type === 'transferencia') {
      if (tx.accountId === account.id) total -= tx.amount;
      if (tx.toAccountId === account.id) total += tx.amount;
    }
  }
  return total;
}

function balances(data: Pick<FinanceData, 'accounts' | 'transactions'>): Record<string, number> {
  return Object.fromEntries(data.accounts.map((a) => [a.id, balanceOf(a, data.transactions)]));
}

/** Representação estável (sem ids aleatórios gerados por runRecurring) para comparar cargas. */
function snapshot(data: FinanceData) {
  const txs = data.transactions
    .map((t) => [t.date, t.type, t.description, t.amount, t.accountId, t.toAccountId, t.categoryId, t.status, t.recurringId].join('|'))
    .sort();
  return {
    txs,
    accounts: data.accounts.map((a) => a.id).sort(),
    recurring: data.recurring.map((r) => `${r.id}|${r.nextDate}`).sort(),
    budgets: data.budgets.length,
    goals: data.goals.map((g) => g.id).sort(),
    contributions: data.goalContributions.length,
    debts: data.debts.map((d) => `${d.id}|${d.remainingInstallments}`).sort(),
    payments: data.debtPayments.length,
    assets: data.assets.map((a) => `${a.id}|${a.value}`).sort(),
    valuations: data.assetValuations.length,
    categories: data.categories.length,
  };
}

describe('buildDemoData (pura)', () => {
  it('é determinística: a mesma data gera exatamente os mesmos registros', () => {
    expect(buildDemoData(TODAY)).toEqual(buildDemoData(TODAY));
  });

  it('gera ~6 meses de lançamentos válidos, sem NaN e sem datas futuras pagas', () => {
    const demo = buildDemoData(TODAY);
    expect(demo.transactions.length).toBeGreaterThan(150);
    const months = new Set(demo.transactions.filter((t) => t.status === 'pago').map((t) => monthKey(t.date)));
    expect([...months].sort()).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    for (const tx of demo.transactions) {
      expect(Number.isInteger(tx.amount) && tx.amount > 0).toBe(true);
      expect(isISODate(tx.date)).toBe(true);
      if (tx.status === 'pago') expect(tx.date <= TODAY).toBe(true);
      else expect(tx.date > TODAY).toBe(true);
      if (tx.type === 'transferencia') {
        expect(tx.categoryId).toBeNull();
        expect(tx.toAccountId).not.toBeNull();
        expect(tx.toAccountId).not.toBe(tx.accountId);
      } else {
        expect(tx.categoryId).not.toBeNull();
        expect(tx.toAccountId).toBeNull();
      }
    }
    for (const a of demo.assets) expect(Number.isInteger(a.value)).toBe(true);
    for (const v of demo.assetValuations) expect(Number.isInteger(v.value)).toBe(true);
  });

  it('mantém os meses passados estáveis quando o dia de hoje avança', () => {
    const early = buildDemoData('2026-10-05').transactions.filter((t) => t.date < '2026-10-01');
    const late = buildDemoData('2026-10-28').transactions.filter((t) => t.date < '2026-10-01');
    const key = (t: Transaction) => `${t.date}|${t.description}|${t.amount}`;
    expect(late.map(key).sort()).toEqual(early.map(key).sort());
  });

  it('parcelas somam o total da compra e as futuras ficam pendentes', () => {
    const demo = buildDemoData(TODAY);
    const tv = demo.transactions.filter((t) => t.installment?.groupId === 'demo-inst-tv');
    expect(tv).toHaveLength(10);
    expect(tv.reduce((s, t) => s + t.amount, 0)).toBe(359900);
    expect(tv.map((t) => t.installment?.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(tv.filter((t) => t.status === 'pendente').every((t) => t.date > TODAY)).toBe(true);
    expect(tv.some((t) => t.status === 'pendente')).toBe(true);
  });

  it('paga a fatura do cartão com transferência da conta corrente', () => {
    const demo = buildDemoData('2026-10-20');
    const bills = demo.transactions.filter((t) => t.description === 'Pagamento da fatura do cartão');
    expect(bills).toHaveLength(6);
    for (const b of bills) {
      expect(b.type).toBe('transferencia');
      expect(b.accountId).toBe(DEMO_ACCOUNT_IDS.corrente);
      expect(b.toAccountId).toBe(DEMO_ACCOUNT_IDS.cartao);
      expect(b.date.endsWith('-10')).toBe(true);
    }
  });

  it('deixa a fatura do mês como pendente quando ainda não venceu', () => {
    const demo = buildDemoData('2026-10-05');
    const bill = demo.transactions.find((t) => t.description === 'Pagamento da fatura do cartão' && t.date === '2026-10-10');
    expect(bill?.status).toBe('pendente');
  });

  it.each(['2026-10-01', '2026-10-09', '2026-10-31', '2026-02-28', '2027-01-04', '2028-03-15'])(
    'saldos plausíveis em %s',
    (today) => {
      const demo = buildDemoData(today);
      const b = balances(demo);
      expect(b[DEMO_ACCOUNT_IDS.corrente]).toBeGreaterThan(0);
      expect(b[DEMO_ACCOUNT_IDS.poupanca]).toBeGreaterThan(0);
      expect(b[DEMO_ACCOUNT_IDS.investimentos]).toBeGreaterThan(0);
      expect(b[DEMO_ACCOUNT_IDS.carteira]).toBeGreaterThanOrEqual(0);
      const card = demo.accounts.find((a) => a.id === DEMO_ACCOUNT_IDS.cartao)!;
      expect(b[card.id]).toBeLessThanOrEqual(0);
      expect(-b[card.id]).toBeLessThan(card.creditLimit!);
      for (const value of Object.values(b)) expect(Number.isFinite(value)).toBe(true);
    },
  );

  it('estoura o orçamento de restaurantes no mês corrente, mesmo no dia 1º', () => {
    for (const today of ['2026-10-01', '2026-10-20']) {
      const demo = buildDemoData(today);
      const budget = demo.budgets.find((b) => b.categoryId === CATEGORY_IDS.restaurantes)!;
      const spent = demo.transactions
        .filter((t) => t.type === 'despesa' && t.categoryId === CATEGORY_IDS.restaurantes && monthKey(t.date) === monthKey(today))
        .reduce((s, t) => s + t.amount, 0);
      expect(spent).toBeGreaterThan(budget.amount);
    }
  });

  it('cria 3 metas, 2 dívidas com juros mensais realistas e bens com avaliações mensais', () => {
    const demo = buildDemoData(TODAY);
    expect(demo.goals.map((g) => g.name)).toEqual(['Reserva de emergência', 'Viagem', 'Notebook']);
    const rates = Object.fromEntries(demo.debts.map((d) => [d.type, d.interestRate]));
    expect(rates.financiamento).toBeGreaterThan(1);
    expect(rates.financiamento).toBeLessThan(2);
    expect(rates.emprestimo).toBeGreaterThan(3);
    expect(rates.emprestimo).toBeLessThan(5);
    const car = demo.assets.find((a) => a.type === 'veiculo')!;
    const carVals = demo.assetValuations.filter((v) => v.assetId === car.id);
    expect(carVals).toHaveLength(6);
    expect(car.value).toBe(carVals[carVals.length - 1].value);
    expect(carVals[0].value).toBeGreaterThan(car.value);
  });
});

describe('loadDemoData (banco)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('apaga os dados atuais antes de carregar', async () => {
    await addAccount({
      name: 'Minha conta real',
      type: 'corrente',
      initialBalance: 100,
      color: '#000',
      icon: '🏦',
      archived: false,
      includeInNetWorth: true,
      creditLimit: null,
      closingDay: null,
      dueDay: null,
    });
    await addCategory({ name: 'Personalizada', kind: 'despesa', icon: '⭐', color: '#000', group: 'desejos', keywords: [], archived: false });
    await addChatMessage('user', 'oi');
    await loadDemoData(TODAY);
    const data = await loadFinanceData();
    expect(data.accounts.map((a) => a.name)).not.toContain('Minha conta real');
    expect(data.categories.map((c) => c.name)).not.toContain('Personalizada');
    expect(await db.chat.count()).toBe(0);
    expect(data.accounts).toHaveLength(5);
  });

  it('todas as referências (categorias, contas, metas, dívidas, bens, recorrências) são válidas', async () => {
    await loadDemoData(TODAY);
    const data = await loadFinanceData();
    const cats = new Set(data.categories.map((c) => c.id));
    const accs = new Set(data.accounts.map((a) => a.id));
    const rules = new Set(data.recurring.map((r) => r.id));
    const txIds = new Set(data.transactions.map((t) => t.id));
    for (const tx of data.transactions) {
      expect(accs.has(tx.accountId)).toBe(true);
      if (tx.toAccountId) expect(accs.has(tx.toAccountId)).toBe(true);
      if (tx.categoryId) expect(cats.has(tx.categoryId)).toBe(true);
      if (tx.recurringId) expect(rules.has(tx.recurringId)).toBe(true);
    }
    for (const r of data.recurring) {
      expect(cats.has(r.categoryId)).toBe(true);
      expect(accs.has(r.accountId)).toBe(true);
    }
    for (const b of data.budgets) expect(cats.has(b.categoryId)).toBe(true);
    const goals = new Set(data.goals.map((g) => g.id));
    for (const g of data.goals) if (g.accountId) expect(accs.has(g.accountId)).toBe(true);
    for (const c of data.goalContributions) {
      expect(goals.has(c.goalId)).toBe(true);
      if (c.transactionId) expect(txIds.has(c.transactionId)).toBe(true);
    }
    const debts = new Set(data.debts.map((d) => d.id));
    for (const p of data.debtPayments) {
      expect(debts.has(p.debtId)).toBe(true);
      expect(p.transactionId && txIds.has(p.transactionId)).toBe(true);
    }
    const assets = new Set(data.assets.map((a) => a.id));
    for (const v of data.assetValuations) expect(assets.has(v.assetId)).toBe(true);
  });

  it('define nome "Você" se vazio, conclui o primeiro uso e usa o salário como renda estimada', async () => {
    await updateSettings({ userName: '   ', onboardingDone: false, monthlyIncomeEstimate: null });
    await loadDemoData(TODAY);
    const s = await db.settings.get('settings');
    expect(s?.userName).toBe('Você');
    expect(s?.onboardingDone).toBe(true);
    expect(s?.monthlyIncomeEstimate).toBe(DEMO_SALARY);
  });

  it('preserva as preferências já informadas pelo usuário', async () => {
    await updateSettings({ userName: 'Ana', theme: 'dark', agentName: 'Lia', monthlyIncomeEstimate: 500000, savingsRateTarget: 30 });
    await loadDemoData(TODAY);
    const s = await db.settings.get('settings');
    expect(s).toMatchObject({ userName: 'Ana', theme: 'dark', agentName: 'Lia', monthlyIncomeEstimate: 500000, savingsRateTarget: 30 });
  });

  it('gera as recorrências pendentes do resto do mês e avança as regras', async () => {
    await loadDemoData(TODAY);
    const data = await loadFinanceData();
    expect(data.recurring).toHaveLength(5);
    expect(data.recurring.every((r) => r.nextDate > endOfMonth(monthKey(TODAY)))).toBe(true);
    const pendingSalary = data.transactions.filter((t) => t.recurringId === 'demo-rec-salario' && t.status === 'pendente');
    expect(pendingSalary.map((t) => t.date)).toEqual(['2026-10-05']);
    // Nenhuma ocorrência duplicada.
    const keys = data.transactions.filter((t) => t.recurringId).map((t) => `${t.recurringId}|${t.date}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('é idempotente: carregar duas vezes produz os mesmos dados', async () => {
    await loadDemoData(TODAY);
    const first = snapshot(await loadFinanceData());
    await loadDemoData(TODAY);
    const second = snapshot(await loadFinanceData());
    expect(second).toEqual(first);
  });

  it('conta corrente termina positiva e nenhum saldo é NaN', async () => {
    await loadDemoData(TODAY);
    const data = await loadFinanceData();
    const b = balances(data);
    expect(b[DEMO_ACCOUNT_IDS.corrente]).toBeGreaterThan(0);
    for (const value of Object.values(b)) expect(Number.isNaN(value)).toBe(false);
  });
});
