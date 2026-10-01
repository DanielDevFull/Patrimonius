/**
 * Camada de acesso a dados (CRUD + operações de negócio). Toda escrita no banco deve passar por aqui.
 * Todas as funções são assíncronas e operam SOMENTE no IndexedDB local.
 */
import { materializeRecurring } from '@/analytics/recurring';
import { addMonths, endOfMonth, monthKey, nowTimestamp, todayISO } from '@/domain/dates';
import { CATEGORY_IDS, buildDefaultCategories, buildDefaultSettings } from '@/domain/defaults';
import { splitCents } from '@/domain/money';
import type {
  Account,
  Asset,
  AssetValuation,
  Budget,
  Category,
  ChatMessage,
  Debt,
  DebtPayment,
  FinanceData,
  Goal,
  GoalContribution,
  ID,
  ISODate,
  MonthKey,
  RecurringRule,
  Settings,
  Transaction,
} from '@/domain/types';
import { db } from './db';

export function newId(): ID {
  return crypto.randomUUID();
}

type EntityInput<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;
type Patch<T> = Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>;

/* ------------------------------------------------------------------ */
/* Inicialização                                                       */
/* ------------------------------------------------------------------ */

/**
 * Categorias usadas diretamente pelo código (aportes, pagamentos de dívida, substituição ao excluir).
 * Não podem ser excluídas e são recriadas se faltarem (ex.: backup importado sem elas).
 */
export const SYSTEM_CATEGORY_IDS: readonly ID[] = [
  CATEGORY_IDS.outrosDespesa,
  CATEGORY_IDS.outrosReceita,
  CATEGORY_IDS.investimentos,
  CATEGORY_IDS.dividas,
];

/** Garante categorias padrão (e as de sistema) e registro de configurações. Idempotente. */
export async function ensureInitialized(): Promise<void> {
  await db.transaction('rw', db.categories, db.settings, async () => {
    const now = nowTimestamp();
    if ((await db.categories.count()) === 0) {
      await db.categories.bulkAdd(buildDefaultCategories(now));
    } else {
      const existing = new Set(await db.categories.toCollection().primaryKeys());
      const missing = buildDefaultCategories(now).filter(
        (c) => SYSTEM_CATEGORY_IDS.includes(c.id) && !existing.has(c.id),
      );
      if (missing.length) await db.categories.bulkAdd(missing);
    }
    if (!(await db.settings.get('settings'))) {
      await db.settings.add(buildDefaultSettings(now));
    }
  });
}

/** Carrega todos os dados financeiros (entrada das análises e do agente). */
export async function loadFinanceData(): Promise<FinanceData> {
  const [
    accounts,
    categories,
    transactions,
    recurring,
    budgets,
    goals,
    goalContributions,
    debts,
    debtPayments,
    assets,
    assetValuations,
    settings,
  ] = await Promise.all([
    db.accounts.toArray(),
    db.categories.toArray(),
    db.transactions.toArray(),
    db.recurring.toArray(),
    db.budgets.toArray(),
    db.goals.toArray(),
    db.goalContributions.toArray(),
    db.debts.toArray(),
    db.debtPayments.toArray(),
    db.assets.toArray(),
    db.assetValuations.toArray(),
    db.settings.get('settings'),
  ]);
  return {
    accounts,
    categories,
    transactions,
    recurring,
    budgets,
    goals,
    goalContributions,
    debts,
    debtPayments,
    assets,
    assetValuations,
    settings: settings ?? buildDefaultSettings(nowTimestamp()),
  };
}

/* ------------------------------------------------------------------ */
/* Configurações                                                       */
/* ------------------------------------------------------------------ */

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings');
  if (s) return s;
  const fresh = buildDefaultSettings(nowTimestamp());
  await db.settings.put(fresh);
  return fresh;
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id' | 'createdAt'>>): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, ...patch, id: 'settings', updatedAt: nowTimestamp() });
}

/** Dispensa um insight até o fim do mês corrente. */
export async function dismissInsight(insightId: string, month: MonthKey): Promise<void> {
  const current = await getSettings();
  await updateSettings({ dismissedInsights: { ...current.dismissedInsights, [insightId]: month } });
}

/* ------------------------------------------------------------------ */
/* Contas                                                              */
/* ------------------------------------------------------------------ */

export async function addAccount(input: EntityInput<Account>): Promise<Account> {
  const now = nowTimestamp();
  const account: Account = { ...input, id: newId(), createdAt: now, updatedAt: now };
  await db.accounts.add(account);
  return account;
}

export async function updateAccount(id: ID, patch: Patch<Account>): Promise<void> {
  await db.accounts.update(id, { ...patch, updatedAt: nowTimestamp() });
}

/** Quantos lançamentos referenciam a conta (origem ou destino). */
export async function countAccountUsage(id: ID): Promise<number> {
  const [a, b] = await Promise.all([
    db.transactions.where('accountId').equals(id).count(),
    db.transactions.where('toAccountId').equals(id).count(),
  ]);
  return a + b;
}

/**
 * Exclui a conta se não houver lançamentos vinculados; caso contrário, arquiva.
 * Retorna 'deleted' ou 'archived'.
 */
export async function deleteOrArchiveAccount(id: ID): Promise<'deleted' | 'archived'> {
  const usage = await countAccountUsage(id);
  const recurringUsage = await db.recurring.filter((r) => r.accountId === id).count();
  if (usage === 0 && recurringUsage === 0) {
    await db.accounts.delete(id);
    return 'deleted';
  }
  await updateAccount(id, { archived: true });
  return 'archived';
}

/* ------------------------------------------------------------------ */
/* Categorias                                                          */
/* ------------------------------------------------------------------ */

export async function addCategory(input: EntityInput<Category>): Promise<Category> {
  const now = nowTimestamp();
  const category: Category = { ...input, id: newId(), createdAt: now, updatedAt: now };
  await db.categories.add(category);
  return category;
}

export async function updateCategory(id: ID, patch: Patch<Category>): Promise<void> {
  await db.categories.update(id, { ...patch, updatedAt: nowTimestamp() });
}

/**
 * Exclui uma categoria movendo seus lançamentos e recorrências para `replacementId`
 * (padrão: "Outras despesas"/"Outras receitas") e removendo seus orçamentos.
 */
export async function deleteCategory(id: ID, replacementId?: ID): Promise<void> {
  const category = await db.categories.get(id);
  if (!category) return;
  if (SYSTEM_CATEGORY_IDS.includes(id)) {
    throw new Error('Esta categoria é usada pelo app e não pode ser excluída. Você pode arquivá-la.');
  }
  const fallback =
    replacementId ?? (category.kind === 'despesa' ? CATEGORY_IDS.outrosDespesa : CATEGORY_IDS.outrosReceita);
  if (fallback === id) throw new Error('Escolha outra categoria para receber os lançamentos.');
  const replacement = await db.categories.get(fallback);
  if (!replacement) throw new Error('Categoria substituta não encontrada.');
  if (replacement.kind !== category.kind) throw new Error('A categoria substituta precisa ser do mesmo tipo.');
  await db.transaction('rw', [db.categories, db.transactions, db.recurring, db.budgets], async () => {
    const now = nowTimestamp();
    await db.transactions.where('categoryId').equals(id).modify({ categoryId: fallback, updatedAt: now });
    await db.recurring.filter((r) => r.categoryId === id).modify({ categoryId: fallback, updatedAt: now });
    await db.budgets.where('categoryId').equals(id).delete();
    await db.categories.delete(id);
  });
}

/* ------------------------------------------------------------------ */
/* Lançamentos                                                         */
/* ------------------------------------------------------------------ */

export interface NewTransactionInput {
  type: Transaction['type'];
  /** Valor TOTAL (para parcelado, é dividido entre as parcelas). */
  amount: number;
  date: ISODate;
  description: string;
  categoryId: ID | null;
  accountId: ID;
  toAccountId?: ID | null;
  status?: Transaction['status'];
  notes?: string;
  tags?: string[];
  recurringId?: ID | null;
  /** Número de parcelas (>= 1). Parcelas mensais a partir de `date`. */
  installments?: number;
}

/**
 * Cria um lançamento (ou N parcelas mensais). Retorna os lançamentos criados.
 * Parcelas: descrição recebe sufixo " (i/N)", valores divididos sem perder centavos;
 * a 1ª parcela usa o status informado; as seguintes com data futura ficam 'pendente'.
 */
export async function addTransaction(input: NewTransactionInput): Promise<Transaction[]> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error('Valor deve ser maior que zero.');
  if (input.type === 'transferencia') {
    if (!input.toAccountId) throw new Error('Transferência precisa de conta de destino.');
    if (input.toAccountId === input.accountId) throw new Error('Contas de origem e destino devem ser diferentes.');
  }
  const now = nowTimestamp();
  const total = Math.max(1, Math.floor(input.installments ?? 1));
  const base: Omit<Transaction, 'id' | 'amount' | 'date' | 'description' | 'installment' | 'status'> = {
    type: input.type,
    categoryId: input.type === 'transferencia' ? null : input.categoryId,
    accountId: input.accountId,
    toAccountId: input.type === 'transferencia' ? (input.toAccountId ?? null) : null,
    notes: input.notes ?? '',
    tags: input.tags ?? [],
    recurringId: input.recurringId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  const status = input.status ?? 'pago';
  let txs: Transaction[];
  if (total === 1) {
    txs = [
      {
        ...base,
        id: newId(),
        amount: input.amount,
        date: input.date,
        description: input.description.trim(),
        status,
        installment: null,
      },
    ];
  } else {
    const groupId = newId();
    const parts = splitCents(input.amount, total);
    const today = todayISO();
    const anchorDay = Number(input.date.slice(8, 10));
    txs = parts.map((amount, i) => {
      const date = i === 0 ? input.date : addMonths(input.date, i, anchorDay);
      return {
        ...base,
        id: newId(),
        amount,
        date,
        description: `${input.description.trim()} (${i + 1}/${total})`,
        status: i === 0 ? status : date > today ? 'pendente' : status,
        installment: { groupId, number: i + 1, total },
      };
    });
  }
  await db.transactions.bulkAdd(txs);
  return txs;
}

export async function updateTransaction(id: ID, patch: Patch<Transaction>): Promise<void> {
  if (patch.amount !== undefined && (!Number.isInteger(patch.amount) || patch.amount <= 0)) {
    throw new Error('Valor deve ser maior que zero.');
  }
  const next: Patch<Transaction> = { ...patch };
  if (patch.type && patch.type !== 'transferencia') next.toAccountId = null;
  if (patch.type === 'transferencia') next.categoryId = null;
  await db.transactions.update(id, { ...next, updatedAt: nowTimestamp() });
}

export async function setTransactionStatus(id: ID, status: Transaction['status']): Promise<void> {
  await updateTransaction(id, { status });
}

/**
 * Exclui um lançamento. scope 'group' exclui todas as parcelas da mesma compra;
 * 'future' exclui esta e as parcelas seguintes.
 */
export async function deleteTransaction(id: ID, scope: 'one' | 'group' | 'future' = 'one'): Promise<void> {
  const tx = await db.transactions.get(id);
  if (!tx) return;
  await db.transaction('rw', [db.transactions, db.goalContributions, db.debtPayments], async () => {
    let ids: ID[] = [id];
    if (scope !== 'one' && tx.installment) {
      const siblings = await db.transactions.where('installment.groupId').equals(tx.installment.groupId).toArray();
      ids = siblings
        .filter((s) => scope === 'group' || (s.installment && s.installment.number >= tx.installment!.number))
        .map((s) => s.id);
    }
    await db.transactions.bulkDelete(ids);
    // Desvincula aportes/pagamentos que apontavam para os lançamentos removidos.
    await db.goalContributions.filter((c) => c.transactionId !== null && ids.includes(c.transactionId)).modify({
      transactionId: null,
    });
    await db.debtPayments.filter((p) => p.transactionId !== null && ids.includes(p.transactionId)).modify({
      transactionId: null,
    });
  });
}

/* ------------------------------------------------------------------ */
/* Recorrências                                                        */
/* ------------------------------------------------------------------ */

export async function addRecurring(input: Omit<EntityInput<RecurringRule>, 'nextDate'>): Promise<RecurringRule> {
  const now = nowTimestamp();
  const rule: RecurringRule = { ...input, nextDate: input.startDate, id: newId(), createdAt: now, updatedAt: now };
  await db.recurring.add(rule);
  await runRecurring();
  return (await db.recurring.get(rule.id)) ?? rule;
}

/** Lançamentos gerados por uma regra de recorrência (ordenados por data). */
export async function listRecurringTransactions(ruleId: ID): Promise<Transaction[]> {
  return db.transactions.where('recurringId').equals(ruleId).sortBy('date');
}

export async function updateRecurring(id: ID, patch: Patch<RecurringRule>): Promise<void> {
  await db.recurring.update(id, { ...patch, updatedAt: nowTimestamp() });
}

/** Exclui a regra. Se deletePending, remove também os lançamentos pendentes gerados por ela. */
export async function deleteRecurring(id: ID, deletePending = true): Promise<void> {
  await db.transaction('rw', db.recurring, db.transactions, async () => {
    if (deletePending) {
      await db.transactions
        .where('recurringId')
        .equals(id)
        .filter((t) => t.status === 'pendente')
        .delete();
    }
    await db.transactions.where('recurringId').equals(id).modify({ recurringId: null });
    await db.recurring.delete(id);
  });
}

/**
 * Gera os lançamentos pendentes das recorrências automáticas até o fim do mês corrente.
 * Chamado na inicialização do app e após criar/editar recorrências. Retorna quantos lançamentos foram criados.
 */
export async function runRecurring(today: ISODate = todayISO()): Promise<number> {
  return db.transaction('rw', db.recurring, db.transactions, async () => {
    const [rules, transactions] = await Promise.all([db.recurring.toArray(), db.transactions.toArray()]);
    const { newTransactions, updatedRules } = materializeRecurring(
      rules,
      transactions,
      endOfMonth(monthKey(today)),
      nowTimestamp(),
      newId,
    );
    if (newTransactions.length) await db.transactions.bulkAdd(newTransactions);
    if (updatedRules.length) await db.recurring.bulkPut(updatedRules);
    return newTransactions.length;
  });
}

/* ------------------------------------------------------------------ */
/* Orçamentos                                                          */
/* ------------------------------------------------------------------ */

/** Cria ou atualiza o orçamento de uma categoria (month null = padrão para todos os meses). */
export async function setBudget(categoryId: ID, amount: number, month: MonthKey | null): Promise<Budget> {
  if (!Number.isInteger(amount) || amount < 0) throw new Error('Valor de orçamento inválido.');
  const now = nowTimestamp();
  const existing = await db.budgets
    .where('categoryId')
    .equals(categoryId)
    .filter((b) => b.month === month)
    .first();
  if (existing) {
    const updated = { ...existing, amount, updatedAt: now };
    await db.budgets.put(updated);
    return updated;
  }
  const budget: Budget = { id: newId(), categoryId, amount, month, createdAt: now, updatedAt: now };
  await db.budgets.add(budget);
  return budget;
}

export async function deleteBudget(id: ID): Promise<void> {
  await db.budgets.delete(id);
}

/** Copia os orçamentos específicos de `from` para `to` (sobrescreve os de `to`). Retorna quantos foram copiados. */
export async function copyBudgets(from: MonthKey, to: MonthKey): Promise<number> {
  const source = await db.budgets.where('month').equals(from).toArray();
  for (const b of source) await setBudget(b.categoryId, b.amount, to);
  return source.length;
}

/* ------------------------------------------------------------------ */
/* Metas                                                               */
/* ------------------------------------------------------------------ */

export async function addGoal(input: EntityInput<Goal>): Promise<Goal> {
  const now = nowTimestamp();
  const goal: Goal = { ...input, id: newId(), createdAt: now, updatedAt: now };
  await db.goals.add(goal);
  return goal;
}

export async function updateGoal(id: ID, patch: Patch<Goal>): Promise<void> {
  await db.goals.update(id, { ...patch, updatedAt: nowTimestamp() });
}

export async function deleteGoal(id: ID): Promise<void> {
  await db.transaction('rw', db.goals, db.goalContributions, async () => {
    await db.goalContributions.where('goalId').equals(id).delete();
    await db.goals.delete(id);
  });
}

export interface ContributionInput {
  goalId: ID;
  /** Positivo = aporte, negativo = resgate. */
  amount: number;
  date: ISODate;
  note?: string;
  /**
   * Se informado, cria também um lançamento: transferência de `fromAccountId` para a conta da meta
   * (se a meta tiver conta e for diferente) ou despesa na categoria Investimentos e reserva.
   */
  fromAccountId?: ID | null;
}

/** Registra aporte/resgate e marca a meta como concluída quando atingir o alvo. */
export async function addGoalContribution(input: ContributionInput): Promise<GoalContribution> {
  if (!Number.isInteger(input.amount) || input.amount === 0) throw new Error('Valor inválido.');
  const goal = await db.goals.get(input.goalId);
  if (!goal) throw new Error('Meta não encontrada.');
  let transactionId: ID | null = null;
  if (input.fromAccountId && input.amount > 0) {
    const isTransfer = goal.accountId && goal.accountId !== input.fromAccountId;
    const [tx] = await addTransaction({
      type: isTransfer ? 'transferencia' : 'despesa',
      amount: input.amount,
      date: input.date,
      description: `Aporte: ${goal.name}`,
      categoryId: isTransfer ? null : CATEGORY_IDS.investimentos,
      accountId: input.fromAccountId,
      toAccountId: isTransfer ? goal.accountId : null,
      status: 'pago',
    });
    transactionId = tx.id;
  }
  const contribution: GoalContribution = {
    id: newId(),
    goalId: input.goalId,
    amount: input.amount,
    date: input.date,
    note: input.note ?? '',
    transactionId,
    createdAt: nowTimestamp(),
  };
  await db.goalContributions.add(contribution);
  await syncGoalStatus(goal.id);
  return contribution;
}

/** Remove um aporte (e, se deleteTransaction, o lançamento vinculado). */
export async function deleteGoalContribution(id: ID, alsoDeleteTransaction = false): Promise<void> {
  const c = await db.goalContributions.get(id);
  if (!c) return;
  if (alsoDeleteTransaction && c.transactionId) await db.transactions.delete(c.transactionId);
  await db.goalContributions.delete(id);
  await syncGoalStatus(c.goalId);
}

/** Ajusta 'ativa' <-> 'concluida' conforme o total guardado (não mexe em metas pausadas). */
export async function syncGoalStatus(goalId: ID): Promise<void> {
  const goal = await db.goals.get(goalId);
  if (!goal || goal.status === 'pausada') return;
  const all = await db.goalContributions.where('goalId').equals(goalId).toArray();
  const saved = all.reduce((sum, x) => sum + x.amount, 0);
  const next = saved >= goal.targetAmount ? 'concluida' : 'ativa';
  if (next !== goal.status) await updateGoal(goalId, { status: next });
}

/* ------------------------------------------------------------------ */
/* Dívidas                                                             */
/* ------------------------------------------------------------------ */

export async function addDebt(input: EntityInput<Debt>): Promise<Debt> {
  const now = nowTimestamp();
  const debt: Debt = { ...input, id: newId(), createdAt: now, updatedAt: now };
  await db.debts.add(debt);
  return debt;
}

/**
 * Atualiza a dívida. Se o saldo ou a data do saldo mudarem (e o status não vier explícito no patch),
 * o status é recalculado: saldo restante <= 0 => 'quitada', senão 'ativa'.
 */
export async function updateDebt(id: ID, patch: Patch<Debt>): Promise<void> {
  const next: Patch<Debt> = { ...patch };
  if ((patch.balance !== undefined || patch.balanceDate !== undefined) && patch.status === undefined) {
    const debt = await db.debts.get(id);
    if (debt) {
      const balance = patch.balance ?? debt.balance;
      const balanceDate = patch.balanceDate ?? debt.balanceDate;
      const payments = await db.debtPayments.where('debtId').equals(id).toArray();
      const paid = payments.filter((p) => p.date >= balanceDate).reduce((sum, p) => sum + p.amount, 0);
      next.status = balance - paid > 0 ? 'ativa' : 'quitada';
    }
  }
  await db.debts.update(id, { ...next, updatedAt: nowTimestamp() });
}

export async function deleteDebt(id: ID): Promise<void> {
  await db.transaction('rw', db.debts, db.debtPayments, async () => {
    await db.debtPayments.where('debtId').equals(id).delete();
    await db.debts.delete(id);
  });
}

export interface DebtPaymentInput {
  debtId: ID;
  amount: number;
  date: ISODate;
  note?: string;
  /** Se informado, cria uma despesa "Dívidas e empréstimos" nesta conta. */
  fromAccountId?: ID | null;
}

/** Registra pagamento; marca a dívida como quitada quando o saldo chegar a zero. */
export async function addDebtPayment(input: DebtPaymentInput): Promise<DebtPayment> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error('Valor deve ser maior que zero.');
  const debt = await db.debts.get(input.debtId);
  if (!debt) throw new Error('Dívida não encontrada.');
  let transactionId: ID | null = null;
  if (input.fromAccountId) {
    const [tx] = await addTransaction({
      type: 'despesa',
      amount: input.amount,
      date: input.date,
      description: `Pagamento: ${debt.name}`,
      categoryId: CATEGORY_IDS.dividas,
      accountId: input.fromAccountId,
      status: 'pago',
    });
    transactionId = tx.id;
  }
  const payment: DebtPayment = {
    id: newId(),
    debtId: input.debtId,
    amount: input.amount,
    date: input.date,
    note: input.note ?? '',
    transactionId,
    createdAt: nowTimestamp(),
  };
  await db.debtPayments.add(payment);
  const payments = await db.debtPayments.where('debtId').equals(debt.id).toArray();
  const paid = payments.filter((p) => p.date >= debt.balanceDate).reduce((s, p) => s + p.amount, 0);
  if (debt.status === 'ativa' && debt.balance - paid <= 0) await updateDebt(debt.id, { status: 'quitada' });
  return payment;
}

export async function deleteDebtPayment(id: ID, alsoDeleteTransaction = false): Promise<void> {
  const p = await db.debtPayments.get(id);
  if (!p) return;
  if (alsoDeleteTransaction && p.transactionId) await db.transactions.delete(p.transactionId);
  await db.debtPayments.delete(id);
  const debt = await db.debts.get(p.debtId);
  if (debt && debt.status === 'quitada') {
    const payments = await db.debtPayments.where('debtId').equals(debt.id).toArray();
    const paid = payments.filter((x) => x.date >= debt.balanceDate).reduce((s, x) => s + x.amount, 0);
    if (debt.balance - paid > 0) await updateDebt(debt.id, { status: 'ativa' });
  }
}

/* ------------------------------------------------------------------ */
/* Bens                                                                */
/* ------------------------------------------------------------------ */

/**
 * Cria um bem e registra a primeira avaliação em `valuationDate` (padrão: hoje).
 * Antes dela, o histórico de patrimônio usa acquisitionValue ?? value.
 */
export async function addAsset(input: EntityInput<Asset>, valuationDate: ISODate = todayISO()): Promise<Asset> {
  const now = nowTimestamp();
  const asset: Asset = { ...input, id: newId(), createdAt: now, updatedAt: now };
  await db.transaction('rw', db.assets, db.assetValuations, async () => {
    await db.assets.add(asset);
    await db.assetValuations.add({
      id: newId(),
      assetId: asset.id,
      value: asset.value,
      date: valuationDate,
      createdAt: now,
    });
  });
  return asset;
}

export async function updateAsset(id: ID, patch: Patch<Omit<Asset, 'value'>>): Promise<void> {
  await db.assets.update(id, { ...patch, updatedAt: nowTimestamp() });
}

/** Registra uma nova avaliação e atualiza o valor atual se for a mais recente. */
export async function revalueAsset(id: ID, value: number, date: ISODate = todayISO()): Promise<AssetValuation> {
  if (!Number.isInteger(value) || value < 0) throw new Error('Valor inválido.');
  const now = nowTimestamp();
  const valuation: AssetValuation = { id: newId(), assetId: id, value, date, createdAt: now };
  await db.transaction('rw', db.assets, db.assetValuations, async () => {
    await db.assetValuations.add(valuation);
    const all = await db.assetValuations.where('assetId').equals(id).toArray();
    const latest = all.reduce((a, b) => (b.date > a.date || (b.date === a.date && b.createdAt >= a.createdAt) ? b : a));
    await db.assets.update(id, { value: latest.value, updatedAt: now });
  });
  return valuation;
}

/** Exclui uma avaliação e recalcula o valor atual do bem pela avaliação mais recente restante. */
export async function deleteAssetValuation(id: ID): Promise<void> {
  await db.transaction('rw', db.assets, db.assetValuations, async () => {
    const valuation = await db.assetValuations.get(id);
    if (!valuation) return;
    await db.assetValuations.delete(id);
    const rest = await db.assetValuations.where('assetId').equals(valuation.assetId).toArray();
    if (!rest.length) return;
    const latest = rest.reduce((a, b) => (b.date > a.date || (b.date === a.date && b.createdAt >= a.createdAt) ? b : a));
    await db.assets.update(valuation.assetId, { value: latest.value, updatedAt: nowTimestamp() });
  });
}

export async function deleteAsset(id: ID): Promise<void> {
  await db.transaction('rw', db.assets, db.assetValuations, async () => {
    await db.assetValuations.where('assetId').equals(id).delete();
    await db.assets.delete(id);
  });
}

/* ------------------------------------------------------------------ */
/* Conversa com o agente                                               */
/* ------------------------------------------------------------------ */

let lastChatStamp = '';

/** Carimbo estritamente crescente (mensagens no mesmo milissegundo mantêm a ordem de criação). */
function nextChatStamp(): string {
  let stamp = nowTimestamp();
  if (stamp <= lastChatStamp) stamp = new Date(Date.parse(lastChatStamp) + 1).toISOString();
  lastChatStamp = stamp;
  return stamp;
}

export async function addChatMessage(role: ChatMessage['role'], text: string, payload: unknown = null): Promise<ChatMessage> {
  const msg: ChatMessage = { id: newId(), role, text, payload, createdAt: nextChatStamp() };
  await db.chat.add(msg);
  return msg;
}

/** Atualiza o payload/texto de uma mensagem (ex.: marcar uma ação proposta como executada). */
export async function updateChatMessage(id: ID, patch: Partial<Pick<ChatMessage, 'text' | 'payload'>>): Promise<void> {
  await db.chat.update(id, patch);
}

export async function clearChat(): Promise<void> {
  await db.chat.clear();
}
