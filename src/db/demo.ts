/**
 * Dados de exemplo ("modo demonstração"): ~6 meses de vida financeira fictícia de uma pessoa no Brasil,
 * para explorar o app e o agente sem digitar nada. Gerados localmente de forma DETERMINÍSTICA
 * (gerador pseudoaleatório com semente fixa por mês) a partir de `today`.
 */
import { nextOccurrence } from '@/analytics/recurring';
import { addMonths, daysInMonthKey, lastMonths, makeISO, monthKey, nowTimestamp, parseISO, weekday } from '@/domain/dates';
import { CATEGORY_IDS, buildDefaultCategories, buildDefaultSettings } from '@/domain/defaults';
import { splitCents } from '@/domain/money';
import type {
  Account,
  Asset,
  AssetValuation,
  Budget,
  Cents,
  Debt,
  DebtPayment,
  Frequency,
  Goal,
  GoalContribution,
  ID,
  ISODate,
  MonthKey,
  RecurringRule,
  Timestamp,
  Transaction,
} from '@/domain/types';
import { db } from './db';
import { runRecurring } from './repo';

/* ------------------------------------------------------------------ */
/* Constantes do perfil de exemplo                                     */
/* ------------------------------------------------------------------ */

/** Quantidade de meses gerados (incluindo o mês corrente, até `today`). */
export const DEMO_MONTHS = 6;

/** Salário líquido mensal do perfil de exemplo. */
export const DEMO_SALARY: Cents = 965000;

export const DEMO_ACCOUNT_IDS = {
  corrente: 'demo-acc-corrente',
  poupanca: 'demo-acc-poupanca',
  cartao: 'demo-acc-cartao',
  carteira: 'demo-acc-carteira',
  investimentos: 'demo-acc-investimentos',
} as const;

const ACC = DEMO_ACCOUNT_IDS;
const CAT = CATEGORY_IDS;

/** Cartão: fechamento e vencimento da fatura. */
const CARD_CLOSING_DAY = 3;
const CARD_DUE_DAY = 10;
/** Fatura em aberto no momento em que o cartão foi "cadastrado" (paga no 1º vencimento). */
const CARD_OPENING_BILL: Cents = 285000;

/** Valores que já estavam guardados nas metas no início do período (já incluídos no saldo inicial da poupança). */
const GOAL_STARTING_AMOUNTS = { reserva: 800000, viagem: 50000, notebook: 120000 } as const;
const GOAL_MONTHLY = { reserva: 40000, viagem: 20000, notebook: 15000 } as const;

export interface DemoDataset {
  accounts: Account[];
  transactions: Transaction[];
  recurring: RecurringRule[];
  budgets: Budget[];
  goals: Goal[];
  goalContributions: GoalContribution[];
  debts: Debt[];
  debtPayments: DebtPayment[];
  assets: Asset[];
  assetValuations: AssetValuation[];
}

/* ------------------------------------------------------------------ */
/* Aleatoriedade determinística                                        */
/* ------------------------------------------------------------------ */

/** FNV-1a 32 bits. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** PRNG mulberry32: rápido, determinístico e suficiente para dados de exemplo. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;

/** Valor aleatório em centavos entre `min` e `max` reais. */
function between(rng: Rng, min: number, max: number): Cents {
  return Math.round((min + rng() * (max - min)) * 100);
}

/** Inteiro aleatório em [min, max]. */
function intBetween(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/* ------------------------------------------------------------------ */
/* Construção                                                          */
/* ------------------------------------------------------------------ */

/** Dia `day` do mês (limitado ao último dia). */
function dayIn(key: MonthKey, day: number): ISODate {
  const [y, m] = key.split('-').map(Number);
  return makeISO(y, m, Math.min(day, daysInMonthKey(key)));
}

/** Datas do mês que caem no dia da semana informado (0 = domingo ... 6 = sábado). */
function weekdaysOf(key: MonthKey, wd: number): ISODate[] {
  const dates: ISODate[] = [];
  for (let d = 1; d <= daysInMonthKey(key); d++) {
    const date = dayIn(key, d);
    if (weekday(date) === wd) dates.push(date);
  }
  return dates;
}

interface TxInput {
  type: Transaction['type'];
  amount: Cents;
  date: ISODate;
  description: string;
  categoryId?: ID | null;
  accountId: ID;
  toAccountId?: ID | null;
  status?: Transaction['status'];
  recurringId?: ID | null;
  installment?: Transaction['installment'];
}

interface RuleSeed {
  key: string;
  type: 'despesa' | 'receita';
  amount: Cents;
  description: string;
  categoryId: ID;
  accountId: ID;
  day: number;
  frequency: Frequency;
}

const RULES: RuleSeed[] = [
  {
    key: 'salario',
    type: 'receita',
    amount: DEMO_SALARY,
    description: 'Salário',
    categoryId: CAT.salario,
    accountId: ACC.corrente,
    day: 5,
    frequency: 'mensal',
  },
  {
    key: 'aluguel',
    type: 'despesa',
    amount: 220000,
    description: 'Aluguel',
    categoryId: CAT.moradia,
    accountId: ACC.corrente,
    day: 10,
    frequency: 'mensal',
  },
  {
    key: 'internet',
    type: 'despesa',
    amount: 11990,
    description: 'Internet fibra',
    categoryId: CAT.contas,
    accountId: ACC.corrente,
    day: 12,
    frequency: 'mensal',
  },
  {
    key: 'netflix',
    type: 'despesa',
    amount: 4490,
    description: 'Netflix',
    categoryId: CAT.assinaturas,
    accountId: ACC.cartao,
    day: 14,
    frequency: 'mensal',
  },
  {
    key: 'academia',
    type: 'despesa',
    amount: 10990,
    description: 'Academia',
    categoryId: CAT.assinaturas,
    accountId: ACC.corrente,
    day: 7,
    frequency: 'mensal',
  },
];

const RESTAURANT_PLACES = [
  'iFood',
  'Almoço no restaurante',
  'Pizza delivery',
  'Hamburgueria',
  'Cafeteria',
  'Lanchonete',
  'Restaurante japonês',
] as const;

/**
 * Monta (sem gravar) todo o conjunto de dados de exemplo para `today`. Função pura e determinística:
 * a mesma data gera exatamente os mesmos registros (inclusive ids, prefixados com "demo-").
 * Lançamentos com data futura só existem como parcelas pendentes (compras parceladas) e a fatura do cartão
 * ainda não vencida no mês corrente; as recorrências do mês são geradas depois por `runRecurring`.
 */
export function buildDemoData(today: ISODate): DemoDataset {
  const months = lastMonths(monthKey(today), DEMO_MONTHS);
  const first = dayIn(months[0], 1);
  const stamp = (date: ISODate): Timestamp => `${date < today ? date : today}T12:00:00.000Z`;
  const startStamp = stamp(first);

  let txSeq = 0;
  let contribSeq = 0;
  let paySeq = 0;
  let valSeq = 0;
  const transactions: Transaction[] = [];
  const goalContributions: GoalContribution[] = [];
  const debtPayments: DebtPayment[] = [];
  const assetValuations: AssetValuation[] = [];

  /** Grava o lançamento (status padrão: pago até hoje, pendente depois). */
  function push(p: TxInput): Transaction {
    const tx: Transaction = {
      id: `demo-tx-${String(++txSeq).padStart(4, '0')}`,
      type: p.type,
      amount: p.amount,
      date: p.date,
      description: p.description,
      categoryId: p.type === 'transferencia' ? null : (p.categoryId ?? null),
      accountId: p.accountId,
      toAccountId: p.type === 'transferencia' ? (p.toAccountId ?? null) : null,
      status: p.status ?? (p.date <= today ? 'pago' : 'pendente'),
      notes: '',
      tags: [],
      recurringId: p.recurringId ?? null,
      installment: p.installment ?? null,
      createdAt: stamp(p.date),
      updatedAt: stamp(p.date),
    };
    transactions.push(tx);
    return tx;
  }

  /** Só grava se a data já passou (gastos do dia a dia não são "agendados"). */
  function paid(p: TxInput): Transaction | null {
    return p.date <= today ? push(p) : null;
  }

  /* ---------------- Contas ---------------- */
  const account = (p: Partial<Account> & Pick<Account, 'id' | 'name' | 'type' | 'initialBalance' | 'icon' | 'color'>) =>
    ({
      archived: false,
      includeInNetWorth: true,
      creditLimit: null,
      closingDay: null,
      dueDay: null,
      createdAt: startStamp,
      updatedAt: startStamp,
      ...p,
    }) satisfies Account;

  const accounts: Account[] = [
    account({
      id: ACC.corrente,
      name: 'Banco Digital',
      type: 'corrente',
      initialBalance: 650000,
      icon: '🏦',
      color: '#7c3aed',
    }),
    account({
      id: ACC.poupanca,
      name: 'Poupança',
      type: 'poupanca',
      initialBalance: GOAL_STARTING_AMOUNTS.reserva + GOAL_STARTING_AMOUNTS.viagem + GOAL_STARTING_AMOUNTS.notebook,
      icon: '🐷',
      color: '#db2777',
    }),
    account({
      id: ACC.cartao,
      name: 'Cartão de crédito',
      type: 'cartao_credito',
      initialBalance: -CARD_OPENING_BILL,
      icon: '💳',
      color: '#ea580c',
      creditLimit: 800000,
      closingDay: CARD_CLOSING_DAY,
      dueDay: CARD_DUE_DAY,
    }),
    account({
      id: ACC.carteira,
      name: 'Carteira',
      type: 'carteira',
      initialBalance: 15000,
      icon: '👛',
      color: '#ca8a04',
    }),
    account({
      id: ACC.investimentos,
      name: 'Investimentos',
      type: 'investimento',
      initialBalance: 1500000,
      icon: '📈',
      color: '#16a34a',
    }),
  ];

  /* ---------------- Metas ---------------- */
  const goal = (p: Pick<Goal, 'id' | 'name' | 'targetAmount' | 'targetDate' | 'icon' | 'color' | 'priority' | 'notes'>) =>
    ({
      status: 'ativa',
      accountId: ACC.poupanca,
      createdAt: startStamp,
      updatedAt: startStamp,
      ...p,
    }) satisfies Goal;

  const goals: Goal[] = [
    goal({
      id: 'demo-goal-reserva',
      name: 'Reserva de emergência',
      targetAmount: 3000000,
      targetDate: null,
      icon: '🛟',
      color: '#16a34a',
      priority: 'alta',
      notes: 'Meta: 6 meses de custo essencial guardados na poupança.',
    }),
    goal({
      id: 'demo-goal-viagem',
      name: 'Viagem',
      targetAmount: 800000,
      targetDate: addMonths(today, 10),
      icon: '✈️',
      color: '#2563eb',
      priority: 'media',
      notes: 'Férias no Nordeste.',
    }),
    goal({
      id: 'demo-goal-notebook',
      name: 'Notebook',
      targetAmount: 650000,
      targetDate: addMonths(today, 7),
      icon: '💻',
      color: '#7c3aed',
      priority: 'baixa',
      notes: 'Trocar o notebook antigo para os freelas.',
    }),
  ];
  const goalKeys = ['reserva', 'viagem', 'notebook'] as const;
  goalKeys.forEach((key, i) => {
    goalContributions.push({
      id: `demo-contrib-${++contribSeq}`,
      goalId: goals[i].id,
      amount: GOAL_STARTING_AMOUNTS[key],
      date: first,
      note: 'Valor que já estava guardado',
      transactionId: null,
      createdAt: startStamp,
    });
  });

  /* ---------------- Dívidas ---------------- */
  const debts: Debt[] = [
    {
      id: 'demo-debt-carro',
      name: 'Financiamento do carro',
      creditor: 'Banco Digital',
      type: 'financiamento',
      originalAmount: 4800000,
      balance: 3200000,
      balanceDate: first,
      interestRate: 1.49,
      minimumPayment: 115000,
      dueDay: 15,
      remainingInstallments: 34,
      status: 'ativa',
      notes: 'Parcela fixa no débito automático.',
      createdAt: startStamp,
      updatedAt: startStamp,
    },
    {
      id: 'demo-debt-emprestimo',
      name: 'Empréstimo pessoal',
      creditor: 'Financeira',
      type: 'emprestimo',
      originalAmount: 800000,
      balance: 620000,
      balanceDate: first,
      interestRate: 3.99,
      minimumPayment: 38000,
      dueDay: 20,
      remainingInstallments: 20,
      status: 'ativa',
      notes: 'Juros altos: prioridade para quitar.',
      createdAt: startStamp,
      updatedAt: startStamp,
    },
  ];
  const debtDays: Record<string, number> = { 'demo-debt-carro': 15, 'demo-debt-emprestimo': 20 };

  /* ---------------- Bens ---------------- */
  const carValue = (i: number) => Math.round((6400000 * 0.993 ** i) / 10000) * 10000;
  const pensionValue = (i: number) => Math.round(1250000 * 1.008 ** i);
  const assetSeeds = [
    {
      id: 'demo-asset-carro',
      name: 'Carro',
      type: 'veiculo' as const,
      acquisitionValue: 7200000,
      acquisitionDate: addMonths(first, -20),
      notes: 'Hatch 2023 (financiado).',
      valueAt: carValue,
    },
    {
      id: 'demo-asset-previdencia',
      name: 'Previdência privada',
      type: 'previdencia' as const,
      acquisitionValue: null,
      acquisitionDate: null,
      notes: 'Plano PGBL da empresa.',
      valueAt: pensionValue,
    },
  ];
  const assets: Asset[] = assetSeeds.map((seed) => {
    months.forEach((mk, i) => {
      const date = dayIn(mk, 1);
      assetValuations.push({
        id: `demo-val-${++valSeq}`,
        assetId: seed.id,
        value: seed.valueAt(i),
        date,
        createdAt: stamp(date),
      });
    });
    return {
      id: seed.id,
      name: seed.name,
      type: seed.type,
      value: seed.valueAt(months.length - 1),
      acquisitionValue: seed.acquisitionValue,
      acquisitionDate: seed.acquisitionDate,
      notes: seed.notes,
      archived: false,
      createdAt: startStamp,
      updatedAt: stamp(today),
    };
  });

  /* ---------------- Recorrências (lançamentos já pagos + próxima data) ---------------- */
  const recurring: RecurringRule[] = RULES.map((seed) => {
    const id = `demo-rec-${seed.key}`;
    const startDate = dayIn(months[0], seed.day);
    let date = startDate;
    while (date <= today) {
      push({ ...seed, date, recurringId: id, status: 'pago' });
      date = nextOccurrence(date, seed.frequency, seed.day);
    }
    return {
      id,
      type: seed.type,
      amount: seed.amount,
      description: seed.description,
      categoryId: seed.categoryId,
      accountId: seed.accountId,
      frequency: seed.frequency,
      startDate,
      endDate: null,
      nextDate: date,
      autoGenerate: true,
      active: true,
      createdAt: startStamp,
      updatedAt: startStamp,
    };
  });

  /* ---------------- Compras parceladas no cartão ---------------- */
  const installmentPurchases = [
    { group: 'demo-inst-tv', month: 1, day: 12, total: 359900, parts: 10, description: 'Smart TV 55"' },
    { group: 'demo-inst-tenis', month: 3, day: 20, total: 59970, parts: 3, description: 'Tênis de corrida' },
  ];
  for (const purchase of installmentPurchases) {
    const start = dayIn(months[purchase.month], purchase.day);
    if (start > today) continue;
    splitCents(purchase.total, purchase.parts).forEach((amount, i) => {
      push({
        type: 'despesa',
        amount,
        date: i === 0 ? start : addMonths(start, i, purchase.day),
        description: `${purchase.description} (${i + 1}/${purchase.parts})`,
        categoryId: CAT.compras,
        accountId: ACC.cartao,
        installment: { groupId: purchase.group, number: i + 1, total: purchase.parts },
      });
    });
  }

  /* ---------------- Mês a mês ---------------- */
  months.forEach((mk, i) => {
    const rng = mulberry32(hashString(`patrimonius-demo:${mk}`));
    const isCurrent = i === months.length - 1;
    const d = (day: number) => dayIn(mk, day);
    const dim = daysInMonthKey(mk);

    // Receitas extras
    if (i === 1) {
      paid({ type: 'receita', amount: 180000, date: d(18), description: 'Freela: site para cliente', categoryId: CAT.rendaExtra, accountId: ACC.corrente });
    }
    if (i === 3) {
      paid({ type: 'receita', amount: 240000, date: d(22), description: 'Freela: identidade visual', categoryId: CAT.rendaExtra, accountId: ACC.corrente });
    }
    if (i > 0) {
      paid({ type: 'receita', amount: between(rng, 48, 62), date: d(1), description: 'Rendimento da poupança', categoryId: CAT.rendimentos, accountId: ACC.poupanca });
    }
    paid({ type: 'receita', amount: between(rng, 125, 160), date: d(dim), description: 'Rendimento CDB', categoryId: CAT.rendimentos, accountId: ACC.investimentos });

    // Moradia, contas e saúde (conta corrente)
    paid({ type: 'despesa', amount: 65000, date: d(8), description: 'Condomínio', categoryId: CAT.moradia, accountId: ACC.corrente });
    paid({ type: 'despesa', amount: 38900, date: d(10), description: 'Plano de saúde', categoryId: CAT.saude, accountId: ACC.corrente });
    paid({ type: 'despesa', amount: between(rng, 165, 255), date: d(15), description: 'Conta de luz', categoryId: CAT.contas, accountId: ACC.corrente });
    paid({ type: 'despesa', amount: between(rng, 72, 108), date: d(18), description: 'Conta de água', categoryId: CAT.contas, accountId: ACC.corrente });

    // Assinaturas e serviços no cartão
    paid({ type: 'despesa', amount: 5990, date: d(20), description: 'Plano de celular', categoryId: CAT.contas, accountId: ACC.cartao });
    paid({ type: 'despesa', amount: 2190, date: d(14), description: 'Spotify', categoryId: CAT.assinaturas, accountId: ACC.cartao });
    paid({ type: 'despesa', amount: between(rng, 139, 169), date: d(4), description: 'Ração do pet', categoryId: CAT.pets, accountId: ACC.cartao });
    paid({ type: 'despesa', amount: between(rng, 55, 80), date: d(16), description: 'Barbearia', categoryId: CAT.cuidados, accountId: ACC.cartao });

    // Mercado semanal (sábados) no cartão + feira e padaria em dinheiro
    weekdaysOf(mk, 6).forEach((date, w) => {
      paid({ type: 'despesa', amount: between(rng, 180, 300), date, description: w === 2 ? 'Hortifruti' : 'Supermercado', categoryId: CAT.mercado, accountId: ACC.cartao });
    });
    weekdaysOf(mk, 0)
      .filter((_, w) => w === 0 || w === 2)
      .forEach((date) => {
        paid({ type: 'despesa', amount: between(rng, 35, 65), date, description: 'Feira', categoryId: CAT.mercado, accountId: ACC.carteira });
      });
    for (const day of [9, 23]) {
      paid({ type: 'despesa', amount: between(rng, 15, 35), date: d(day), description: 'Padaria', categoryId: CAT.mercado, accountId: ACC.carteira });
    }

    // Restaurantes e delivery
    const meals = intBetween(rng, 4, 6);
    for (let k = 0; k < meals; k++) {
      const date = d(intBetween(rng, 1, dim));
      const amount = between(rng, 35, 110);
      const description = pick(rng, RESTAURANT_PLACES);
      paid({ type: 'despesa', amount, date, description, categoryId: CAT.restaurantes, accountId: ACC.cartao });
    }

    // Transporte
    const rides = intBetween(rng, 3, 6);
    for (let k = 0; k < rides; k++) {
      const date = d(intBetween(rng, 1, dim));
      paid({ type: 'despesa', amount: between(rng, 15, 45), date, description: 'Uber', categoryId: CAT.transporte, accountId: ACC.cartao });
    }
    for (const day of [6, 21]) {
      paid({ type: 'despesa', amount: between(rng, 180, 260), date: d(day), description: 'Posto de combustível', categoryId: CAT.transporte, accountId: ACC.cartao });
    }

    // Saúde e lazer
    const pharmacy = intBetween(rng, 1, 2);
    for (let k = 0; k < pharmacy; k++) {
      const date = d(intBetween(rng, 1, dim));
      paid({ type: 'despesa', amount: between(rng, 25, 120), date, description: 'Farmácia', categoryId: CAT.saude, accountId: ACC.cartao });
    }
    const cinemaDay = intBetween(rng, 1, dim);
    paid({ type: 'despesa', amount: between(rng, 50, 90), date: d(cinemaDay), description: 'Cinema', categoryId: CAT.lazer, accountId: ACC.cartao });

    // Gastos pontuais
    if (i === 0) paid({ type: 'despesa', amount: 23490, date: d(21), description: 'Roupas', categoryId: CAT.compras, accountId: ACC.cartao });
    if (i === 2) paid({ type: 'despesa', amount: 22000, date: d(13), description: 'Show: ingresso', categoryId: CAT.lazer, accountId: ACC.cartao });
    if (i === 3) paid({ type: 'despesa', amount: 25000, date: d(11), description: 'Consulta no dentista', categoryId: CAT.saude, accountId: ACC.corrente });
    if (i === 4) paid({ type: 'despesa', amount: 15990, date: d(9), description: 'Presente de aniversário', categoryId: CAT.compras, accountId: ACC.cartao });

    // Mês corrente: comemoração que estoura o orçamento de restaurantes.
    if (isCurrent) {
      const todayDay = parseISO(today).day;
      push({ type: 'despesa', amount: 39000, date: d(1), description: 'Jantar de aniversário', categoryId: CAT.restaurantes, accountId: ACC.cartao });
      push({ type: 'despesa', amount: 24500, date: d(Math.min(2, todayDay)), description: 'Rodízio japonês', categoryId: CAT.restaurantes, accountId: ACC.cartao });
    }

    // Transferências: saque, aportes em investimentos e nas metas
    paid({ type: 'transferencia', amount: 20000, date: d(2), description: 'Saque para a carteira', accountId: ACC.corrente, toAccountId: ACC.carteira });
    paid({ type: 'transferencia', amount: 50000, date: d(6), description: 'Aporte mensal em investimentos', accountId: ACC.corrente, toAccountId: ACC.investimentos });
    goalKeys.forEach((key, g) => {
      const tx = paid({
        type: 'transferencia',
        amount: GOAL_MONTHLY[key],
        date: d(6),
        description: `Aporte: ${goals[g].name}`,
        accountId: ACC.corrente,
        toAccountId: ACC.poupanca,
      });
      if (!tx) return;
      goalContributions.push({
        id: `demo-contrib-${++contribSeq}`,
        goalId: goals[g].id,
        amount: tx.amount,
        date: tx.date,
        note: 'Aporte mensal',
        transactionId: tx.id,
        createdAt: stamp(tx.date),
      });
    });

    // Pagamentos das dívidas (despesa + registro do pagamento)
    for (const debt of debts) {
      const tx = paid({
        type: 'despesa',
        amount: debt.minimumPayment,
        date: d(debtDays[debt.id]),
        description: `Pagamento: ${debt.name}`,
        categoryId: CAT.dividas,
        accountId: ACC.corrente,
      });
      if (!tx) continue;
      debtPayments.push({
        id: `demo-pay-${++paySeq}`,
        debtId: debt.id,
        amount: tx.amount,
        date: tx.date,
        note: 'Parcela mensal',
        transactionId: tx.id,
        createdAt: stamp(tx.date),
      });
    }
  });

  /* ---------------- Faturas do cartão (transferência da conta corrente) ---------------- */
  let previousClosing: ISODate | null = null;
  months.forEach((mk, i) => {
    const closing = dayIn(mk, CARD_CLOSING_DAY);
    const due = dayIn(mk, CARD_DUE_DAY);
    const cycleEnd = closing < today ? closing : today;
    let bill = i === 0 ? CARD_OPENING_BILL : 0;
    for (const tx of transactions) {
      if (tx.accountId !== ACC.cartao || tx.type !== 'despesa' || tx.status !== 'pago') continue;
      if (tx.date > cycleEnd || (previousClosing !== null && tx.date <= previousClosing)) continue;
      bill += tx.amount;
    }
    previousClosing = closing;
    if (bill <= 0) return;
    if (due > today && i !== months.length - 1) return;
    push({
      type: 'transferencia',
      amount: bill,
      date: due,
      description: 'Pagamento da fatura do cartão',
      accountId: ACC.corrente,
      toAccountId: ACC.cartao,
    });
  });

  /* ---------------- Parcelas restantes das dívidas ---------------- */
  for (const debt of debts) {
    const count = debtPayments.filter((p) => p.debtId === debt.id).length;
    if (debt.remainingInstallments !== null) debt.remainingInstallments -= count;
  }

  /* ---------------- Orçamentos padrão ---------------- */
  const budgetSeeds: [ID, Cents][] = [
    [CAT.mercado, 180000],
    [CAT.restaurantes, 55000],
    [CAT.transporte, 85000],
    [CAT.lazer, 40000],
    [CAT.compras, 90000],
    [CAT.assinaturas, 20000],
    [CAT.cuidados, 15000],
  ];
  const budgets: Budget[] = budgetSeeds.map(([categoryId, amount]) => ({
    id: `demo-bud-${categoryId}`,
    categoryId,
    amount,
    month: null,
    createdAt: startStamp,
    updatedAt: startStamp,
  }));

  return {
    accounts,
    transactions,
    recurring,
    budgets,
    goals,
    goalContributions,
    debts,
    debtPayments,
    assets,
    assetValuations,
  };
}

/**
 * APAGA todos os dados atuais e carrega os dados de exemplo para `today`.
 * Preserva as preferências do usuário (nome, tema, nome do agente, metas pessoais); se o nome estiver vazio usa "Você".
 * Marca o primeiro uso como concluído e, ao final, gera as recorrências pendentes do mês (runRecurring).
 * Idempotente: chamar de novo produz o mesmo conjunto de dados.
 */
export async function loadDemoData(today: ISODate): Promise<void> {
  const demo = buildDemoData(today);
  await db.transaction('rw', db.tables, async () => {
    const previous = await db.settings.get('settings');
    await Promise.all(db.tables.map((t) => t.clear()));
    const now = nowTimestamp();
    const base = previous ?? buildDefaultSettings(now);
    await db.categories.bulkAdd(buildDefaultCategories(now));
    await db.accounts.bulkAdd(demo.accounts);
    await db.transactions.bulkAdd(demo.transactions);
    await db.recurring.bulkAdd(demo.recurring);
    await db.budgets.bulkAdd(demo.budgets);
    await db.goals.bulkAdd(demo.goals);
    await db.goalContributions.bulkAdd(demo.goalContributions);
    await db.debts.bulkAdd(demo.debts);
    await db.debtPayments.bulkAdd(demo.debtPayments);
    await db.assets.bulkAdd(demo.assets);
    await db.assetValuations.bulkAdd(demo.assetValuations);
    await db.settings.put({
      ...base,
      id: 'settings',
      userName: base.userName.trim() || 'Você',
      monthlyIncomeEstimate: base.monthlyIncomeEstimate ?? DEMO_SALARY,
      onboardingDone: true,
      dismissedInsights: {},
      updatedAt: now,
    });
  });
  await runRecurring(today);
}
