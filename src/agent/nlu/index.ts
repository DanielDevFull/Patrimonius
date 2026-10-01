import type { Account, Category, Cents, Goal, ISODate, Transaction } from '@/domain/types';
import type { ParsedIntent, Period } from '../types';

export interface NluContext {
  today: ISODate;
  categories: Category[];
  accounts: Account[];
  goals: Goal[];
  /** Histórico para melhorar a categorização (opcional). */
  transactions?: Transaction[];
}

/** Interpreta uma mensagem em pt-BR: intenção + entidades. Nunca lança exceção. */
export function parseMessage(text: string, ctx: NluContext): ParsedIntent {
  void text;
  void ctx;
  throw new Error('não implementado');
}

/** Extrai valor monetário: 'R$ 45,90', '45,90', '50 reais', '1.200', '1,5 mil', '2k', 'cem reais', 'mil e quinhentos'. */
export function extractAmount(text: string): { amount: Cents; match: string } | null {
  void text;
  throw new Error('não implementado');
}

/** Extrai uma data: 'hoje', 'ontem', 'anteontem', 'amanhã', 'dia 15', '15/09', '15/09/2026', 'segunda', 'sexta passada'. */
export function extractDate(text: string, today: ISODate): { date: ISODate; match: string } | null {
  void text;
  void today;
  throw new Error('não implementado');
}

/**
 * Extrai um período: 'hoje', 'ontem', 'esta semana', 'semana passada', 'este mês', 'mês passado',
 * 'em setembro', 'setembro de 2025', 'este ano', 'ano passado', 'últimos 3 meses', 'últimos 30 dias'.
 */
export function extractPeriod(text: string, today: ISODate): Period | null {
  void text;
  void today;
  throw new Error('não implementado');
}

/** Encontra a categoria citada no texto (nome, sinônimos, palavras-chave). `kind` restringe o tipo. */
export function matchCategory(
  text: string,
  categories: Category[],
  kind?: Category['kind'],
): { categoryId: string; confidence: number } | null {
  void text;
  void categories;
  void kind;
  throw new Error('não implementado');
}

/** Encontra a conta citada no texto (nome aproximado, tipo: 'cartão', 'poupança', 'carteira', 'dinheiro'). */
export function matchAccount(text: string, accounts: Account[]): { accountId: string; confidence: number } | null {
  void text;
  void accounts;
  throw new Error('não implementado');
}

/** Encontra a meta citada no texto (nome aproximado). */
export function matchGoal(text: string, goals: Goal[]): { goalId: string; confidence: number } | null {
  void text;
  void goals;
  throw new Error('não implementado');
}
