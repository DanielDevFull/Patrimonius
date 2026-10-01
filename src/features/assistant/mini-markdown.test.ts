import { describe, expect, it } from 'vitest';
import { inlineToPlainText, parseInline, parseMiniMarkdown, type InlineNode } from './mini-markdown';

const text = (t: string): InlineNode => ({ type: 'text', text: t });
const money = (t: string): InlineNode => ({ type: 'money', text: t });

describe('parseInline', () => {
  it('reconhece **negrito** e mantém o texto ao redor', () => {
    expect(parseInline('Olá **Ana**, tudo bem?')).toEqual([
      text('Olá '),
      { type: 'bold', children: [text('Ana')] },
      text(', tudo bem?'),
    ]);
  });

  it('negrito sem par, vazio ou com espaços nas pontas fica literal', () => {
    expect(parseInline('**abc')).toEqual([text('**abc')]);
    expect(parseInline('a ** b')).toEqual([text('a ** b')]);
    expect(parseInline('****')).toEqual([text('****')]);
    expect(inlineToPlainText(parseInline('** x ** fim'))).toBe('** x ** fim');
    expect(parseInline('** x ** fim').some((n) => n.type === 'bold')).toBe(false);
  });

  it('marca valores em reais (inclusive dentro do negrito) sem engolir a pontuação', () => {
    expect(parseInline('Saldo de **R$ 1.234,56** e -R$ 50,00.')).toEqual([
      text('Saldo de '),
      { type: 'bold', children: [money('R$ 1.234,56')] },
      text(' e '),
      money('-R$ 50,00'),
      text('.'),
    ]);
    expect(parseInline('R$ 1,2 mi no total')).toEqual([money('R$ 1,2 mi'), text(' no total')]);
    expect(parseInline('+R$ 10,00')).toEqual([money('+R$ 10,00')]);
    expect(parseInline('R$ 1234,5')).toEqual([money('R$ 1234,5')]);
    expect(parseInline('R$ 300,00')).toEqual([money('R$ 300,00')]);
  });

  it('nunca interpreta HTML: tags aparecem como texto', () => {
    const nodes = parseInline('<b>x</b> <script>alert(1)</script>');
    expect(nodes).toEqual([text('<b>x</b> <script>alert(1)</script>')]);
  });

  it('vários negritos na mesma linha', () => {
    expect(inlineToPlainText(parseInline('**a** e **b**'))).toBe('a e b');
    expect(parseInline('**a** e **b**').filter((n) => n.type === 'bold')).toHaveLength(2);
  });
});

describe('parseMiniMarkdown', () => {
  it('separa parágrafos por linha em branco e preserva quebras simples', () => {
    const blocks = parseMiniMarkdown('Linha 1\nLinha 2\n\nOutro parágrafo');
    expect(blocks).toEqual([
      { type: 'paragraph', lines: [[text('Linha 1')], [text('Linha 2')]] },
      { type: 'paragraph', lines: [[text('Outro parágrafo')]] },
    ]);
  });

  it("agrupa linhas iniciadas por '• ' ou '- ' em listas", () => {
    const blocks = parseMiniMarkdown('Veja:\n• **Registrar** gastos\n- Consultas\nDepois do item');
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toEqual({ type: 'paragraph', lines: [[text('Veja:')]] });
    expect(blocks[1].type).toBe('list');
    if (blocks[1].type !== 'list') throw new Error('esperava lista');
    expect(blocks[1].items.map(inlineToPlainText)).toEqual(['Registrar gastos', 'Consultas']);
    expect(blocks[1].items[0][0]).toEqual({ type: 'bold', children: [text('Registrar')] });
    expect(blocks[2]).toEqual({ type: 'paragraph', lines: [[text('Depois do item')]] });
  });

  it('valor negativo no começo da linha não vira item de lista', () => {
    const blocks = parseMiniMarkdown('-R$ 50,00 de saldo');
    expect(blocks).toEqual([{ type: 'paragraph', lines: [[money('-R$ 50,00'), text(' de saldo')]] }]);
  });

  it('linha em branco encerra a lista; CRLF e espaços extras são tolerados', () => {
    const blocks = parseMiniMarkdown('• a\r\n• b  \r\n\r\n\r\n• c');
    expect(blocks.map((b) => b.type)).toEqual(['list', 'list']);
    expect(parseMiniMarkdown('   \n\n')).toEqual([]);
    expect(parseMiniMarkdown('')).toEqual([]);
  });
});
