/**
 * Descrição limpa para lançamentos: remove verbo, valor, data, parcelas, conta e preposições nas pontas.
 */
import { fuzzyScore, overlapsAny, tokenize, type Span, type Token } from './text';

/** Tamanho máximo da descrição (cortada em limite de palavra). */
const MAX_DESCRIPTION = 60;

const VERB_WORDS = new Set([
  'gastei',
  'gastamos',
  'gastou',
  'gasto',
  'paguei',
  'pagamos',
  'pago',
  'pagou',
  'comprei',
  'compramos',
  'torrei',
  'desembolsei',
  'custou',
  'custaram',
  'saiu',
  'sairam',
  'deu',
  'foram',
  'foi',
  'abasteci',
  'assinei',
  'doei',
  'investi',
  'contratei',
  'emprestei',
  'dei',
  'perdi',
  'almocei',
  'jantei',
  'lanchei',
  'recebi',
  'recebemos',
  'ganhei',
  'ganhamos',
  'caiu',
  'cairam',
  'entrou',
  'entraram',
  'pagaram',
  'faturei',
  'rendeu',
  'renderam',
  'depositaram',
  'herdei',
  'reembolsaram',
  'estornaram',
  'devolveram',
  'fiz',
  'tive',
  'posso',
  'consigo',
  'gastar',
  'comprar',
  'pagar',
  'parcelar',
  'devo',
  'sera',
  'vale',
  'pena',
  'parcelado',
  'parcelada',
  'parcelei',
  'sem',
  'juros',
  'reais',
  'real',
  'conto',
  'contos',
  'pila',
  'pilas',
  'paus',
  'vendi',
  'vendemos',
  'mandei',
  'enviei',
  'transferi',
  'passei',
  'quanto',
  'qual',
  'se',
  'ainda',
  'eu',
  'recebo',
  'gastando',
  'comprando',
  'pagando',
  'torrando',
  'viajar',
]);
/** Verbos de lançamento cujos erros de digitação também saem da descrição ("gastie" => removido). */
const TYPO_VERBS = ['gastei', 'paguei', 'comprei', 'recebi', 'ganhei', 'transferi', 'gastamos', 'pagamos', 'compramos'];
/** Hora ("14h", "14h30"): não é descrição. */
const HOUR = /^\d{1,2}h(?:\d{2})?$/;

function isVerbOrTypo(w: string): boolean {
  if (VERB_WORDS.has(w)) return true;
  return w.length >= 5 && TYPO_VERBS.some((v) => Math.abs(v.length - w.length) <= 1 && fuzzyScore(w, v) >= 0.8);
}
/** Verbos que viram a descrição quando nada mais sobra ("almocei 35" => "Almoço"). */
export const VERB_NOUN: Record<string, string> = {
  almocei: 'Almoço',
  jantei: 'Jantar',
  lanchei: 'Lanche',
  abasteci: 'Combustível',
  doei: 'Doação',
  viajar: 'Viagem',
};
const EDGE_STOP = new Set([
  'no',
  'na',
  'nos',
  'nas',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'em',
  'o',
  'a',
  'os',
  'as',
  'um',
  'uma',
  'uns',
  'umas',
  'com',
  'pelo',
  'pela',
  'para',
  'pra',
  'pro',
  'por',
  'e',
  'que',
  'meu',
  'minha',
  'meus',
  'minhas',
  'num',
  'numa',
  'eu',
  'ja',
  'mais',
  'so',
  'la',
  'ai',
  'aqui',
  'isso',
  'este',
  'esse',
  'esta',
  'essa',
  'valor',
  'total',
  'agora',
  'tambem',
  'hj',
]);

/** Descrição limpa: sem verbo, valor, data, parcelas, conta e preposições nas pontas (grafia original preservada). */
export function buildDescription(
  raw: string,
  t: string,
  masks: Span[],
): { text: string | undefined; tokens: Token[] } {
  const toks = tokenize(t).filter(
    (tk) => !overlapsAny(tk, masks) && !isVerbOrTypo(tk.text) && !HOUR.test(tk.text) && /[a-z]/.test(tk.text),
  );
  let a = 0;
  let b = toks.length - 1;
  while (a <= b && EDGE_STOP.has(toks[a].text)) a++;
  while (b >= a && EDGE_STOP.has(toks[b].text)) b--;
  const kept = toks.slice(a, b + 1);
  let text = kept
    .map((tk) => raw.slice(tk.start, tk.end))
    .join(' ')
    .trim();
  if (text.length > MAX_DESCRIPTION) {
    const cut = text.slice(0, MAX_DESCRIPTION + 1);
    const space = cut.lastIndexOf(' ');
    text = (space > 0 ? cut.slice(0, space) : cut.slice(0, MAX_DESCRIPTION)).trim();
  }
  return { text: text || undefined, tokens: kept };
}
