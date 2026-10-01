/** Orçamentos: situação do mês e definição de limites. */
import {
  averageMonthlyExpense,
  budgetOverview,
  resolveBudget,
  suggestBudgets,
  type BudgetStatus,
  type BudgetSuggestion,
} from '@/analytics';
import { ROUTES } from '@/app/navigation';
import { daysInMonthKey, formatMonthLong, parseISO } from '@/domain/dates';
import { formatBRL, formatDecimal, formatPercent } from '@/domain/money';
import { plural } from '@/domain/text';
import type { Category } from '@/domain/types';
import { bullets, categoryLabel, joinList, money, monthPeriod, paragraphs, sentences } from '../format';
import type { AgentAction, AgentCard, CardTone } from '../types';
import {
  findCategory,
  referenceMonth,
  sum,
  transactionsIn,
  validCategory,
  type Handler,
  type TurnContext,
} from './context';

const STATUS_TONE: Record<BudgetStatus['status'], CardTone> = {
  ok: 'positive',
  alerta: 'warning',
  estourado: 'negative',
};

/**
 * Sugestões de orçamento (@/analytics) só para categorias de consumo: limitar aportes em investimentos
 * ou pagamentos de dívidas (grupo 'objetivos') não faz sentido.
 */
function consumptionSuggestions(ctx: TurnContext, month: string): BudgetSuggestion[] {
  return suggestBudgets(ctx.data.transactions, ctx.data.categories, month).filter(
    (s) => findCategory(ctx.data, s.categoryId)?.group !== 'objetivos',
  );
}

/** Sugestão arredondada (múltiplos de R$ 10) a partir da média dos 3 meses anteriores. */
function suggestedAmount(ctx: TurnContext, category: Category, month: string): { average: number; suggested: number } {
  const average = averageMonthlyExpense(ctx.data.transactions, month, 3, [category.id]);
  return { average, suggested: average > 0 ? Math.ceil(average / 1000) * 1000 : 0 };
}

/** Dias restantes no mês (incluindo hoje) quando o mês é o corrente. */
function daysLeft(ctx: TurnContext, month: string): number | null {
  if (month !== ctx.month) return null;
  return Math.max(1, daysInMonthKey(month) - parseISO(ctx.today).day + 1);
}

function progressItem(s: BudgetStatus) {
  const hint =
    s.status === 'estourado'
      ? `Passou ${formatBRL(s.spent - s.budgeted)}`
      : `Restam ${formatBRL(s.remaining)}${s.projected > s.budgeted ? ` · projeção ${formatBRL(s.projected)}` : ''}`;
  return {
    label: categoryLabel({ icon: s.icon, name: s.categoryName }),
    current: s.spent,
    target: s.budgeted,
    hint,
    tone: STATUS_TONE[s.status],
  };
}

/** status_orcamento */
export const budgetStatusReply: Handler = (ctx) => {
  const { data, today, entities: e } = ctx;
  const month = referenceMonth(ctx);
  const long = formatMonthLong(month);
  const overview = budgetOverview(data.budgets, data.transactions, data.categories, month, today);
  const category = findCategory(data, e.categoryId);
  const left = daysLeft(ctx, month);
  const memory = { lastPeriod: monthPeriod(month, today), lastCategoryId: category?.id };
  const suggestions = ['Onde estou gastando mais?', 'Dicas para economizar', 'Vou fechar o mês no azul?'];

  if (category && category.kind === 'despesa') {
    const label = categoryLabel(category);
    const status = overview.items.find((i) => i.categoryId === category.id);
    if (!status) {
      const spent = sum(transactionsIn(data, monthPeriod(month, today), 'despesa', { categoryId: category.id }).map((t) => t.amount));
      const { average, suggested } = suggestedAmount(ctx, category, month);
      const target = suggested > 0 ? suggested : 0;
      const actions: AgentAction[] =
        target > 0
          ? [{ type: 'set_budget', label: `Definir ${formatBRL(target)} por mês`, categoryId: category.id, amount: target, month: null }]
          : [];
      return {
        text: sentences([
          `${label} ainda não tem orçamento.`,
          `Em ${long} você gastou ${formatBRL(spent)} nessa categoria${average > 0 ? `; sua média nos meses anteriores é ${formatBRL(average)}` : ''}.`,
          target > 0
            ? `Que tal um limite de ${formatBRL(target)} por mês? Assim você acompanha e recebe alertas antes de estourar.`
            : `Para criar um, diga por exemplo: “orçamento de 500 para ${category.name.toLowerCase()}”.`,
        ]),
        actions,
        suggestions: [`Orçamento de ${formatDecimal(target > 0 ? target : 50000)} para ${category.name}`, ...suggestions],
        memory,
      };
    }
    const parts: (string | null)[] = [
      `${label} em ${long}: ${money(status.spent)} de ${formatBRL(status.budgeted)} (${formatPercent(status.percent)}).`,
    ];
    if (status.status === 'estourado') {
      parts.push(`⛔ Passou do limite em ${formatBRL(status.spent - status.budgeted)}. Segure os gastos nessa categoria até o fim do mês ou ajuste o limite, se ele estiver irreal.`);
    } else {
      const perDay = left ? ` — cerca de ${formatBRL(Math.floor(status.remaining / left))} por dia até o fim do mês` : '';
      parts.push(`${status.status === 'alerta' ? '⚠️' : '✅'} Restam ${formatBRL(status.remaining)}${perDay}.`);
      if (left && status.projected > status.budgeted)
        parts.push(`No ritmo atual, deve fechar o mês em ${formatBRL(status.projected)} — acima do limite.`);
    }
    return {
      text: sentences(parts),
      cards: [{ type: 'progress', title: `Orçamento de ${category.name}`, items: [progressItem(status)] }],
      suggestions: [`Quanto gastei com ${category.name} este mês?`, ...suggestions],
      memory,
    };
  }

  if (overview.items.length === 0) {
    const sugs = consumptionSuggestions(ctx, month).slice(0, 3);
    const lines = sugs.map((s) => {
      const c = findCategory(data, s.categoryId);
      return `${categoryLabel(c)}: ${formatBRL(s.suggested)} (média de ${formatBRL(s.average)})`;
    });
    const actions: AgentAction[] = sugs.slice(0, 2).map((s) => ({
      type: 'set_budget',
      label: `Definir ${findCategory(data, s.categoryId)?.name ?? 'orçamento'}: ${formatBRL(s.suggested)}`,
      categoryId: s.categoryId,
      amount: s.suggested,
      month: null,
    }));
    return {
      text: paragraphs([
        'Você ainda não definiu orçamentos. Orçamento é um limite mensal por categoria — o jeito mais simples de gastar com intenção e receber alertas antes de estourar.',
        lines.length
          ? `Pelos seus últimos meses, eu começaria com:\n${bullets(lines)}`
          : 'Registre alguns gastos e eu sugiro valores com base no seu histórico. Ou já crie um, por exemplo: “orçamento de 800 para mercado”.',
      ]),
      actions: actions.length ? actions : [{ type: 'navigate', label: 'Ver orçamentos', to: ROUTES.budgets }],
      suggestions: [
        ...sugs.slice(0, 2).map((s) => `Orçamento de ${formatDecimal(s.suggested)} para ${findCategory(data, s.categoryId)?.name ?? ''}`),
        'Onde estou gastando mais?',
      ],
      memory,
    };
  }

  const over = overview.items.filter((i) => i.status === 'estourado');
  const alert = overview.items.filter((i) => i.status === 'alerta');
  const parts: (string | null)[] = [
    `Em ${long}, você usou ${money(overview.totalSpent)} de ${money(overview.totalBudgeted)} orçados (${formatPercent(overview.percent)}).`,
  ];
  if (over.length)
    parts.push(
      `⛔ ${over.length === 1 ? 'Estourado' : 'Estourados'}: ${joinList(over.map((i) => `${categoryLabel({ icon: i.icon, name: i.categoryName })} (+${formatBRL(i.spent - i.budgeted)})`))}.`,
    );
  if (alert.length)
    parts.push(
      `⚠️ Em alerta: ${joinList(alert.map((i) => `${categoryLabel({ icon: i.icon, name: i.categoryName })} (${formatPercent(i.percent)})`))}.`,
    );
  if (!over.length && !alert.length) parts.push('✅ Todos dentro do limite. 👏');
  if (overview.unbudgetedSpent > 0) parts.push(`Fora dos orçamentos, você gastou mais ${formatBRL(overview.unbudgetedSpent)}.`);
  if (over.length) {
    parts.push(`Para o restante do mês, reveja o limite de ${over[0].categoryName} ou corte gastos nessa categoria.`);
  } else if (left && overview.totalRemaining > 0) {
    parts.push(
      `Ritmo seguro: até ${formatBRL(Math.floor(overview.totalRemaining / left))} por dia somando as categorias com orçamento (${plural(left, 'dia restante', 'dias restantes')}).`,
    );
  }
  const card: AgentCard = { type: 'progress', title: `Orçamentos de ${long}`, items: overview.items.map(progressItem) };
  return { text: sentences(parts), cards: [card], suggestions, memory };
};

/** definir_orcamento */
export const setBudgetReply: Handler = (ctx) => {
  const { data, today, entities: e } = ctx;
  const category = validCategory(data, e.categoryId, 'despesa');
  if (!category) {
    const sugs = consumptionSuggestions(ctx, ctx.month).slice(0, 3);
    const fallback = ['Mercado', 'Restaurantes e delivery', 'Lazer'];
    const names = sugs.length ? sugs.map((s) => findCategory(data, s.categoryId)?.name ?? '') : fallback;
    return {
      text: sentences([
        e.amount ? `Para qual categoria é o orçamento de ${formatBRL(e.amount)}?` : 'Para qual categoria você quer definir um orçamento?',
        'Por exemplo: “orçamento de 800 para mercado”.',
      ]),
      suggestions: names
        .filter(Boolean)
        .map((n, i) => `Orçamento de ${formatDecimal(e.amount ?? sugs[i]?.suggested ?? 50000)} para ${n}`),
      memory: {},
    };
  }
  const label = categoryLabel(category);
  const targetMonth = e.budgetMonth ?? null;
  const refMonth = targetMonth ?? ctx.month;
  const { average, suggested } = suggestedAmount(ctx, category, refMonth);
  if (e.amount === undefined || e.amount <= 0) {
    return {
      text: sentences([
        `Qual valor você quer para ${label}?`,
        average > 0 ? `Sua média nos últimos 3 meses é ${formatBRL(average)} — um bom ponto de partida é ${formatBRL(suggested)}.` : null,
      ]),
      actions:
        suggested > 0
          ? [{ type: 'set_budget', label: `Definir ${formatBRL(suggested)}`, categoryId: category.id, amount: suggested, month: targetMonth }]
          : [],
      suggestions: suggested > 0 ? [`Orçamento de ${formatDecimal(suggested)} para ${category.name}`] : [],
      memory: { lastCategoryId: category.id },
    };
  }
  const amount = e.amount;
  const existing = resolveBudget(data.budgets, category.id, refMonth);
  const spent = sum(transactionsIn(data, monthPeriod(refMonth, today), 'despesa', { categoryId: category.id }).map((t) => t.amount));
  const scope = targetMonth ? `só para ${formatMonthLong(targetMonth)}` : 'vale para todos os meses';
  const parts: (string | null)[] = [
    `Combinado: orçamento de ${money(amount)} para ${label} (${scope}).`,
    existing && existing.amount !== amount ? `Hoje o limite é ${formatBRL(existing.amount)}.` : null,
    refMonth <= ctx.month
      ? `${refMonth === ctx.month ? 'Este mês' : `Em ${formatMonthLong(refMonth)}`} você já gastou ${formatBRL(spent)} nessa categoria (${formatPercent(spent / amount)} do novo limite).`
      : null,
  ];
  if (average > amount * 1.1)
    parts.push(`Sua média é ${formatBRL(average)}: para caber, será preciso cortar uns ${formatBRL(average - amount)} por mês.`);
  else if (average > 0 && average < amount * 0.7)
    parts.push(`Sua média é ${formatBRL(average)}, então o limite tem folga — dá para apertar um pouco e poupar a diferença.`);
  parts.push('Confirma?');
  return {
    text: sentences(parts),
    cards: [
      {
        type: 'progress',
        title: `Orçamento de ${category.name}`,
        items: [
          {
            label,
            current: spent,
            target: amount,
            tone: spent > amount ? 'negative' : spent >= amount * 0.8 ? 'warning' : 'positive',
          },
        ],
      },
    ],
    actions: [{ type: 'set_budget', label: 'Definir orçamento', categoryId: category.id, amount, month: targetMonth }],
    suggestions: ['Como está meu orçamento?', `Quanto gastei com ${category.name} este mês?`],
    memory: { lastCategoryId: category.id },
  };
};
