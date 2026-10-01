/** Handlers de registro: despesa, receita e transferência (sempre como AÇÃO PROPOSTA, o usuário confirma). */
import { budgetStatuses } from '@/analytics';
import { ROUTES } from '@/app/navigation';
import { monthKey } from '@/domain/dates';
import { CATEGORY_IDS } from '@/domain/defaults';
import { formatBRL, formatPercent, splitCents } from '@/domain/money';
import type { Account, Category, CategoryKind, FinanceData } from '@/domain/types';
import { suggestCategory } from '../categorizer';
import {
  accountPhrase,
  capitalizeDescription,
  categoryLabel,
  dateRelative,
  sentences,
} from '../format';
import type { AgentCard, TransactionDraft } from '../types';
import {
  activeAccounts,
  findAccount,
  validCategory,
  type Handler,
  type HandlerOutput,
  type TurnContext,
} from './context';

export const VALUE_QUESTION = 'Qual foi o valor?';

const KIND_LABEL: Record<CategoryKind, string> = { despesa: 'despesa', receita: 'receita' };

/** Resposta padrão quando não há contas para lançar. */
export function noAccountsReply(what: string): HandlerOutput {
  return {
    text: `Para registrar ${what}, primeiro cadastre uma conta — conta corrente, carteira ou cartão de crédito. Leva menos de um minuto e aí eu cuido do resto!`,
    actions: [{ type: 'navigate', label: 'Cadastrar conta', to: ROUTES.accounts }],
    suggestions: ['O que você sabe fazer?', 'Dicas para economizar'],
  };
}

function resolveCategory(ctx: TurnContext, kind: CategoryKind): Category | undefined {
  const { data, entities } = ctx;
  const fromEntity = validCategory(data, entities.categoryId, kind);
  if (fromEntity) return fromEntity;
  if (!entities.description) return undefined;
  const suggestion = suggestCategory(entities.description, kind, data.categories, data.transactions);
  return validCategory(data, suggestion?.categoryId, kind);
}

/** Categoria "Outras despesas/receitas" (ou a primeira válida) quando nada foi reconhecido. */
function fallbackCategory(data: FinanceData, kind: CategoryKind): Category | undefined {
  const preferred = kind === 'despesa' ? CATEGORY_IDS.outrosDespesa : CATEGORY_IDS.outrosReceita;
  return validCategory(data, preferred, kind) ?? data.categories.find((c) => c.kind === kind && !c.archived);
}

/**
 * Conta do lançamento: a citada; senão o cartão de crédito se a mensagem falou em cartão (despesa);
 * senão a única conta adequada (despesa: qualquer uma exceto investimento; receita: exceto cartão); senão nenhuma.
 */
function resolveAccount(ctx: TurnContext, kind: CategoryKind): Account | undefined {
  const { data, entities, parsed } = ctx;
  const cited = findAccount(data, entities.accountId);
  if (cited && !cited.archived) return cited;
  const accounts = activeAccounts(data);
  if (kind === 'despesa' && /\b(cartao|credito)\b/.test(parsed.normalized)) {
    const card = accounts.find((a) => a.type === 'cartao_credito');
    if (card) return card;
  }
  const suitable = accounts.filter((a) =>
    kind === 'despesa' ? a.type !== 'investimento' : a.type !== 'cartao_credito',
  );
  return suitable.length === 1 ? suitable[0] : undefined;
}

/** Frase e card sobre o impacto da despesa no orçamento da categoria (quando houver orçamento). */
function budgetImpact(
  ctx: TurnContext,
  category: Category,
  date: string,
  firstPayment: number,
): { sentence: string; card: AgentCard } | null {
  const month = monthKey(date);
  const status = budgetStatuses(ctx.data.budgets, ctx.data.transactions, ctx.data.categories, month, ctx.today).find(
    (s) => s.categoryId === category.id,
  );
  if (!status || status.budgeted <= 0) return null;
  const after = status.spent + firstPayment;
  const ratio = after / status.budgeted;
  let sentence: string;
  if (after > status.budgeted)
    sentence = `⚠️ Com ela, ${category.name} passa do orçamento: ${formatBRL(after)} de ${formatBRL(status.budgeted)}.`;
  else if (ratio >= 0.8)
    sentence = `Com ela, você chega a ${formatPercent(ratio)} do orçamento de ${category.name} (${formatBRL(after)} de ${formatBRL(status.budgeted)}).`;
  else sentence = `Com ela, você usa ${formatPercent(ratio)} do orçamento de ${category.name}.`;
  return {
    sentence,
    card: {
      type: 'progress',
      title: 'Orçamento do mês',
      items: [
        {
          label: categoryLabel(category),
          current: after,
          target: status.budgeted,
          hint: `Depois deste lançamento: ${formatPercent(ratio)}`,
          tone: after > status.budgeted ? 'negative' : ratio >= 0.8 ? 'warning' : 'positive',
        },
      ],
    },
  };
}

/** registrar_despesa / registrar_receita */
export const registerFlow: Handler = (ctx) => {
  const kind: CategoryKind = ctx.intent === 'registrar_receita' ? 'receita' : 'despesa';
  const { data, today, entities: e } = ctx;
  if (activeAccounts(data).length === 0) return noAccountsReply(kind === 'despesa' ? 'despesas' : 'receitas');

  const category = resolveCategory(ctx, kind);
  const account = resolveAccount(ctx, kind);
  const amount = e.amount;
  if (amount === undefined || amount <= 0) {
    return {
      text: `Certo, vou registrar uma ${KIND_LABEL[kind]}${category ? ` em ${categoryLabel(category)}` : ''}. ${VALUE_QUESTION}`,
      memory: { lastCategoryId: category?.id, lastAccountId: account?.id },
    };
  }

  const draftCategory = category ?? fallbackCategory(data, kind);
  const installments = kind === 'despesa' ? Math.max(1, Math.floor(e.installments ?? 1)) : 1;
  const firstPayment = splitCents(amount, installments)[0];
  const date = e.date ?? today;
  const status = date > today ? 'pendente' : 'pago';
  const description = capitalizeDescription(
    e.description ?? draftCategory?.name ?? (kind === 'despesa' ? 'Despesa' : 'Receita'),
  );
  const draft: TransactionDraft = {
    type: kind,
    amount,
    date,
    description,
    categoryId: draftCategory?.id ?? null,
    accountId: account?.id ?? null,
    toAccountId: null,
    status,
    installments,
  };

  const what =
    installments > 1
      ? `compra parcelada de ${formatBRL(amount)} (${installments}x de ${formatBRL(firstPayment)})`
      : `${KIND_LABEL[kind]} de ${formatBRL(amount)}`;
  const when = installments > 1 ? `1ª parcela ${dateRelative(date, today)}` : dateRelative(date, today);
  const head = `Entendi: ${what} em ${categoryLabel(draftCategory)}, ${when}${account ? `, ${accountPhrase(account)}` : ''}.`;
  const impact = kind === 'despesa' && draftCategory ? budgetImpact(ctx, draftCategory, date, firstPayment) : null;

  const text = sentences([
    head,
    category ? null : `Não reconheci a categoria, então usei ${draftCategory?.name ?? 'nenhuma'} — dá para trocar antes de confirmar.`,
    account ? null : 'Em qual conta? Escolha antes de confirmar.',
    status === 'pendente' ? 'Como a data ainda não chegou, ele fica como pendente.' : null,
    impact?.sentence,
    'Confirma?',
  ]);

  const suggestions =
    kind === 'despesa'
      ? [
          draftCategory ? `Quanto gastei com ${draftCategory.name} este mês?` : 'Quanto gastei este mês?',
          'Como está meu orçamento?',
          'Qual meu saldo?',
        ]
      : ['Quanto ganhei este mês?', 'Resumo do mês', 'Qual meu saldo?'];

  return {
    text,
    cards: impact ? [impact.card] : [],
    actions: [
      { type: 'create_transaction', label: kind === 'despesa' ? 'Registrar despesa' : 'Registrar receita', draft },
    ],
    suggestions,
    memory: { lastCategoryId: draftCategory?.id, lastAccountId: account?.id },
  };
};

/** registrar_transferencia */
export const transferFlow: Handler = (ctx) => {
  const { data, today, entities: e } = ctx;
  const accounts = activeAccounts(data);
  if (accounts.length === 0) return noAccountsReply('transferências');
  if (e.amount === undefined || e.amount <= 0) {
    return { text: `Certo, uma transferência. ${VALUE_QUESTION}`, memory: { lastAccountId: e.accountId } };
  }
  if (accounts.length < 2) {
    return {
      text: 'Para transferir, você precisa de pelo menos duas contas cadastradas (por exemplo, conta corrente e poupança).',
      actions: [{ type: 'navigate', label: 'Cadastrar conta', to: ROUTES.accounts }],
      suggestions: ['Qual meu saldo?'],
    };
  }
  const from = accounts.find((a) => a.id === e.accountId);
  const to = accounts.find((a) => a.id === e.toAccountId && a.id !== from?.id);
  const isInvoice = to?.type === 'cartao_credito';
  const date = e.date ?? today;
  const draft: TransactionDraft = {
    type: 'transferencia',
    amount: e.amount,
    date,
    description: isInvoice ? `Pagamento da fatura ${to.name}` : to ? `Transferência para ${to.name}` : 'Transferência',
    categoryId: null,
    accountId: from?.id ?? null,
    toAccountId: to?.id ?? null,
    status: date > today ? 'pendente' : 'pago',
    installments: 1,
  };
  const missing = [from ? null : 'origem', to ? null : 'destino'].filter((m): m is string => m !== null);
  const route = `${from ? ` de ${from.name}` : ''}${to ? ` para ${to.name}` : ''}`;
  const text = sentences([
    `Entendi: ${isInvoice ? 'pagamento de fatura' : 'transferência'} de ${formatBRL(e.amount)}${route}, ${dateRelative(date, today)}.`,
    missing.length ? `Escolha a conta de ${missing.join(' e de ')} antes de confirmar.` : null,
    isInvoice ? 'Pagar a fatura inteira evita os juros do rotativo, que estão entre os mais altos do mercado.' : null,
    'Confirma?',
  ]);
  return {
    text,
    actions: [{ type: 'create_transaction', label: 'Registrar transferência', draft }],
    suggestions: ['Qual meu saldo?', 'Contas a pagar', 'Vou fechar o mês no azul?'],
    memory: { lastAccountId: from?.id },
  };
};
