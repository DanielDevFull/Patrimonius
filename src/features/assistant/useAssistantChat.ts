import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { greeting, respond, type AgentReply, type ConversationState } from '@/agent';
import { useConfirm, useToast } from '@/components/ui';
import {
  addChatMessage,
  addGoal,
  addGoalContribution,
  addTransaction,
  clearChat,
  setBudget,
  updateChatMessage,
  type NewTransactionInput,
} from '@/db/repo';
import type { ChatMessage, FinanceData, ID, ISODate, Transaction } from '@/domain/types';
import {
  agentNameOf,
  budgetDoneReply,
  canceledReply,
  contributionDoneReply,
  goalDoneReply,
  isInternalPath,
  makePayload,
  MAX_MESSAGE_LENGTH,
  transactionDoneReply,
  TYPING_DELAY_MS,
  withActionState,
  type AgentMessagePayload,
} from './chat-utils';

export interface BusyAction {
  messageId: ID;
  index: number;
}

interface Options {
  data: FinanceData;
  messages: ChatMessage[];
  today: ISODate;
  /** Atraso do indicador "digitando…" (ms). */
  typingDelay?: number;
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function mergeStates(a: AgentMessagePayload, b: AgentMessagePayload | undefined): AgentMessagePayload {
  if (!b) return a;
  const done = [...new Set([...a.done, ...b.done])].sort((x, y) => x - y);
  const canceled = [...new Set([...a.canceled, ...b.canceled])].filter((i) => !done.includes(i)).sort((x, y) => x - y);
  return { ...a, done, canceled };
}

/**
 * Estado e operações da conversa com o agente: saudação na primeira visita, envio de mensagens
 * (com indicador de digitação), limpeza do histórico e execução das ações propostas após a confirmação do usuário.
 */
export function useAssistantChat({ data, messages, today, typingDelay = TYPING_DELAY_MS }: Options) {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [conversation, setConversation] = useState<ConversationState>({});
  const sendingRef = useRef(false);
  const busyRef = useRef(false);
  const greetedRef = useRef(false);
  /** Últimos estados de ações gravados por mensagem (evita perder um "feito" se a consulta ao vivo ainda não atualizou). */
  const writtenRef = useRef(new Map<ID, AgentMessagePayload>());

  // Primeira visita (sem mensagens): o Pat abre a conversa. A ref evita duplicar no StrictMode.
  useEffect(() => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    if (messages.length > 0) return;
    const reply = greeting(data, today);
    addChatMessage('agent', reply.text, makePayload(reply)).catch(() =>
      toast('Não foi possível iniciar a conversa.', 'error'),
    );
  }, [messages.length, data, today, toast]);

  const addAgentReply = useCallback(async (reply: AgentReply) => {
    await addChatMessage('agent', reply.text, makePayload(reply));
  }, []);

  /** Envia uma mensagem do usuário e grava a resposta do agente. Retorna false se não foi enviada. */
  async function send(raw: string): Promise<boolean> {
    const text = raw.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!text || sendingRef.current) return false;
    sendingRef.current = true;
    setTyping(true);
    try {
      await addChatMessage('user', text);
      const { reply, state } = respond(text, data, today, conversation);
      await wait(typingDelay);
      await addAgentReply(reply);
      setConversation(state);
      return true;
    } catch (e) {
      toast(errorMessage(e, `Não foi possível falar com o ${agentNameOf(data)} agora.`), 'error');
      return false;
    } finally {
      sendingRef.current = false;
      setTyping(false);
    }
  }

  /** Apaga o histórico (com confirmação) e recomeça com uma nova saudação. */
  async function clear(): Promise<void> {
    const ok = await confirm({
      title: 'Limpar conversa?',
      message: `O histórico com o ${agentNameOf(data)} será apagado deste dispositivo. Seus lançamentos e demais dados não são afetados.`,
      confirmLabel: 'Limpar conversa',
      danger: true,
    });
    if (!ok) return;
    try {
      await clearChat();
      writtenRef.current.clear();
      setConversation({});
      await addAgentReply(greeting(data, today));
      toast('Conversa apagada.', 'info');
    } catch (e) {
      toast(errorMessage(e, 'Não foi possível limpar a conversa.'), 'error');
    }
  }

  /** Grava o novo estado da ação (feita/cancelada) na mensagem de origem. */
  async function markAction(message: ChatMessage, payload: AgentMessagePayload, index: number, state: 'done' | 'canceled') {
    const base = mergeStates(payload, writtenRef.current.get(message.id));
    const next = withActionState(base, index, state);
    writtenRef.current.set(message.id, next);
    await updateChatMessage(message.id, { payload: next });
  }

  /** Executa uma operação de ação com trava (uma por vez) e toast de erro. */
  async function guarded(message: ChatMessage, index: number, fallbackError: string, run: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy({ messageId: message.id, index });
    try {
      await run();
    } catch (e) {
      toast(errorMessage(e, fallbackError), 'error');
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  function confirmTransaction(message: ChatMessage, payload: AgentMessagePayload, index: number, input: NewTransactionInput) {
    return guarded(message, index, 'Não foi possível registrar o lançamento.', async () => {
      const txs = await addTransaction(input);
      await markAction(message, payload, index, 'done');
      await addAgentReply(transactionDoneReply(txs, data, today));
    });
  }

  /** Lançamento salvo pelo formulário de edição (a partir de uma proposta do agente). */
  function transactionSaved(message: ChatMessage, payload: AgentMessagePayload, index: number, txs: Transaction[]) {
    return guarded(message, index, 'O lançamento foi salvo, mas não consegui atualizar a conversa.', async () => {
      await markAction(message, payload, index, 'done');
      await addAgentReply(transactionDoneReply(txs, data, today));
    });
  }

  function cancelAction(message: ChatMessage, payload: AgentMessagePayload, index: number) {
    return guarded(message, index, 'Não foi possível cancelar.', async () => {
      await markAction(message, payload, index, 'canceled');
      await addAgentReply(canceledReply());
    });
  }

  /** set_budget, create_goal, contribute_goal (após o clique de confirmação) e navigate. */
  function runAction(message: ChatMessage, payload: AgentMessagePayload, index: number) {
    const action = payload.reply.actions[index];
    if (!action) return Promise.resolve();
    if (action.type === 'navigate') {
      if (isInternalPath(action.to)) navigate(action.to);
      return Promise.resolve();
    }
    return guarded(message, index, 'Não foi possível concluir a ação.', async () => {
      let follow: AgentReply;
      switch (action.type) {
        case 'set_budget':
          if (!data.categories.some((c) => c.id === action.categoryId)) throw new Error('Categoria não encontrada.');
          await setBudget(action.categoryId, action.amount, action.month);
          follow = budgetDoneReply(action.categoryId, action.amount, action.month, data);
          break;
        case 'create_goal': {
          const draft = { ...action.draft, name: action.draft.name.trim() || 'Nova meta' };
          await addGoal({ ...draft, accountId: null, notes: '' });
          follow = goalDoneReply(draft);
          break;
        }
        case 'contribute_goal':
          await addGoalContribution({ goalId: action.goalId, amount: action.amount, date: action.date });
          follow = contributionDoneReply(action.goalId, action.amount, data);
          break;
        case 'create_transaction':
          // Lançamentos passam pelo card de confirmação (confirmTransaction).
          return;
      }
      await markAction(message, payload, index, 'done');
      await addAgentReply(follow);
    });
  }

  return {
    typing,
    busy,
    send,
    clear,
    confirmTransaction,
    transactionSaved,
    cancelAction,
    runAction,
    navigate,
  };
}
