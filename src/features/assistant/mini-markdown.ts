/**
 * Mini-markdown SEGURO para as mensagens do agente.
 *
 * Suporta apenas o que o Pat escreve: **negrito**, quebras de linha, parágrafos (linha em branco) e listas
 * (linhas iniciadas por '• ' ou '- '). Valores em reais ('R$ 1.234,56') viram trechos `money`, para serem
 * borrados no modo "ocultar valores". O resultado é uma árvore de dados convertida em nós React
 * (nunca HTML): qualquer '<b>' ou '<script>' no texto aparece literalmente.
 */

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'money'; text: string }
  | { type: 'bold'; children: InlineNode[] };

export type Block =
  /** Linhas de um parágrafo (quebras de linha simples são preservadas). */
  | { type: 'paragraph'; lines: InlineNode[][] }
  | { type: 'list'; items: InlineNode[][] };

/** 'R$ 1.234,56', '-R$ 50,00', '+R$ 10,00', 'R$ 1234,5', 'R$ 1,2 mi', 'R$ 3 mil'. */
const MONEY_RE = /[+-]?R\$\s?\d+(?:\.\d{3})*(?:,\d+)?(?:\s(?:mil|mi|bi|tri)\b)?/g;
const BOLD_RE = /\*\*(.+?)\*\*/g;
const LIST_RE = /^\s*[•-]\s+(.*)$/;

/** Separa valores em reais do texto comum. */
function splitMoney(text: string): InlineNode[] {
  const out: InlineNode[] = [];
  let last = 0;
  for (const match of text.matchAll(MONEY_RE)) {
    const start = match.index ?? 0;
    if (start > last) out.push({ type: 'text', text: text.slice(last, start) });
    out.push({ type: 'money', text: match[0] });
    last = start + match[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

/** Converte uma linha em nós inline: **negrito** (sem aninhamento) e valores em reais. '**' sem par fica literal. */
export function parseInline(text: string): InlineNode[] {
  const out: InlineNode[] = [];
  let last = 0;
  for (const match of text.matchAll(BOLD_RE)) {
    const start = match.index ?? 0;
    const inner = match[1];
    // '** texto **' com espaços nas pontas não é negrito em markdown — mantém literal.
    if (inner.trim() !== inner || inner.trim() === '') continue;
    if (start > last) out.push(...splitMoney(text.slice(last, start)));
    out.push({ type: 'bold', children: splitMoney(inner) });
    last = start + match[0].length;
  }
  if (last < text.length) out.push(...splitMoney(text.slice(last)));
  return out;
}

/** Converte o texto completo em blocos (parágrafos e listas). */
export function parseMiniMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };
  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trimEnd();
    if (line.trim() === '') {
      flush();
      continue;
    }
    const item = LIST_RE.exec(line);
    if (item) {
      if (current?.type !== 'list') {
        flush();
        current = { type: 'list', items: [] };
      }
      current.items.push(parseInline(item[1]));
    } else {
      if (current?.type !== 'paragraph') {
        flush();
        current = { type: 'paragraph', lines: [] };
      }
      current.lines.push(parseInline(line.trim()));
    }
  }
  flush();
  return blocks;
}

/** Texto puro (sem marcações) de nós inline — útil para rótulos acessíveis e testes. */
export function inlineToPlainText(nodes: InlineNode[]): string {
  return nodes.map((n) => (n.type === 'bold' ? inlineToPlainText(n.children) : n.text)).join('');
}
