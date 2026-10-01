/**
 * Fábricas de dados para testes. Use-as em vez de montar objetos à mão.
 * Ex.: const data = makeData({ accounts: [makeAccount({ initialBalance: 100000 })], transactions: [...] })
 */
import { buildDefaultCategories, buildDefaultSettings } from '@/domain/defaults';
import type {
  Account,
  Asset,
  AssetValuation,
  Budget,
  Debt,
  DebtPayment,
  FinanceData,
  Goal,
  GoalContribution,
  RecurringRule,
  Transaction,
} from '@/domain/types';

export const TEST_NOW = '2026-10-01T12:00:00.000Z';
let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

export function makeAccount(p: Partial<Account> = {}): Account {
  return {
    id: nextId('acc'),
    name: 'Conta corrente',
    type: 'corrente',
    initialBalance: 0,
    color: '#0f766e',
    icon: '🏦',
    archived: false,
    includeInNetWorth: true,
    creditLimit: null,
    closingDay: null,
    dueDay: null,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    ...p,
  };
}

export function makeTransaction(p: Partial<Transaction> & Pick<Transaction, 'accountId'>): Transaction {
  return {
    id: nextId('tx'),
    type: 'despesa',
    amount: 1000,
    date: '2026-10-01',
    description: 'Lançamento',
    categoryId: 'cat-mercado',
    toAccountId: null,
    status: 'pago',
    notes: '',
    tags: [],
    recurringId: null,
    installment: null,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    ...p,
  };
}

export function makeRecurring(p: Partial<RecurringRule> & Pick<RecurringRule, 'accountId'>): RecurringRule {
  return {
    id: nextId('rec'),
    type: 'despesa',
    amount: 5000,
    description: 'Assinatura',
    categoryId: 'cat-assinaturas',
    frequency: 'mensal',
    startDate: '2026-10-05',
    endDate: null,
    nextDate: '2026-10-05',
    autoGenerate: true,
    active: true,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    ...p,
  };
}

export function makeBudget(p: Partial<Budget> & Pick<Budget, 'categoryId' | 'amount'>): Budget {
  return { id: nextId('bud'), month: null, createdAt: TEST_NOW, updatedAt: TEST_NOW, ...p };
}

export function makeGoal(p: Partial<Goal> = {}): Goal {
  return {
    id: nextId('goal'),
    name: 'Viagem',
    targetAmount: 1000000,
    targetDate: '2027-06-30',
    icon: '✈️',
    color: '#2563eb',
    priority: 'media',
    status: 'ativa',
    accountId: null,
    notes: '',
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    ...p,
  };
}

export function makeContribution(p: Partial<GoalContribution> & Pick<GoalContribution, 'goalId'>): GoalContribution {
  return {
    id: nextId('contrib'),
    amount: 10000,
    date: '2026-10-01',
    note: '',
    transactionId: null,
    createdAt: TEST_NOW,
    ...p,
  };
}

export function makeDebt(p: Partial<Debt> = {}): Debt {
  return {
    id: nextId('debt'),
    name: 'Empréstimo',
    creditor: 'Banco',
    type: 'emprestimo',
    originalAmount: 1000000,
    balance: 1000000,
    balanceDate: '2026-01-01',
    interestRate: 2,
    minimumPayment: 50000,
    dueDay: 10,
    remainingInstallments: null,
    status: 'ativa',
    notes: '',
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    ...p,
  };
}

export function makeDebtPayment(p: Partial<DebtPayment> & Pick<DebtPayment, 'debtId'>): DebtPayment {
  return {
    id: nextId('pay'),
    amount: 50000,
    date: '2026-10-01',
    note: '',
    transactionId: null,
    createdAt: TEST_NOW,
    ...p,
  };
}

export function makeAsset(p: Partial<Asset> = {}): Asset {
  return {
    id: nextId('asset'),
    name: 'Carro',
    type: 'veiculo',
    value: 5000000,
    acquisitionValue: null,
    acquisitionDate: null,
    notes: '',
    archived: false,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    ...p,
  };
}

export function makeValuation(p: Partial<AssetValuation> & Pick<AssetValuation, 'assetId'>): AssetValuation {
  return { id: nextId('val'), value: 5000000, date: '2026-10-01', createdAt: TEST_NOW, ...p };
}

/** FinanceData completo com categorias e configurações padrão; sobrescreva o que precisar. */
export function makeData(p: Partial<FinanceData> = {}): FinanceData {
  return {
    accounts: [],
    categories: buildDefaultCategories(TEST_NOW),
    transactions: [],
    recurring: [],
    budgets: [],
    goals: [],
    goalContributions: [],
    debts: [],
    debtPayments: [],
    assets: [],
    assetValuations: [],
    settings: { ...buildDefaultSettings(TEST_NOW), onboardingDone: true },
    ...p,
  };
}
