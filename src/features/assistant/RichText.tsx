import { Fragment, useMemo, type ReactNode } from 'react';
import { cn } from '@/components/ui';
import { splitUserMoneyText } from './chat-utils';
import { parseInline, parseMiniMarkdown, type InlineNode } from './mini-markdown';

function renderInline(nodes: InlineNode[], keyPrefix = ''): ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}${i}`;
    if (node.type === 'bold') {
      return (
        <strong key={key} className="font-semibold text-slate-900 dark:text-white">
          {renderInline(node.children, `${key}.`)}
        </strong>
      );
    }
    if (node.type === 'money') {
      return (
        <span key={key} className="money tabular whitespace-nowrap">
          {node.text}
        </span>
      );
    }
    return <Fragment key={key}>{node.text}</Fragment>;
  });
}

/** Uma linha de texto do agente com **negrito** e valores em reais marcados (sem blocos). */
export function InlineText({ text }: { text: string }) {
  const nodes = useMemo(() => parseInline(text), [text]);
  return <>{renderInline(nodes)}</>;
}

/**
 * Texto livre (mensagem digitada pelo usuário, sugestão de pergunta) sem markdown, com os valores marcados com
 * `.money` — '1.250', '6 mil', 'R$ 50' — para o modo "ocultar valores" borrá-los como nas respostas do agente.
 */
export function UserText({ text }: { text: string }) {
  const parts = useMemo(() => splitUserMoneyText(text), [text]);
  return (
    <>
      {parts.map((part, i) =>
        part.money ? (
          <span key={i} className="money tabular">
            {part.text}
          </span>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * Texto do agente com mini-markdown seguro: parágrafos, quebras de linha, listas ('• ' / '- ') e **negrito**.
 * Tudo vira nós React (texto escapado) — nada de HTML vindo do conteúdo.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseMiniMarkdown(text), [text]);
  return (
    <div className={cn('space-y-2 break-words', className)}>
      {blocks.map((block, bi) =>
        block.type === 'list' ? (
          <ul key={bi} className="space-y-1">
            {block.items.map((item, ii) => (
              <li key={ii} className="flex gap-2">
                <span aria-hidden className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-brand-600 dark:bg-brand-400" />
                <span className="min-w-0">{renderInline(item)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={bi}>
            {block.lines.map((line, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(line)}
              </Fragment>
            ))}
          </p>
        ),
      )}
    </div>
  );
}
