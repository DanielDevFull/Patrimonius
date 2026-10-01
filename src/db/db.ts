import Dexie, { type EntityTable } from 'dexie';
import type {
  Account,
  Asset,
  AssetValuation,
  Budget,
  Category,
  ChatMessage,
  Debt,
  DebtPayment,
  Goal,
  GoalContribution,
  RecurringRule,
  Settings,
  Transaction,
} from '@/domain/types';

/**
 * Banco de dados local (IndexedDB via Dexie). NENHUM dado sai do dispositivo.
 * Observação: IndexedDB não indexa booleanos/null — por isso campos como `archived` não são índices.
 */
export class PatrimoniusDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  recurring!: EntityTable<RecurringRule, 'id'>;
  budgets!: EntityTable<Budget, 'id'>;
  goals!: EntityTable<Goal, 'id'>;
  goalContributions!: EntityTable<GoalContribution, 'id'>;
  debts!: EntityTable<Debt, 'id'>;
  debtPayments!: EntityTable<DebtPayment, 'id'>;
  assets!: EntityTable<Asset, 'id'>;
  assetValuations!: EntityTable<AssetValuation, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  chat!: EntityTable<ChatMessage, 'id'>;

  constructor(name = 'patrimonius') {
    super(name);
    this.version(1).stores({
      accounts: 'id, type, name',
      categories: 'id, kind, name',
      transactions: 'id, date, type, status, accountId, toAccountId, categoryId, recurringId, installment.groupId',
      recurring: 'id, nextDate',
      budgets: 'id, categoryId, month, [categoryId+month]',
      goals: 'id, status',
      goalContributions: 'id, goalId, date',
      debts: 'id, status',
      debtPayments: 'id, debtId, date',
      assets: 'id, type',
      assetValuations: 'id, assetId, date',
      settings: 'id',
      chat: 'id, createdAt',
    });
  }
}

export const db = new PatrimoniusDB();

/** Nomes de todas as tabelas de dados (usado por backup/restauração). */
export const DATA_TABLES = [
  'accounts',
  'categories',
  'transactions',
  'recurring',
  'budgets',
  'goals',
  'goalContributions',
  'debts',
  'debtPayments',
  'assets',
  'assetValuations',
  'settings',
  'chat',
] as const;

export type DataTableName = (typeof DATA_TABLES)[number];
