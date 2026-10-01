/** Gastos fixos e assinaturas (recorrências cadastradas + candidatas detectadas). */
import { averageMonthlyIncome, detectRecurringCandidates } from '@/analytics';
import { ROUTES } from '@/app/navigation';
import { formatDateBR } from '@/domain/dates';
import { CATEGORY_IDS } from '@/domain/defaults';
import { formatBRL, formatPercent } from '@/domain/money';
import { plural } from '@/domain/text';
import { FREQUENCY_LABELS } from '@/domain/types';
import { joinList, money, monthlyEquivalent, sentences } from '../format';
import type { AgentCard } from '../types';
import { sum, type Handler } from './context';

/** assinaturas */
export const subscriptionsReply: Handler = (ctx) => {
  const { data, today, month } = ctx;
  const rules = data.recurring
    .filter((r) => r.active && r.type === 'despesa')
    .map((r) => ({ rule: r, monthly: monthlyEquivalent(r.amount, r.frequency) }))
    .sort((a, b) => b.monthly - a.monthly || a.rule.description.localeCompare(b.rule.description, 'pt-BR'));
  const candidates = detectRecurringCandidates(data, today).filter((c) => c.type === 'despesa');
  if (rules.length === 0 && candidates.length === 0) {
    return {
      text: 'Você ainda não tem gastos fixos cadastrados. Cadastre em Recorrências o que se repete (aluguel, internet, streaming, academia) para eu prever suas contas e avisar antes do vencimento.',
      actions: [{ type: 'navigate', label: 'Cadastrar recorrências', to: ROUTES.recurring }],
      suggestions: ['Contas a pagar', 'Onde estou gastando mais?'],
    };
  }
  const fixedTotal = sum(rules.map((r) => r.monthly));
  const subs = rules.filter((r) => r.rule.categoryId === CATEGORY_IDS.assinaturas);
  const subsCandidates = candidates.filter((c) => c.categoryId === CATEGORY_IDS.assinaturas);
  const subsTotal = sum(subs.map((r) => r.monthly)) + sum(subsCandidates.map((c) => c.amount));
  const recorded = averageMonthlyIncome(data.transactions, month, 3);
  const income = recorded > 0 ? recorded : (data.settings.monthlyIncomeEstimate ?? 0);
  const parts: (string | null)[] = [];
  if (rules.length)
    parts.push(
      `Seus gastos fixos cadastrados somam ${money(fixedTotal)} por mês (${plural(rules.length, 'item', 'itens')})${income > 0 ? ` — ${formatPercent(fixedTotal / income)} da sua renda` : ''}.`,
    );
  if (subsTotal > 0)
    parts.push(
      `Só as assinaturas (streaming, apps, academia…) custam ${formatBRL(subsTotal)} por mês — ${formatBRL(subsTotal * 12)} por ano.`,
    );
  if (candidates.length) {
    const names = candidates.slice(0, 3).map((c) => `${c.description} (${formatBRL(c.amount)})`);
    if (candidates.length > 3) names.push(`mais ${candidates.length - 3}`);
    parts.push(
      `Também encontrei ${plural(candidates.length, 'gasto', 'gastos')} que se ${candidates.length === 1 ? 'repete' : 'repetem'} todo mês e ainda não ${candidates.length === 1 ? 'está cadastrado' : 'estão cadastrados'}: ${joinList(names)}.`,
    );
  }
  parts.push(
    subsTotal > 0
      ? 'Dica: revise as assinaturas que você pouco usa — cada uma cancelada vira economia todo mês.'
      : 'Dica: renegociar contas fixas (internet, celular, seguros) uma vez por ano costuma render bons descontos.',
  );
  const cards: AgentCard[] = [];
  if (rules.length)
    cards.push({
      type: 'list',
      title: 'Gastos fixos',
      items: rules.slice(0, 8).map(({ rule, monthly }) => ({
        label: rule.description,
        value: `${formatBRL(monthly)}/mês`,
        hint: `${FREQUENCY_LABELS[rule.frequency]} · próxima em ${formatDateBR(rule.nextDate)}`,
      })),
    });
  if (candidates.length)
    cards.push({
      type: 'list',
      title: 'Parecem recorrentes',
      items: candidates.slice(0, 5).map((c) => ({
        label: c.description,
        value: formatBRL(c.amount),
        hint: `${plural(c.occurrences, 'vez', 'vezes')} · último em ${formatDateBR(c.lastDate)}`,
        tone: 'warning',
      })),
    });
  return {
    text: sentences(parts),
    cards,
    actions: [{ type: 'navigate', label: 'Ver recorrências', to: ROUTES.recurring }],
    suggestions: ['Contas a pagar', 'Dicas para economizar', 'Vou fechar o mês no azul?'],
  };
};
