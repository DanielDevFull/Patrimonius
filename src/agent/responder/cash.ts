/** Saldo, previsão do mês, contas a pagar e "posso gastar?". */
import {
  accountBalance,
  accountBalances,
  affordability,
  budgetStatuses,
  cardCommitted,
  cashflowForecast,
  liquidBalance,
  monthSummary,
  savingsTargetPct,
  upcomingItems,
  type CashflowForecast,
} from '@/analytics';
import { ROUTES } from '@/app/navigation';
import {
  addDays,
  addMonths,
  daysInMonth,
  diffDays,
  endOfMonth,
  formatDateBR,
  formatDateShort,
  formatMonthLong,
  makeISO,
  parseISO,
} from '@/domain/dates';
import { COLOR_PALETTE } from '@/domain/defaults';
import { formatBRL, formatDecimal, splitCents } from '@/domain/money';
import { plural } from '@/domain/text';
import {
  ACCOUNT_TYPE_LABELS,
  type Account,
  type AccountType,
  type FinanceData,
  type ID,
  type ISODate,
} from '@/domain/types';
import {
  bullets,
  capitalizeDescription,
  formatNumber,
  categoryLabel,
  dateRelative,
  joinList,
  money,
  monthPeriod,
  sentences,
  toneOfAmount,
} from '../format';
import type { AgentAction, AgentCard } from '../types';
import {
  activeAccounts,
  findAccount,
  findCategory,
  sum,
  transactionsIn,
  type Handler,
  type HandlerOutput,
  type TurnContext,
} from './context';

const INVESTMENT_TYPES: readonly AccountType[] = ['investimento'];

function hasCashAccounts(data: FinanceData): boolean {
  return data.accounts.some((a) => !a.archived && a.type !== 'investimento');
}

function needAccounts(what: string): HandlerOutput {
  return {
    text: `Para ${what}, preciso conhecer suas contas. Cadastre onde seu dinheiro fica (conta corrente, carteira, cartão) com o saldo atual e registre seus lançamentos.`,
    actions: [{ type: 'navigate', label: 'Cadastrar conta', to: ROUTES.accounts }],
    suggestions: ['O que você sabe fazer?'],
  };
}

/** Pontos do saldo projetado amostrados para um gráfico de barras (até ~8 barras). */
function forecastChart(forecast: CashflowForecast): AgentCard {
  const points = forecast.points;
  const step = Math.max(1, Math.ceil(points.length / 8));
  const sampled = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  return {
    type: 'chart',
    title: 'Saldo projetado',
    chart: 'bar',
    data: sampled.map((p) => ({ label: formatDateShort(p.date), value: p.balance })),
  };
}

/** Próximo vencimento (hoje inclusive) para o dia do mês `dueDay` (limitado ao último dia do mês). */
function nextDueDate(dueDay: number, today: ISODate): ISODate {
  const { year, month } = parseISO(today);
  const thisMonth = makeISO(year, month, Math.min(dueDay, daysInMonth(year, month)));
  if (thisMonth >= today) return thisMonth;
  const next = parseISO(addMonths(makeISO(year, month, 1), 1));
  return makeISO(next.year, next.month, Math.min(dueDay, daysInMonth(next.year, next.month)));
}

/** Pagamentos de fatura agendados (transferências pendentes para o cartão), do mais próximo ao mais distante. */
function scheduledCardPayments(data: FinanceData, cardId: ID) {
  return data.transactions
    .filter((tx) => tx.type === 'transferencia' && tx.status === 'pendente' && tx.toAccountId === cardId)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function cardPhrase(account: Account): string {
  return `${account.name.toLowerCase().startsWith('cart') ? 'do' : 'do cartão'} ${account.name}`;
}

/** consultar_saldo */
export const balanceQuery: Handler = (ctx) => {
  const { data, today, entities: e } = ctx;
  const accounts = activeAccounts(data);
  if (accounts.length === 0) return needAccounts('mostrar seus saldos');
  const asOf: ISODate = e.period && e.period.end < today ? e.period.end : today;
  const past = asOf < today;
  const when = past ? ` em ${formatDateBR(asOf)}` : '';
  const memory = { lastAccountId: e.accountId, lastPeriod: e.period };
  const suggestions = ['Vou fechar o mês no azul?', 'Contas a pagar', 'Quanto gastei este mês?'];

  const account = findAccount(data, e.accountId);
  if (account) {
    const balance = accountBalance(account, data.transactions, { asOf });
    if (account.type === 'cartao_credito') {
      const bill = Math.max(0, -balance);
      const parts = [`A fatura em aberto ${cardPhrase(account)}${when} é ${money(bill)}.`];
      if (!past) {
        const payment = scheduledCardPayments(data, account.id).find((tx) => tx.date >= today);
        if (payment) parts.push(`Há um pagamento de ${formatBRL(payment.amount)} agendado ${dateRelative(payment.date, today)}.`);
        else if (bill > 0 && account.dueDay) parts.push(`O próximo vencimento é ${dateRelative(nextDueDate(account.dueDay, today), today)}.`);
      }
      if (account.creditLimit && account.creditLimit > 0 && !past) {
        // Fatura em aberto + parcelas e compras futuras; o pagamento agendado só libera limite quando acontece.
        const used = cardCommitted(account, data.transactions, today);
        parts.push(
          `Limite disponível: ${formatBRL(Math.max(0, account.creditLimit - used))} de ${formatBRL(account.creditLimit)} (contando as parcelas futuras).`,
        );
      }
      return {
        text: sentences(parts),
        cards: [{ type: 'stat', title: `Fatura — ${account.name}`, value: formatBRL(bill), tone: bill > 0 ? 'warning' : 'neutral' }],
        suggestions,
        memory,
      };
    }
    return {
      text: sentences([
        `O saldo de ${account.name}${when} é ${money(balance)}.`,
        balance < 0 ? '⚠️ A conta está no negativo: cubra esse valor logo para evitar juros.' : null,
      ]),
      cards: [{ type: 'stat', title: account.name, value: formatBRL(balance), tone: toneOfAmount(balance) }],
      suggestions,
      memory,
    };
  }

  const balances = accountBalances(accounts, data.transactions, { asOf });
  // Contas fora do patrimônio (ex.: conjunta que o usuário só administra) aparecem na lista, mas não entram nos
  // totais: o "Saldo atual" do Painel e o "Total em contas" de Contas também não as somam.
  const own = accounts.filter((a) => a.includeInNetWorth);
  const outside = accounts.filter((a) => !a.includeInNetWorth).map((a) => a.name);
  const liquid = liquidBalance(own, data.transactions, { asOf });
  const invested = sum(own.filter((a) => INVESTMENT_TYPES.includes(a.type)).map((a) => balances[a.id]));
  const cards = sum(own.filter((a) => a.type === 'cartao_credito').map((a) => balances[a.id]));
  const total = sum(own.map((a) => balances[a.id]));
  const negatives = accounts.filter((a) => a.type !== 'cartao_credito' && balances[a.id] < 0).map((a) => a.name);
  let forecastLine: string | null = null;
  if (!past && hasCashAccounts(data)) {
    const forecast = cashflowForecast(data, today);
    forecastLine = `Pela previsão, você fecha ${formatMonthLong(ctx.month)} com ${formatBRL(forecast.projectedEndBalance)} em caixa.`;
  }
  const text = sentences([
    `Você tem ${money(liquid)} disponíveis nas contas${when}.`,
    invested !== 0 ? `Em investimentos, ${formatBRL(invested)}.` : null,
    cards < 0 ? `As faturas de cartão somam ${formatBRL(-cards)}.` : null,
    invested !== 0 || cards !== 0 ? `Saldo total: ${money(total)}.` : null,
    outside.length
      ? `${joinList(outside)} ${outside.length === 1 ? 'está fora do patrimônio e não entra' : 'estão fora do patrimônio e não entram'} nesses totais.`
      : null,
    negatives.length ? `⚠️ ${joinList(negatives)} ${negatives.length === 1 ? 'está' : 'estão'} no negativo.` : null,
    forecastLine,
  ]);
  return {
    text,
    cards: [
      { type: 'stat', title: 'Disponível nas contas', value: formatBRL(liquid), tone: toneOfAmount(liquid) },
      {
        type: 'list',
        title: 'Saldos por conta',
        items: accounts.map((a) => ({
          label: `${a.icon ? `${a.icon} ` : ''}${a.name}`,
          value: formatBRL(balances[a.id]),
          hint: a.includeInNetWorth ? ACCOUNT_TYPE_LABELS[a.type] : `${ACCOUNT_TYPE_LABELS[a.type]} · fora do patrimônio`,
          tone: balances[a.id] < 0 ? 'negative' : 'neutral',
        })),
      },
    ],
    suggestions,
    memory,
  };
};

/** previsao */
export const forecastReply: Handler = (ctx) => {
  const { data, today, entities: e } = ctx;
  if (!hasCashAccounts(data)) return needAccounts('prever o fim do mês');
  const until = e.period && e.period.end > today ? e.period.end : undefined;
  const f = cashflowForecast(data, today, until);
  const end = f.projectedEndBalance;
  const target = until ? `chegar a ${formatDateBR(f.until)}` : `fechar ${formatMonthLong(ctx.month)}`;
  const remainingDays = Math.max(1, diffDays(today, f.until));
  const flows = `Até ${formatDateBR(f.until)}, devem entrar ${formatBRL(f.expectedIncome)} e sair ${formatBRL(f.expectedExpense)} em contas já previstas${f.projectedVariableSpending > 0 ? `, além de cerca de ${formatBRL(f.projectedVariableSpending)} em gastos do dia a dia (pela sua média)` : ''}.`;
  let verdict: string;
  if (end < 0) {
    verdict = `⛔ Previsão: ${target} em ${money(end)}. Para evitar o vermelho, corte ${formatBRL(-end)} nos gastos variáveis — cerca de ${formatBRL(Math.ceil(-end / remainingDays))} por dia — ou adie compras.`;
  } else if (f.willGoNegative) {
    verdict = `⚠️ Você deve ${target} com ${money(end)}, mas o saldo pode ficar negativo ${dateRelative(f.lowestPoint.date, today)} (${formatBRL(f.lowestPoint.balance)}). Reprograme algum pagamento ou deixe uma folga na conta.`;
  } else {
    verdict = `✅ Previsão: ${target} com ${money(end)}. Se sobrar mesmo, já separe uma parte para a reserva ou para as suas metas.`;
  }
  return {
    text: sentences([`Hoje você tem ${money(f.currentBalance)} em caixa (contas e cartões).`, flows, verdict]),
    cards: [
      { type: 'stat', title: 'Saldo previsto', value: formatBRL(end), hint: formatDateBR(f.until), tone: toneOfAmount(end) },
      {
        type: 'list',
        title: 'Como chego nesse número',
        items: [
          { label: 'Saldo atual', value: formatBRL(f.currentBalance) },
          { label: 'Entradas previstas', value: `+${formatBRL(f.expectedIncome)}`, tone: 'positive' },
          { label: 'Contas previstas', value: `-${formatBRL(f.expectedExpense)}`, tone: 'negative' },
          {
            label: 'Gastos do dia a dia (estimativa)',
            value: `-${formatBRL(f.projectedVariableSpending)}`,
            hint: 'Média dos últimos 3 meses',
            tone: 'negative',
          },
        ],
      },
      forecastChart(f),
    ],
    suggestions: ['Contas a pagar', 'Quanto posso gastar hoje?', 'Onde estou gastando mais?'],
    memory: { lastPeriod: e.period ?? monthPeriod(ctx.month, today) },
  };
};

interface Bill {
  date: ISODate;
  description: string;
  amount: number;
  overdue: boolean;
}

/** contas_a_pagar */
export const billsReply: Handler = (ctx) => {
  const { data, today, entities: e } = ctx;
  const defaultEnd = endOfMonth(ctx.month);
  const minEnd = addDays(today, 7);
  const end =
    e.period && e.period.end >= today ? e.period.end : defaultEnd > minEnd ? defaultEnd : minEnd;
  const items = upcomingItems(data, today, diffDays(today, end));
  const cards = new Map(activeAccounts(data).filter((a) => a.type === 'cartao_credito').map((a) => [a.id, a]));
  const txById = new Map(data.transactions.map((tx) => [tx.id, tx]));
  const ruleById = new Map(data.recurring.map((r) => [r.id, r]));
  // Compras e parcelas no cartão não vencem sozinhas: entram na fatura (listada abaixo).
  const onCard = (i: (typeof items)[number]) => {
    const accountId = i.transactionId
      ? txById.get(i.transactionId)?.accountId
      : i.recurringId
        ? ruleById.get(i.recurringId)?.accountId
        : undefined;
    return accountId !== undefined && cards.has(accountId);
  };
  const expenses: Bill[] = items
    .filter((i) => i.type === 'despesa' && !onCard(i))
    .map((i) => ({ date: i.date, description: i.description, amount: i.amount, overdue: i.overdue }));
  for (const card of cards.values()) {
    const payments = scheduledCardPayments(data, card.id).filter((tx) => tx.date <= end);
    for (const tx of payments)
      expenses.push({ date: tx.date, description: `Fatura ${card.name}`, amount: tx.amount, overdue: tx.date < today });
    if (payments.length || !card.dueDay) continue;
    const bill = Math.max(0, -accountBalance(card, data.transactions, { asOf: today }));
    const due = nextDueDate(card.dueDay, today);
    if (bill > 0 && due <= end)
      expenses.push({ date: due, description: `Fatura ${card.name} (em aberto)`, amount: bill, overdue: false });
  }
  expenses.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.amount - a.amount));
  const incomes = items.filter((i) => i.type === 'receita' && !i.overdue);
  const memory = { lastPeriod: e.period };
  if (expenses.length === 0) {
    const noRules = data.recurring.length === 0;
    return {
      text: sentences([
        `Nenhuma conta a pagar até ${formatDateBR(end)}. 🎉`,
        noRules
          ? 'Dica: cadastre suas contas fixas (aluguel, luz, internet) em Recorrências para eu avisar antes do vencimento.'
          : null,
      ]),
      actions: noRules ? [{ type: 'navigate', label: 'Cadastrar recorrências', to: ROUTES.recurring }] : [],
      suggestions: ['Vou fechar o mês no azul?', 'Qual meu saldo?', 'Minhas assinaturas'],
      memory,
    };
  }
  const total = sum(expenses.map((i) => i.amount));
  const overdue = expenses.filter((i) => i.overdue);
  const next = expenses.find((i) => !i.overdue);
  const incomeTotal = sum(incomes.map((i) => i.amount));
  const liquid = liquidBalance(data.accounts, data.transactions, { asOf: today });
  const parts: (string | null)[] = [
    `Você tem ${plural(expenses.length, 'conta', 'contas')} a pagar até ${formatDateBR(end)}, somando ${money(total)}.`,
  ];
  if (overdue.length)
    parts.push(
      `⚠️ ${overdue.length === 1 ? '1 já está vencida' : `${overdue.length} já estão vencidas`}: ${joinList(overdue.slice(0, 3).map((i) => `${i.description} (${formatBRL(i.amount)}, venceu em ${formatDateBR(i.date)})`))}. Pague o quanto antes para evitar multa e juros.`,
    );
  if (next) parts.push(`A próxima é ${next.description} (${formatBRL(next.amount)}), ${dateRelative(next.date, today)}.`);
  if (incomeTotal > 0)
    parts.push(
      `E devem entrar ${formatBRL(incomeTotal)} no período (${incomes[0].description} ${dateRelative(incomes[0].date, today)}${incomes.length > 1 ? ` e mais ${plural(incomes.length - 1, 'entrada', 'entradas')}` : ''}).`,
    );
  if (liquid + incomeTotal < total)
    parts.push(
      `Atenção: hoje há ${formatBRL(liquid)} disponíveis — mesmo com as entradas previstas, faltam ${formatBRL(total - liquid - incomeTotal)} para cobrir tudo.`,
    );
  return {
    text: sentences(parts),
    cards: [
      {
        type: 'list',
        title: 'Contas a pagar',
        items: expenses.slice(0, 8).map((i) => ({
          label: i.description,
          value: formatBRL(i.amount),
          hint: i.overdue ? `Venceu em ${formatDateBR(i.date)}` : `Vence ${dateRelative(i.date, today)}`,
          tone: i.overdue ? 'negative' : 'neutral',
        })),
      },
    ],
    actions: [{ type: 'navigate', label: 'Ver lançamentos', to: ROUTES.transactions }],
    suggestions: ['Vou fechar o mês no azul?', 'Qual meu saldo?', 'Minhas assinaturas'],
    memory,
  };
};

/**
 * "Quanto posso gastar?" (sem valor): receitas do mês (inclusive as previstas) − gastos feitos e comprometidos
 * − o que falta da meta de poupança (nada, se o usuário não definiu meta). Sem receita no mês, usa a folga da
 * previsão de caixa.
 */
function spendingAllowance(ctx: TurnContext): HandlerOutput {
  const { data, today, month } = ctx;
  const long = formatMonthLong(month);
  const end = endOfMonth(month);
  const days = diffDays(today, end) + 1;
  const suggestions = ['Posso gastar 300 num tênis?', 'Vou fechar o mês no azul?', 'Contas a pagar'];
  const memory = { lastPeriod: monthPeriod(month, today) };
  // "e com lazer?": quanto ainda cabe no orçamento da categoria.
  const category = findCategory(data, ctx.entities.categoryId);
  if (category && category.kind === 'despesa') {
    const label = categoryLabel(category);
    const status = budgetStatuses(data.budgets, data.transactions, data.categories, month, today).find(
      (b) => b.categoryId === category.id,
    );
    const categoryMemory = { ...memory, lastCategoryId: category.id };
    if (!status) {
      const spent = sum(
        transactionsIn(data, monthPeriod(month, today), 'despesa', { categoryId: category.id }).map((tx) => tx.amount),
      );
      return {
        text: `${label} não tem orçamento. Em ${long} você já gastou ${money(spent)} nessa categoria. Defina um limite (ex.: “orçamento de 400 para ${category.name.toLowerCase()}”) para eu calcular quanto ainda dá para gastar nela.`,
        suggestions: [`Orçamento de 400 para ${category.name}`, ...suggestions],
        memory: categoryMemory,
      };
    }
    const free = Math.max(0, status.remaining);
    return {
      text:
        free > 0
          ? `No orçamento de ${label} restam ${money(free)} em ${long} (${formatBRL(status.spent)} de ${formatBRL(status.budgeted)} já usados) — cerca de ${money(Math.floor(free / days))} por dia nos próximos ${plural(days, 'dia', 'dias')}.`
          : `⛔ O orçamento de ${label} (${formatBRL(status.budgeted)}) já acabou em ${long}: você gastou ${money(status.spent)}. Melhor segurar novos gastos nessa categoria.`,
      cards: [
        {
          type: 'progress',
          title: `Orçamento de ${category.name}`,
          items: [
            {
              label,
              current: status.spent,
              target: status.budgeted,
              tone: status.status === 'estourado' ? 'negative' : status.status === 'alerta' ? 'warning' : 'positive',
            },
          ],
        },
      ],
      suggestions,
      memory: categoryMemory,
    };
  }
  const s = monthSummary(data.transactions, month);
  const scheduled = upcomingItems(data, today, diffDays(today, end)).filter((i) => i.source === 'recorrencia');
  const income = s.income + sum(scheduled.filter((i) => i.type === 'receita').map((i) => i.amount));
  const committed = s.expense + sum(scheduled.filter((i) => i.type === 'despesa').map((i) => i.amount));
  if (income <= 0) {
    const f = cashflowForecast(data, today);
    return {
      text: sentences([
        `Ainda não há receitas registradas em ${long}, então olhei para o caixa: a previsão é fechar o mês com ${money(f.projectedEndBalance)}, já contando seus gastos do dia a dia.`,
        f.projectedEndBalance > 0
          ? 'Gastos extras saem dessa folga — e o ideal é não mexer na reserva de emergência.'
          : '⛔ Melhor segurar os gastos extras.',
        'Registre seu salário (ex.: “recebi 5000 de salário”) para eu calcular um limite por dia.',
      ]),
      cards: [{ type: 'stat', title: 'Folga prevista no fim do mês', value: formatBRL(f.projectedEndBalance), tone: toneOfAmount(f.projectedEndBalance) }],
      suggestions,
      memory,
    };
  }
  // Sem meta de poupança (0% nas Configurações), nada é reservado: o livre é o que sobra.
  const targetPct = savingsTargetPct(data.settings);
  const savingsGoal = targetPct === null ? 0 : Math.round((income * targetPct) / 100);
  const toSave = Math.max(0, savingsGoal - s.invested);
  const left = income - committed;
  const free = left - toSave;
  let text: string;
  if (left <= 0) {
    text = `⛔ Em ${long}, os gastos feitos e comprometidos (${formatBRL(committed)}) já ${left === 0 ? 'igualam' : 'passam'} as receitas (${formatBRL(income)}). Evite novos gastos que não sejam essenciais.`;
  } else if (free <= 0 && targetPct !== null) {
    text = `⚠️ Em ${long} entram ${formatBRL(income)} e já saíram ou estão comprometidos ${formatBRL(committed)}. Sobram ${money(left)} — menos do que falta para a sua meta de poupança de ${formatNumber(targetPct)}% (${formatBRL(toSave)}). Segure os gastos extras para não comer a poupança do mês.`;
  } else {
    text = sentences([
      `Em ${long} entram ${formatBRL(income)} e já saíram ou estão comprometidos ${formatBRL(committed)}.`,
      targetPct === null
        ? 'Como você não definiu uma meta de poupança,'
        : toSave > 0
          ? `Separando ${formatBRL(toSave)} para a meta de poupança (${formatNumber(targetPct)}%),`
          : 'Com a meta de poupança do mês já cumprida,',
      `você ainda pode gastar ${money(free)} até o fim do mês — cerca de ${money(Math.floor(free / days))} por dia nos próximos ${plural(days, 'dia', 'dias')}.`,
    ]);
  }
  return {
    text: `${text}

Quer testar uma compra? Pergunte, por exemplo: “posso gastar 300 num tênis?”.`,
    cards: [
      {
        type: 'list',
        title: `Seu mês (${long})`,
        items: [
          { label: 'Receitas (inclui previstas)', value: formatBRL(income), tone: 'positive' },
          { label: 'Gastos feitos e comprometidos', value: `-${formatBRL(committed)}`, tone: 'negative' },
          ...(targetPct === null
            ? []
            : [{ label: `Meta de poupança (${formatNumber(targetPct)}%)`, value: `-${formatBRL(toSave)}` }]),
          { label: 'Livre para gastar', value: formatBRL(Math.max(0, free)), tone: free > 0 ? 'positive' : 'warning' },
        ],
      },
    ],
    suggestions,
    memory,
  };
}

function verdictHead(verdict: 'sim' | 'com_cautela' | 'nao', name: string): string {
  if (verdict === 'sim') return `✅ Pode sim${name ? `, ${name}` : ''}!`;
  if (verdict === 'com_cautela') return name ? `⚠️ ${name}, dá, mas com cautela.` : '⚠️ Dá, mas com cautela.';
  return name ? `⛔ ${name}, agora não é uma boa ideia.` : '⛔ Agora não é uma boa ideia.';
}

/** posso_gastar */
export const affordabilityReply: Handler = (ctx) => {
  const { data, today, entities: e, name } = ctx;
  if (!hasCashAccounts(data)) return needAccounts('avaliar uma compra');
  const amount = e.amount;

  if (amount === undefined || amount <= 0) return spendingAllowance(ctx);

  const installments = Math.max(1, Math.floor(e.installments ?? 1));
  const r = affordability(data, today, amount, installments);
  const description = e.description ? capitalizeDescription(e.description) : '';
  const purchase =
    installments > 1
      ? `${formatBRL(amount)} em ${installments}x de ${formatBRL(splitCents(amount, installments)[0])}`
      : formatBRL(amount);
  const reasons = [...r.reasons];
  const category = findCategory(data, e.categoryId);
  let exceedsBudget = false;
  if (category && category.kind === 'despesa') {
    const status = budgetStatuses(data.budgets, data.transactions, data.categories, ctx.month, today).find(
      (s) => s.categoryId === category.id,
    );
    if (status) {
      const free = Math.max(0, status.remaining);
      exceedsBudget = r.firstPayment > free;
      reasons.push(
        r.firstPayment > free
          ? `No orçamento de ${categoryLabel(category)} restam ${formatBRL(free)} — a compra passaria do limite.`
          : `Cabe no orçamento de ${categoryLabel(category)}, que ainda tem ${formatBRL(free)} livres.`,
      );
    }
  }

  // Passar do orçamento da categoria rebaixa um "sim" para "com cautela".
  const verdict = r.verdict === 'sim' && exceedsBudget ? 'com_cautela' : r.verdict;
  const actions: AgentAction[] = [];
  let closing: string;
  if (verdict === 'nao') {
    const monthly =
      r.averageMonthlySurplus > 0 ? Math.min(amount, Math.max(1000, Math.round(r.averageMonthlySurplus / 2))) : Math.ceil(amount / 6);
    const months = Math.max(1, Math.ceil(amount / monthly));
    closing = `Que tal transformar em meta? Guardando ${formatBRL(monthly)} por mês, você compra à vista em ${plural(months, 'mês', 'meses')}.`;
    actions.push({
      type: 'create_goal',
      label: 'Criar meta para essa compra',
      draft: {
        name: description || 'Compra planejada',
        targetAmount: amount,
        targetDate: addMonths(today, months),
        icon: '🛍️',
        color: COLOR_PALETTE[data.goals.length % COLOR_PALETTE.length],
        priority: 'media',
        status: 'ativa',
      },
    });
  } else if (verdict === 'com_cautela') {
    closing =
      installments > 1
        ? 'Se decidir comprar, confira se o parcelamento é sem juros e acompanhe o orçamento de perto nos próximos meses.'
        : 'Se decidir comprar, acompanhe o orçamento de perto até o fim do mês.';
  } else {
    closing = description
      ? `Depois é só me contar a compra (ex.: “comprei ${description.toLowerCase()} por ${formatDecimal(amount)}”) que eu registro.`
      : 'Depois é só me contar a compra que eu registro.';
  }

  const text = `${verdictHead(verdict, name)} Analisei a compra${description ? ` de ${description}` : ''} (${purchase}):\n${bullets(reasons)}\n\n${closing}`;
  return {
    text,
    cards: [
      {
        type: 'list',
        title: 'Impacto no mês',
        items: [
          { label: 'Saldo previsto (fim do mês)', value: formatBRL(r.projectedEndBalance), tone: toneOfAmount(r.projectedEndBalance) },
          {
            label: installments > 1 ? 'Depois da 1ª parcela' : 'Depois da compra',
            value: formatBRL(r.balanceAfter),
            tone: toneOfAmount(r.balanceAfter),
          },
          { label: 'Sobra média mensal', value: formatBRL(r.averageMonthlySurplus), hint: 'Últimos 3 meses' },
        ],
      },
    ],
    actions,
    suggestions:
      verdict === 'sim'
        ? ['Como está meu orçamento?', 'Vou fechar o mês no azul?']
        : ['Dicas para economizar', 'Vou fechar o mês no azul?', 'Onde estou gastando mais?'],
    // Compra simulada guardada para continuações ("e em 10x?", "e 150?").
    memory: {
      lastCategoryId: category?.id,
      lastEntities: { amount, description: e.description, installments: e.installments, categoryId: category?.id },
    },
  };
};
