import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { todayISO } from '@/domain/dates';
import type { ChatMessage, FinanceData, ISODate, Settings } from '@/domain/types';
import { db } from './db';
import { loadFinanceData } from './repo';

/**
 * Todos os dados financeiros, reativos (re-renderiza quando qualquer tabela muda).
 * `undefined` enquanto carrega. Use com as funções puras de `@/analytics`.
 */
export function useFinanceData(): FinanceData | undefined {
  return useLiveQuery(loadFinanceData, []);
}

export function useSettings(): Settings | undefined {
  return useLiveQuery(() => db.settings.get('settings'), []);
}

export function useChatMessages(): ChatMessage[] | undefined {
  return useLiveQuery(() => db.chat.orderBy('createdAt').toArray(), []);
}

/** Data de hoje ('YYYY-MM-DD'), atualizada automaticamente na virada do dia. */
export function useToday(): ISODate {
  const [today, setToday] = useState(() => todayISO());
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = todayISO();
      setToday((prev) => (prev === t ? prev : t));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return today;
}
