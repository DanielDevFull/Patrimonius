/** Contas digitadas no primeiro uso (rascunhos) e sua conversão para o modelo. */
import { ACCOUNT_TYPE_ICONS, COLOR_PALETTE } from '@/domain/defaults';
import type { Account, AccountType, Cents } from '@/domain/types';

export interface DraftAccount {
  key: string;
  name: string;
  type: AccountType;
  /** Saldo atual; para cartão de crédito é a fatura em aberto (digitada como positiva). */
  balance: Cents | null;
}

export const ACCOUNT_SUGGESTIONS: { name: string; type: AccountType }[] = [
  { name: 'Conta corrente', type: 'corrente' },
  { name: 'Carteira', type: 'carteira' },
  { name: 'Poupança', type: 'poupanca' },
  { name: 'Cartão de crédito', type: 'cartao_credito' },
];

export type NewAccountInput = Omit<Account, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Converte o rascunho em conta. Cartão de crédito: a fatura em aberto vira saldo NEGATIVO (contrato de Account).
 * `index` define a cor sugerida (paleta circular).
 */
export function draftToAccount(draft: DraftAccount, index: number): NewAccountInput {
  const balance = draft.balance ?? 0;
  return {
    name: draft.name.trim(),
    type: draft.type,
    initialBalance: draft.type === 'cartao_credito' ? -Math.abs(balance) : balance,
    color: COLOR_PALETTE[index % COLOR_PALETTE.length],
    icon: ACCOUNT_TYPE_ICONS[draft.type],
    archived: false,
    includeInNetWorth: true,
    creditLimit: null,
    closingDay: null,
    dueDay: null,
  };
}

/** Rascunhos que serão gravados (os sem nome são ignorados). */
export function validDrafts(drafts: DraftAccount[]): DraftAccount[] {
  return drafts.filter((d) => d.name.trim() !== '');
}
