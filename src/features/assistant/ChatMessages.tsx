import { Bot } from 'lucide-react';
import type { ChatMessage, FinanceData, ISODate } from '@/domain/types';
import { cn } from '@/components/ui';
import { AgentCardView } from './AgentCards';
import { ChatActions, type ChatActionHandlers } from './ChatActions';
import { formatMessageTime, type AgentMessagePayload } from './chat-utils';
import { RichText, UserText } from './RichText';

/** Avatar do agente. */
export function PatAvatar({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-brand-700 text-white shadow-sm ring-2 ring-white dark:bg-brand-600 dark:ring-slate-900',
        size === 'lg' ? 'size-10' : 'size-8',
      )}
    >
      <Bot size={size === 'lg' ? 22 : 18} />
    </span>
  );
}

function MessageTime({ createdAt, today, align }: { createdAt: string; today: ISODate; align: 'left' | 'right' }) {
  const label = formatMessageTime(createdAt, today);
  if (!label) return null;
  return (
    <time
      dateTime={createdAt}
      className={cn('block px-1 text-[11px] text-slate-500 dark:text-slate-400', align === 'right' && 'text-right')}
    >
      {label}
    </time>
  );
}

export interface MessageItemProps {
  message: ChatMessage;
  /** Payload validado (mensagens do agente) ou null. */
  payload: AgentMessagePayload | null;
  agentName: string;
  data: FinanceData;
  today: ISODate;
  handlers: ChatActionHandlers;
  /** Sugestões clicáveis (só na última resposta do agente). */
  suggestions?: string[];
  onSuggestion: (text: string) => void;
  suggestionsDisabled?: boolean;
}

/** Uma mensagem da conversa (balão do usuário à direita; do agente à esquerda, com avatar, cards e ações). */
export function MessageItem({
  message,
  payload,
  agentName,
  data,
  today,
  handlers,
  suggestions,
  onSuggestion,
  suggestionsDisabled,
}: MessageItemProps) {
  if (message.role === 'user') {
    return (
      <li className="flex justify-end">
        <div className="flex max-w-[85%] flex-col items-end gap-1">
          <p className="sr-only">Você disse:</p>
          <div className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-brand-700 px-3.5 py-2 text-sm text-white shadow-sm">
            <UserText text={message.text} />
          </div>
          <MessageTime createdAt={message.createdAt} today={today} align="right" />
        </div>
      </li>
    );
  }

  const cards = payload?.reply.cards ?? [];
  return (
    <li className="flex items-start gap-2">
      <PatAvatar />
      <div className="flex min-w-0 max-w-[calc(100%-2.5rem)] flex-1 flex-col gap-2 sm:max-w-[85%]">
        <p className="sr-only">{agentName} disse:</p>
        <div className="self-start rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-2.5 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100">
          <RichText text={message.text} />
        </div>
        {cards.length > 0 && (
          <div className="grid grid-cols-1 gap-2">
            {cards.map((card, i) => (
              <AgentCardView key={`${card.type}-${i}`} card={card} />
            ))}
          </div>
        )}
        {payload && <ChatActions payload={payload} data={data} today={today} handlers={handlers} />}
        {suggestions && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Sugestões de perguntas">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={suggestionsDisabled}
                onClick={() => onSuggestion(s)}
                className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-left text-sm font-medium text-brand-800 transition-colors hover:bg-brand-100 disabled:opacity-50 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300 dark:hover:bg-brand-900"
              >
                <UserText text={s} />
              </button>
            ))}
          </div>
        )}
        <MessageTime createdAt={message.createdAt} today={today} align="left" />
      </div>
    </li>
  );
}

/** Indicador "Pat está digitando…". */
export function TypingIndicator({ agentName }: { agentName: string }) {
  return (
    <li className="flex items-center gap-2">
      <PatAvatar />
      <div className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-2.5 dark:bg-slate-800">
        <span className="flex gap-1" aria-hidden>
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="size-1.5 rounded-full bg-slate-400 motion-safe:animate-bounce dark:bg-slate-500"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">{agentName} está digitando…</span>
      </div>
    </li>
  );
}
