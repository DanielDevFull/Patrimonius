import { ChevronDown, Lightbulb, MessageCircleQuestion, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { generateInsights, type TransactionDraft } from '@/agent';
import { Badge, Button, Card, CardHeader, cn, IconButton, Modal, Spinner } from '@/components/ui';
import { useChatMessages, useFinanceData, useToday } from '@/db/hooks';
import { monthKey } from '@/domain/dates';
import type { ChatMessage, FinanceData, ISODate } from '@/domain/types';
import { TransactionFormModal, type TransactionFormInitial } from '@/features/transactions/TransactionForm';
import { ExamplesList, InsightsList } from './AssistantPanels';
import type { ChatActionHandlers, ChosenAccounts } from './ChatActions';
import { MessageItem, PatAvatar, TypingIndicator } from './ChatMessages';
import { Composer } from './Composer';
import {
  agentNameOf,
  draftToInitial,
  draftToInput,
  readAgentPayload,
  type AgentMessagePayload,
} from './chat-utils';
import { useAssistantChat } from './useAssistantChat';

/** Quantos insights aparecem na coluna do Pat. */
const MAX_INSIGHTS = 6;

interface EditingState {
  message: ChatMessage;
  payload: AgentMessagePayload;
  index: number;
  initial: TransactionFormInitial;
}

/** Tela do assistente: conversa com o agente local (Pat), insights e exemplos de perguntas. */
export default function AssistantPage() {
  const data = useFinanceData();
  const messages = useChatMessages();
  const today = useToday();
  if (!data || !messages) return <Spinner />;
  return <AssistantView data={data} messages={messages} today={today} />;
}

interface ViewProps {
  data: FinanceData;
  messages: ChatMessage[];
  today: ISODate;
}

function AssistantView({ data, messages, today }: ViewProps) {
  const chat = useAssistantChat({ data, messages, today });
  const agent = agentNameOf(data);
  const month = monthKey(today);
  const insights = useMemo(() => generateInsights(data, today).slice(0, MAX_INSIGHTS), [data, today]);
  const items = useMemo(
    () => messages.map((m) => ({ message: m, payload: m.role === 'agent' ? readAgentPayload(m.payload) : null })),
    [messages],
  );
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const insightsRegionId = useId();
  const typing = chat.typing;

  // Rolagem automática para a última mensagem.
  const lastId = messages.at(-1)?.id;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastId, typing]);

  function ask(text: string) {
    void chat.send(text);
  }

  function handlersFor(message: ChatMessage, payload: AgentMessagePayload): ChatActionHandlers {
    return {
      busyIndex: chat.busy?.messageId === message.id ? chat.busy.index : null,
      locked: chat.busy !== null,
      onConfirmTransaction: (index: number, draft: TransactionDraft, accounts: ChosenAccounts) =>
        void chat.confirmTransaction(message, payload, index, draftToInput(draft, accounts)),
      onEditTransaction: (index: number, draft: TransactionDraft, accounts: Partial<ChosenAccounts>) =>
        setEditing({
          message,
          payload,
          index,
          initial: draftToInitial(draft, {
            accountId: accounts.accountId,
            toAccountId: accounts.toAccountId ?? undefined,
          }),
        }),
      onCancel: (index: number) => void chat.cancelAction(message, payload, index),
      onRun: (index: number) => void chat.runAction(message, payload, index),
      onNavigate: (to: string) => chat.navigate(to),
    };
  }

  const lastItem = items.at(-1);
  const lastSuggestions =
    lastItem && lastItem.message.role === 'agent' && !typing ? (lastItem.payload?.reply.suggestions ?? []) : [];

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      {/* Conversa */}
      <section
        aria-labelledby="assistant-title"
        className="flex h-[calc(100dvh_-_11.75rem_-_env(safe-area-inset-bottom))] min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:h-[calc(100dvh_-_4.5rem)] dark:border-slate-800 dark:bg-slate-900"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-3 py-2.5 sm:px-4 dark:border-slate-800">
          <PatAvatar size="lg" />
          <div className="min-w-0 flex-1">
            <h1 id="assistant-title" className="truncate text-base font-semibold text-slate-900 dark:text-white">
              <span className="sr-only">Assistente: </span>
              {agent}
            </h1>
            <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span aria-hidden className="size-2 rounded-full bg-emerald-500" />
              Assistente financeiro · offline
            </p>
          </div>
          <IconButton label="Exemplos de perguntas" className="lg:hidden" onClick={() => setExamplesOpen(true)}>
            <Lightbulb size={20} aria-hidden />
          </IconButton>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Limpar conversa"
            icon={<Trash2 size={16} aria-hidden />}
            disabled={typing || chat.busy !== null}
            onClick={() => void chat.clear()}
          >
            <span className="hidden sm:inline">Limpar conversa</span>
          </Button>
        </header>

        {/* Insights recolhíveis (celular) */}
        <div className="shrink-0 border-b border-slate-200 lg:hidden dark:border-slate-800">
          <button
            type="button"
            aria-expanded={insightsOpen}
            aria-controls={insightsRegionId}
            onClick={() => setInsightsOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 sm:px-4 dark:text-slate-200 dark:hover:bg-slate-800/60"
          >
            <Sparkles size={16} className="text-brand-700 dark:text-brand-400" aria-hidden />
            <span className="flex-1">Insights do {agent}</span>
            {insights.length > 0 && <Badge tone="brand">{insights.length}</Badge>}
            <ChevronDown
              size={18}
              aria-hidden
              className={cn('text-slate-400 transition-transform', insightsOpen && 'rotate-180')}
            />
          </button>
          {insightsOpen && (
            <div id={insightsRegionId} className="max-h-[35dvh] overflow-y-auto px-3 pb-3 sm:px-4">
              <InsightsList
                insights={insights}
                month={month}
                agentName={agent}
                onAsk={(q) => {
                  setInsightsOpen(false);
                  ask(q);
                }}
                askDisabled={typing}
              />
            </div>
          )}
        </div>

        {/* Mensagens */}
        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label={`Conversa com o ${agent}`}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4"
        >
          <ol className="space-y-4">
            {items.map(({ message, payload }) => (
              <MessageItem
                key={message.id}
                message={message}
                payload={payload}
                agentName={agent}
                data={data}
                today={today}
                handlers={payload ? handlersFor(message, payload) : NO_HANDLERS}
                suggestions={message.id === lastItem?.message.id ? lastSuggestions : undefined}
                onSuggestion={ask}
                suggestionsDisabled={typing}
              />
            ))}
            {typing && <TypingIndicator agentName={agent} />}
          </ol>
        </div>

        {/* Campo de mensagem (fixo no rodapé do painel, acima da barra de navegação do celular) */}
        <div className="shrink-0 border-t border-slate-200 bg-white px-3 pb-2 pt-3 sm:px-4 dark:border-slate-800 dark:bg-slate-900">
          <Composer agentName={agent} sendDisabled={typing} onSend={ask} />
          <p className="mt-1.5 flex items-center justify-center gap-1 text-center text-[11px] text-slate-500 dark:text-slate-400">
            <ShieldCheck size={12} aria-hidden className="shrink-0" />O {agent} roda no seu dispositivo — nada é enviado
            para a internet.
          </p>
        </div>
      </section>

      {/* Coluna lateral (desktop) */}
      <aside
        aria-label={`Painel do ${agent}`}
        className="hidden flex-col gap-4 overflow-y-auto lg:flex lg:h-[calc(100dvh_-_4.5rem)]"
      >
        <Card>
          <CardHeader
            icon={<Sparkles size={18} aria-hidden />}
            title={`Insights do ${agent}`}
            subtitle="Alertas e conquistas a partir dos seus números"
          />
          <InsightsList insights={insights} month={month} agentName={agent} onAsk={ask} askDisabled={typing} />
        </Card>
        <Card>
          <CardHeader
            icon={<MessageCircleQuestion size={18} aria-hidden />}
            title={`Pergunte ao ${agent}`}
            subtitle="Toque em um exemplo para enviar"
          />
          <ExamplesList onPick={ask} disabled={typing} />
        </Card>
      </aside>

      <Modal open={examplesOpen} onClose={() => setExamplesOpen(false)} title={`Pergunte ao ${agent}`}>
        <ExamplesList
          disabled={typing}
          onPick={(example) => {
            setExamplesOpen(false);
            ask(example);
          }}
        />
      </Modal>

      <TransactionFormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        initial={editing?.initial}
        onSaved={(txs) => {
          if (editing) void chat.transactionSaved(editing.message, editing.payload, editing.index, txs);
        }}
      />
    </div>
  );
}

const NO_HANDLERS: ChatActionHandlers = {
  busyIndex: null,
  locked: true,
  onConfirmTransaction: () => {},
  onEditTransaction: () => {},
  onCancel: () => {},
  onRun: () => {},
  onNavigate: () => {},
};
