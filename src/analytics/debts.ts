import { diffMonths, monthKey } from '@/domain/dates';
import type { Cents, Debt, DebtPayment, ISODate } from '@/domain/types';
import { compareDesc, compareRaw, compareText } from './internal/common';
import type {
  DebtItemOverview,
  DebtsOverview,
  PayoffDebtInput,
  PayoffPlan,
  PayoffStrategy,
  StrategyComparison,
} from './types';

/** Limite padrão de meses da simulação de quitação (50 anos). */
const DEFAULT_MAX_MONTHS = 600;

/** Juros de um mês sobre um saldo (taxa em % a.m.), arredondados ao centavo. */
function monthlyInterestOf(balance: Cents, monthlyRatePct: number): Cents {
  if (balance <= 0 || !(monthlyRatePct > 0)) return 0;
  return Math.round((balance * monthlyRatePct) / 100);
}

/**
 * Saldo devedor estimado, amortizando mês a mês a partir do saldo informado (`debt.balance` em `debt.balanceDate`):
 * percorre, em ordem cronológica, os pagamentos da dívida com date >= balanceDate (e date <= asOf, se informado);
 * antes de cada pagamento aplica os juros mensais (`interestRate` % a.m., arredondados ao centavo, como em
 * simulatePayoff) uma vez para cada virada de mês desde o pagamento anterior (ou desde balanceDate) e então desconta
 * o valor pago. Retorna max(0, saldo). Dívida 'quitada' retorna 0.
 *
 * Não depende de `today`: juros só são acumulados até o último pagamento considerado (o saldo exibido é o que restou
 * depois da última parcela, como no extrato). Sem juros, equivale a `balance - soma dos pagamentos`.
 * Pagamentos no mesmo mês do anterior não geram juros novos; empates de data seguem a criação e o id.
 */
export function debtCurrentBalance(debt: Debt, payments: DebtPayment[], asOf?: ISODate): Cents {
  if (debt.status === 'quitada') return 0;
  const own = payments
    .filter((p) => p.debtId === debt.id && p.date >= debt.balanceDate && (asOf === undefined || p.date <= asOf))
    .sort((a, b) => compareRaw(a.date, b.date) || compareRaw(a.createdAt, b.createdAt) || compareRaw(a.id, b.id));
  let balance = debt.balance;
  let ref = monthKey(debt.balanceDate);
  for (const p of own) {
    const month = monthKey(p.date);
    for (let i = diffMonths(ref, month); i > 0; i--) balance += monthlyInterestOf(balance, debt.interestRate);
    balance -= p.amount;
    ref = month;
  }
  return Math.max(0, balance);
}

/**
 * Valor que quita a dívida com um pagamento em `date`: o saldo estimado (debtCurrentBalance, ignorando o status)
 * mais os juros das viradas de mês entre o último pagamento registrado (ou balanceDate) e `date`.
 * Ex.: saldo de R$ 1.000,00 depois da parcela de setembro, 2% a.m. => quitar em outubro custa R$ 1.020,00.
 */
export function debtPayoffAmount(debt: Debt, payments: DebtPayment[], date: ISODate): Cents {
  const probe: DebtPayment = { id: '', debtId: debt.id, amount: 0, date, note: '', transactionId: null, createdAt: '' };
  return debtCurrentBalance({ ...debt, status: 'ativa' }, [...payments, probe]);
}

/**
 * Visão consolidada das dívidas (ver DebtsOverview).
 * - Cada item usa o saldo atual (todos os pagamentos registrados) e juros = round(saldo × taxa / 100).
 * - Totais consideram só dívidas com status 'ativa'; `totalMinimum` ignora as ativas que já estão com saldo 0.
 * - Ordem: ativas antes das quitadas; dentro de cada grupo, taxa desc, depois saldo desc e nome.
 */
export function debtsOverview(debts: Debt[], payments: DebtPayment[]): DebtsOverview {
  const paidByDebt = new Map<string, Cents>();
  for (const p of payments) paidByDebt.set(p.debtId, (paidByDebt.get(p.debtId) ?? 0) + p.amount);

  let totalBalance = 0;
  let totalMinimum = 0;
  let monthlyInterest = 0;
  let weightedSum = 0;
  const items: DebtItemOverview[] = debts.map((debt) => {
    const currentBalance = debtCurrentBalance(debt, payments);
    const interest = monthlyInterestOf(currentBalance, debt.interestRate);
    if (debt.status === 'ativa') {
      totalBalance += currentBalance;
      monthlyInterest += interest;
      weightedSum += currentBalance * debt.interestRate;
      if (currentBalance > 0) totalMinimum += Math.max(0, debt.minimumPayment);
    }
    const progress =
      debt.originalAmount > 0 ? Math.min(1, Math.max(0, 1 - currentBalance / debt.originalAmount)) : 0;
    return {
      debt,
      currentBalance,
      monthlyInterest: interest,
      paidTotal: paidByDebt.get(debt.id) ?? 0,
      progress,
    };
  });

  items.sort(
    (a, b) =>
      Number(a.debt.status !== 'ativa') - Number(b.debt.status !== 'ativa') ||
      compareDesc(a.debt.interestRate, b.debt.interestRate) ||
      b.currentBalance - a.currentBalance ||
      compareText(a.debt.name, b.debt.name),
  );

  return {
    totalBalance,
    totalMinimum,
    weightedRate: totalBalance > 0 ? weightedSum / totalBalance : 0,
    monthlyInterest,
    items,
  };
}

interface SimDebt {
  id: string;
  name: string;
  balance: Cents;
  rate: number;
  minimum: Cents;
  index: number;
  paidOff: boolean;
}

/** Ordem de ataque da sobra: avalanche = maior taxa; snowball = menor saldo inicial; empate = ordem de entrada. */
function attackOrder(debts: SimDebt[], strategy: PayoffStrategy): SimDebt[] {
  return [...debts].sort((a, b) =>
    strategy === 'avalanche'
      ? compareDesc(a.rate, b.rate) || a.index - b.index
      : a.balance - b.balance || a.index - b.index,
  );
}

/**
 * Distribui `budget` proporcionalmente aos valores devidos (`due`), em centavos inteiros.
 * Os centavos que sobram do arredondamento para baixo vão, um a um, para as primeiras dívidas da lista.
 */
function proportionalSplit(budget: Cents, due: Cents[]): Cents[] {
  const dueTotal = due.reduce((s, v) => s + v, 0);
  if (dueTotal <= 0) return due.map(() => 0);
  const shares = due.map((d) => Math.floor((budget * d) / dueTotal));
  let rest = budget - shares.reduce((s, v) => s + v, 0);
  for (let i = 0; i < shares.length && rest > 0; i++) {
    if (shares[i] < due[i]) {
      shares[i] += 1;
      rest -= 1;
    }
  }
  return shares;
}

/**
 * Simula a quitação mês a mês com um orçamento mensal FIXO para dívidas (`monthlyBudget`):
 * 1) juros: saldo += round(saldo * taxa/100); 2) paga o mínimo de cada dívida (limitado ao saldo);
 * 3) o que sobrar do orçamento vai para a dívida-alvo (avalanche: maior taxa; snowball: menor saldo; empate: ordem de entrada),
 *    repetindo para a próxima se a alvo zerar. Mínimos de dívidas quitadas ficam disponíveis (bola de neve natural).
 * Se monthlyBudget < soma dos mínimos, paga proporcionalmente aos mínimos e o plano é feasible=false.
 * Para em `maxMonths` (padrão 600) => feasible=false.
 *
 * Detalhes de implementação:
 * - Dívidas com saldo <= 0 são ignoradas (não aparecem em payoffOrder). Taxas negativas contam como 0.
 * - A ordem de ataque é definida no início (snowball usa o saldo inicial) e não muda durante a simulação.
 * - Os mínimos são verificados todo mês sobre o valor devido (mínimo limitado ao saldo após juros). Em um mês em que o
 *   orçamento não cobre esse total, ele é dividido proporcionalmente e o plano fica feasible=false — mas, se as dívidas
 *   ainda assim forem quitadas, `months` é o mês real da quitação.
 * - Se as dívidas nunca forem quitadas, months = maxMonths. A simulação para assim que fica matematicamente impossível
 *   quitar dentro do limite (saldo total > orçamento × meses restantes); a `timeline` termina nesse mês.
 * - Dívidas quitadas no mesmo mês aparecem em payoffOrder na ordem de ataque.
 */
export function simulatePayoff(
  debts: PayoffDebtInput[],
  monthlyBudget: Cents,
  strategy: PayoffStrategy,
  maxMonths: number = DEFAULT_MAX_MONTHS,
): PayoffPlan {
  const limit = Number.isFinite(maxMonths) ? Math.max(0, Math.floor(maxMonths)) : DEFAULT_MAX_MONTHS;
  const budget = Number.isFinite(monthlyBudget) ? Math.max(0, Math.floor(monthlyBudget)) : 0;
  const sims: SimDebt[] = debts
    .map((d, index) => ({
      id: d.id,
      name: d.name,
      balance: d.balance,
      rate: Number.isFinite(d.monthlyRatePct) ? Math.max(0, d.monthlyRatePct) : 0,
      minimum: Math.max(0, d.minimumPayment),
      index,
      paidOff: false,
    }))
    .filter((d) => d.balance > 0);
  const order = attackOrder(sims, strategy);

  let total = sims.reduce((s, d) => s + d.balance, 0);
  const timeline: PayoffPlan['timeline'] = [{ month: 0, totalBalance: total }];
  const payoffOrder: PayoffPlan['payoffOrder'] = [];
  let totalInterest = 0;
  let totalPaid = 0;
  let underfunded = false;
  let month = 0;

  while (total > 0 && month < limit) {
    month += 1;

    for (const d of order) {
      const interest = monthlyInterestOf(d.balance, d.rate);
      d.balance += interest;
      totalInterest += interest;
    }

    const due = order.map((d) => (d.balance > 0 ? Math.min(d.minimum, d.balance) : 0));
    const dueTotal = due.reduce((s, v) => s + v, 0);
    let available = budget;
    let payments = due;
    if (budget < dueTotal) {
      underfunded = true;
      payments = proportionalSplit(budget, due);
      available = 0;
    } else {
      available -= dueTotal;
    }
    order.forEach((d, i) => {
      d.balance -= payments[i];
      totalPaid += payments[i];
    });

    for (const d of order) {
      if (available <= 0) break;
      if (d.balance <= 0) continue;
      const pay = Math.min(available, d.balance);
      d.balance -= pay;
      available -= pay;
      totalPaid += pay;
    }

    for (const d of order) {
      if (!d.paidOff && d.balance <= 0) {
        d.paidOff = true;
        payoffOrder.push({ debtId: d.id, name: d.name, month });
      }
    }

    total = order.reduce((s, d) => s + Math.max(0, d.balance), 0);
    timeline.push({ month, totalBalance: total });
    if (total > budget * (limit - month)) break;
  }

  const finished = total <= 0;
  return {
    strategy,
    feasible: finished && !underfunded,
    months: finished ? month : limit,
    totalInterest,
    totalPaid,
    payoffOrder,
    timeline,
  };
}

/**
 * Roda as duas estratégias e recomenda a de menor custo de juros.
 * Se só uma delas for viável, ela é a recomendada; empate de juros => 'snowball'.
 */
export function compareStrategies(debts: PayoffDebtInput[], monthlyBudget: Cents): StrategyComparison {
  const avalanche = simulatePayoff(debts, monthlyBudget, 'avalanche');
  const snowball = simulatePayoff(debts, monthlyBudget, 'snowball');
  let recommended: PayoffStrategy;
  if (avalanche.feasible !== snowball.feasible) recommended = avalanche.feasible ? 'avalanche' : 'snowball';
  else recommended = avalanche.totalInterest < snowball.totalInterest ? 'avalanche' : 'snowball';
  return {
    avalanche,
    snowball,
    recommended,
    interestSavings: snowball.totalInterest - avalanche.totalInterest,
  };
}

/**
 * Converte dívidas ativas do domínio em entradas de simulação (saldo atual, taxa, mínimo).
 * Dívidas ativas já sem saldo são omitidas; a ordem de entrada é preservada.
 */
export function toPayoffInputs(debts: Debt[], payments: DebtPayment[]): PayoffDebtInput[] {
  const inputs: PayoffDebtInput[] = [];
  for (const debt of debts) {
    if (debt.status !== 'ativa') continue;
    const balance = debtCurrentBalance(debt, payments);
    if (balance <= 0) continue;
    inputs.push({
      id: debt.id,
      name: debt.name,
      balance,
      monthlyRatePct: debt.interestRate,
      minimumPayment: debt.minimumPayment,
    });
  }
  return inputs;
}
