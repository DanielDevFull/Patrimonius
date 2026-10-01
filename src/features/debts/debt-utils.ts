/**
 * Regras puras da tela de Dívidas (validação de formulários, alertas, plano de quitação).
 */
import { annualToMonthlyRate, type PayoffStrategy, type StrategyComparison } from '@/analytics';
import { addMonths, daysInMonth, isISODate, makeISO, parseISO } from '@/domain/dates';
import type { Cents, Debt, DebtPayment, DebtType, ID, ISODate } from '@/domain/types';
import {
  monthShortFrom,
  parsePercent,
  parsePositiveInt,
  rateToInput,
} from '@/features/simulators/shared/format';

/** A partir desta taxa (% a.m.) os juros são considerados altos. */
export const HIGH_INTEREST_PCT = 4;
/** Tipos de dívida com juros tipicamente altíssimos (rotativo do cartão, cheque especial). */
export const HIGH_INTEREST_TYPES: readonly DebtType[] = ['cartao', 'cheque_especial'];
/** Taxa mensal máxima aceita no formulário (proteção contra digitar a taxa anual no campo mensal). */
export const MAX_MONTHLY_RATE = 100;
/** Folga padrão do orçamento do plano de quitação sobre a soma dos mínimos (em %). */
export const DEFAULT_BUDGET_MARGIN_PCT = 10;

export function isHighInterest(debt: Pick<Debt, 'interestRate' | 'type'>): boolean {
  return debt.interestRate >= HIGH_INTEREST_PCT || HIGH_INTEREST_TYPES.includes(debt.type);
}

/** Próximo vencimento (hoje inclusive) para um dia de vencimento 1-31 (limitado ao último dia do mês). */
export function nextDueDate(today: ISODate, dueDay: number): ISODate {
  const { year, month, day } = parseISO(today);
  const thisMonth = Math.min(dueDay, daysInMonth(year, month));
  if (day <= thisMonth) return makeISO(year, month, thisMonth);
  return addMonths(makeISO(year, month, 1), 1, dueDay);
}

/** Pagamentos de uma dívida, do mais recente para o mais antigo. */
export function paymentsOf(debtId: ID, payments: DebtPayment[]): DebtPayment[] {
  return payments
    .filter((p) => p.debtId === debtId)
    .sort((a, b) =>
      a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date),
    );
}

/** Orçamento sugerido para o plano: mínimos + 10%, arredondado para cima em reais. null se não houver mínimos. */
export function defaultPayoffBudget(totalMinimum: Cents): Cents | null {
  if (totalMinimum <= 0) return null;
  // Aritmética inteira: (mínimos × 110) / (100 × 100 centavos), arredondado para cima em reais.
  return Math.ceil((totalMinimum * (100 + DEFAULT_BUDGET_MARGIN_PCT)) / 10_000) * 100;
}

/** Converte uma taxa anual digitada ('30' ou '30,5%') na mensal equivalente, pronta para o campo ('2,2104'). */
export function annualInputToMonthly(input: string): string | null {
  const annual = parsePercent(input);
  if (annual === null) return null;
  return rateToInput(Math.round(annualToMonthlyRate(annual) * 10_000) / 10_000);
}

/* ------------------------------------------------------------------ */
/* Formulário de dívida                                                */
/* ------------------------------------------------------------------ */

export interface DebtFormValues {
  name: string;
  creditor: string;
  type: DebtType;
  originalAmount: Cents | null;
  balance: Cents | null;
  balanceDate: string;
  rate: string;
  minimumPayment: Cents | null;
  dueDay: string;
  remainingInstallments: string;
  notes: string;
}

export type DebtFormField =
  | 'name'
  | 'originalAmount'
  | 'balance'
  | 'balanceDate'
  | 'rate'
  | 'minimumPayment'
  | 'dueDay'
  | 'remainingInstallments';

export type DebtFormErrors = Partial<Record<DebtFormField, string>>;

/** Ordem dos campos no formulário (para focar o primeiro erro). */
export const DEBT_FORM_ORDER: DebtFormField[] = [
  'name',
  'originalAmount',
  'balance',
  'balanceDate',
  'rate',
  'minimumPayment',
  'dueDay',
  'remainingInstallments',
];

export function validateDebtForm(v: DebtFormValues, today: ISODate): DebtFormErrors {
  const errors: DebtFormErrors = {};
  if (!v.name.trim()) errors.name = 'Informe um nome para a dívida.';
  if (v.originalAmount !== null && v.originalAmount < 0) errors.originalAmount = 'Valor inválido.';
  if (v.balance === null) errors.balance = 'Informe o saldo devedor atual.';
  else if (v.balance <= 0) errors.balance = 'O saldo devedor deve ser maior que zero.';
  if (!v.balanceDate) errors.balanceDate = 'Informe a data do saldo.';
  else if (!isISODate(v.balanceDate)) errors.balanceDate = 'Data inválida.';
  else if (v.balanceDate > today) errors.balanceDate = 'A data do saldo não pode estar no futuro.';
  const rate = parsePercent(v.rate);
  if (!v.rate.trim()) errors.rate = 'Informe os juros ao mês (use 0 se não houver juros).';
  else if (rate === null) errors.rate = 'Taxa inválida. Ex.: 2,5';
  else if (rate > MAX_MONTHLY_RATE) errors.rate = 'Taxa muito alta. Confira se não é a taxa ao ano.';
  if (v.minimumPayment !== null && v.minimumPayment < 0) errors.minimumPayment = 'Valor inválido.';
  if (v.dueDay.trim()) {
    const day = parsePositiveInt(v.dueDay);
    if (day === null || day > 31) errors.dueDay = 'Use um dia entre 1 e 31.';
  }
  if (v.remainingInstallments.trim()) {
    const n = parsePositiveInt(v.remainingInstallments);
    if (n === null || n > 1200) errors.remainingInstallments = 'Informe um número inteiro de parcelas.';
  }
  return errors;
}

/** Converte o formulário (já validado) nos campos da dívida. Valor original vazio = saldo informado. */
export function debtFormToFields(v: DebtFormValues): Omit<Debt, 'id' | 'createdAt' | 'updatedAt' | 'status'> {
  const balance = v.balance ?? 0;
  return {
    name: v.name.trim().replace(/\s+/g, ' '),
    creditor: v.creditor.trim().replace(/\s+/g, ' '),
    type: v.type,
    originalAmount: v.originalAmount ?? balance,
    balance,
    balanceDate: v.balanceDate,
    interestRate: parsePercent(v.rate) ?? 0,
    minimumPayment: v.minimumPayment ?? 0,
    dueDay: v.dueDay.trim() ? parsePositiveInt(v.dueDay) : null,
    remainingInstallments: v.remainingInstallments.trim() ? parsePositiveInt(v.remainingInstallments) : null,
    notes: v.notes.trim(),
  };
}

export function debtToFormValues(debt: Debt | null, today: ISODate): DebtFormValues {
  if (!debt) {
    return {
      name: '',
      creditor: '',
      type: 'emprestimo',
      originalAmount: null,
      balance: null,
      balanceDate: today,
      rate: '',
      minimumPayment: null,
      dueDay: '',
      remainingInstallments: '',
      notes: '',
    };
  }
  return {
    name: debt.name,
    creditor: debt.creditor,
    type: debt.type,
    originalAmount: debt.originalAmount,
    balance: debt.balance,
    balanceDate: debt.balanceDate,
    rate: rateToInput(debt.interestRate),
    minimumPayment: debt.minimumPayment,
    dueDay: debt.dueDay === null ? '' : String(debt.dueDay),
    remainingInstallments: debt.remainingInstallments === null ? '' : String(debt.remainingInstallments),
    notes: debt.notes,
  };
}

/* ------------------------------------------------------------------ */
/* Pagamento                                                           */
/* ------------------------------------------------------------------ */

export function validatePayment(
  amount: Cents | null,
  date: string,
  today: ISODate,
): { amount?: string; date?: string } {
  const errors: { amount?: string; date?: string } = {};
  if (amount === null || amount <= 0) errors.amount = 'Informe um valor maior que zero.';
  if (!date) errors.date = 'Informe a data do pagamento.';
  else if (!isISODate(date)) errors.date = 'Data inválida.';
  else if (date > today) errors.date = 'A data não pode estar no futuro.';
  return errors;
}

/* ------------------------------------------------------------------ */
/* Plano de quitação                                                   */
/* ------------------------------------------------------------------ */

export const STRATEGY_META: Record<PayoffStrategy, { name: string; tagline: string; description: string }> = {
  avalanche: {
    name: 'Avalanche',
    tagline: 'Maior juros primeiro',
    description: 'Paga o mínimo de todas e usa o que sobrar na dívida com a maior taxa de juros.',
  },
  snowball: {
    name: 'Bola de neve',
    tagline: 'Menor saldo primeiro',
    description: 'Paga o mínimo de todas e usa o que sobrar na dívida de menor saldo.',
  },
};

export type PayoffAdvice =
  /** Nenhuma estratégia quita: o orçamento não cobre os mínimos. */
  | { kind: 'inviavel_minimos'; shortfall: Cents }
  /** Nenhuma estratégia quita: os juros consomem o pagamento (ou levaria mais de 50 anos). */
  | { kind: 'inviavel_juros' }
  /** Só uma estratégia é viável. */
  | { kind: 'unica'; strategy: PayoffStrategy }
  /** Mesmo custo de juros (ex.: uma única dívida). */
  | { kind: 'empate'; singleDebt: boolean }
  /** Uma estratégia custa menos juros que a outra. */
  | {
      kind: 'economia';
      strategy: PayoffStrategy;
      savings: Cents;
      /** Meses a menos da recomendada em relação à outra (pode ser 0). */
      monthsSaved: number;
      /** Primeira dívida quitada pela bola de neve (a "vitória rápida"). */
      quickWin: { name: string; month: number } | null;
    };

export function payoffAdvice(
  cmp: StrategyComparison,
  budget: Cents,
  totalMinimum: Cents,
  debtCount: number,
): PayoffAdvice {
  const { avalanche, snowball } = cmp;
  if (!avalanche.feasible && !snowball.feasible) {
    if (budget < totalMinimum) return { kind: 'inviavel_minimos', shortfall: totalMinimum - budget };
    return { kind: 'inviavel_juros' };
  }
  if (avalanche.feasible !== snowball.feasible) return { kind: 'unica', strategy: cmp.recommended };
  if (cmp.interestSavings === 0) return { kind: 'empate', singleDebt: debtCount <= 1 };
  const strategy: PayoffStrategy = cmp.interestSavings > 0 ? 'avalanche' : 'snowball';
  const best = strategy === 'avalanche' ? avalanche : snowball;
  const other = strategy === 'avalanche' ? snowball : avalanche;
  const first = snowball.payoffOrder[0];
  return {
    kind: 'economia',
    strategy,
    savings: Math.abs(cmp.interestSavings),
    monthsSaved: Math.max(0, other.months - best.months),
    quickWin: first ? { name: first.name, month: first.month } : null,
  };
}

export interface PayoffChartRow {
  month: number;
  label: string;
  avalanche: Cents | null;
  snowball: Cents | null;
}

/** Junta as duas linhas do tempo (saldo total por mês). Depois do fim de cada plano, o valor é null (a linha termina). */
export function payoffChartRows(cmp: StrategyComparison, today: ISODate): PayoffChartRow[] {
  const length = Math.max(cmp.avalanche.timeline.length, cmp.snowball.timeline.length);
  return Array.from({ length }, (_, i) => ({
    month: i,
    label: monthShortFrom(today, i),
    avalanche: cmp.avalanche.timeline[i]?.totalBalance ?? null,
    snowball: cmp.snowball.timeline[i]?.totalBalance ?? null,
  }));
}

/** Índices para a tabela resumida: início, a cada 12 meses e o último mês. */
export function yearlyIndices(length: number): number[] {
  if (length <= 0) return [];
  const out: number[] = [];
  for (let i = 0; i < length; i += 12) out.push(i);
  if (out[out.length - 1] !== length - 1) out.push(length - 1);
  return out;
}
