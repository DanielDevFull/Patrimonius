import type { FinanceData, ISODate } from '@/domain/types';
import type { AgentReply, ConversationState } from './types';

/**
 * Responde a uma mensagem do usuário. Função pura e determinística (dado data/today/state).
 * Retorna a resposta e o novo estado da conversa.
 */
export function respond(
  text: string,
  data: FinanceData,
  today: ISODate,
  state: ConversationState,
): { reply: AgentReply; state: ConversationState } {
  void text;
  void data;
  void today;
  void state;
  throw new Error('não implementado');
}

/** Mensagem de boas-vindas/abertura com resumo rápido e principais insights do dia. */
export function greeting(data: FinanceData, today: ISODate): AgentReply {
  void data;
  void today;
  throw new Error('não implementado');
}
