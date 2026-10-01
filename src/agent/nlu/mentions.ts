/**
 * Menções de contas no texto ("no cartão nubank", "da corrente", "pra poupança") e contas padrão de transferência.
 */
import type { Account } from '@/domain/types';
import { rankAccounts, significantAccountTokens } from './entities';
import { tokenize, type Span } from './text';

const STRONG_ACCOUNT_WORDS = new Set([
  'cartao',
  'credito',
  'debito',
  'corrente',
  'poupanca',
  'carteira',
  'dinheiro',
  'especie',
  'pix',
  'cc',
  'fatura',
  'investimento',
  'investimentos',
  'corretora',
]);
const WEAK_ACCOUNT_WORDS = new Set(['conta', 'contas', 'banco']);
export const CONNECTORS = new Set(['de', 'do', 'da']);
const DEST_PREPS = new Set(['para', 'pra', 'pro', 'na', 'no', 'nas', 'nos', 'ate', 'p']);
const ORIGIN_PREPS = new Set(['da', 'do', 'de', 'das', 'dos', 'desde']);
const OTHER_PREPS = new Set(['pelo', 'pela', 'com', 'via', 'em', 'usando', 'no', 'na']);
const ARTICLES = new Set(['a', 'o', 'as', 'os', 'minha', 'meu', 'minhas', 'meus']);

export interface AccountMention {
  /** Trecho a remover da descrição (inclui a preposição). */
  span: Span;
  role: 'origem' | 'destino' | 'neutro';
  /** Melhor conta para a menção (se houver). */
  account: { accountId: string; confidence: number } | null;
}

/**
 * Encontra trechos como "no cartão nubank", "da corrente", "pra poupança", "em dinheiro".
 * Precisa de pelo menos uma palavra forte (tipo de conta ou palavra do nome de uma conta): "conta de luz" não é conta.
 */
export function findAccountMentions(t: string, accounts: Account[]): AccountMention[] {
  const nameTokens = new Set(accounts.filter((a) => !a.archived).flatMap(significantAccountTokens));
  const toks = tokenize(t);
  const strong = (w: string) => STRONG_ACCOUNT_WORDS.has(w) || nameTokens.has(w);
  const weak = (w: string) => WEAK_ACCOUNT_WORDS.has(w);
  const out: AccountMention[] = [];
  let i = 0;
  while (i < toks.length) {
    if (!strong(toks[i].text) && !weak(toks[i].text)) {
      i++;
      continue;
    }
    let j = i;
    let hasStrong = false;
    let last = i;
    while (j < toks.length) {
      const w = toks[j].text;
      if (strong(w) || weak(w)) {
        hasStrong ||= strong(w);
        last = j;
        j++;
      } else if (CONNECTORS.has(w) && toks[j + 1] && (strong(toks[j + 1].text) || weak(toks[j + 1].text))) {
        j++;
      } else break;
    }
    if (hasStrong) {
      let k = i - 1;
      while (k >= 0 && ARTICLES.has(toks[k].text)) k--;
      const prep = k >= 0 ? toks[k].text : '';
      const role = DEST_PREPS.has(prep) ? 'destino' : ORIGIN_PREPS.has(prep) ? 'origem' : 'neutro';
      const hasPrep = DEST_PREPS.has(prep) || ORIGIN_PREPS.has(prep) || OTHER_PREPS.has(prep);
      const span = { start: toks[hasPrep ? k : i].start, end: toks[last].end };
      out.push({ span, role, account: rankAccounts(t.slice(span.start, span.end), accounts)[0] ?? null });
    }
    i = last + 1;
  }
  return out;
}

export function bestMentionAccount(
  mentions: AccountMention[],
): { accountId: string; confidence: number } | null {
  let best: { accountId: string; confidence: number } | null = null;
  for (const m of mentions)
    if (m.account && (!best || m.account.confidence > best.confidence)) best = m.account;
  return best;
}

/** Conta de origem padrão: a primeira conta corrente (ou, sem ela, a primeira conta que não é cartão). */
export function defaultSource(accounts: Account[], exclude?: string): string | undefined {
  const pool = accounts.filter((a) => !a.archived && a.id !== exclude);
  return (pool.find((a) => a.type === 'corrente') ?? pool.find((a) => a.type !== 'cartao_credito'))?.id;
}
