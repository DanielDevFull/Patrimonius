import { useEffect, useRef } from 'react';
import { useToast } from '@/components/ui';
import { monthKey, startOfMonth } from '@/domain/dates';
import { useToday } from '@/db/hooks';
import { runRecurring } from '@/db/repo';
import { RECURRING_FAILED_MESSAGE } from './startup-error';

/** Duração do aviso de falha (mais longa que a das notificações comuns). */
const WARNING_MS = 10_000;

/**
 * Recorrências com o app aberto: quando o mês vira (aba fixa, PWA em segundo plano), gera os pendentes do novo mês
 * — a abertura do app já gerou os do mês inicial. Também avisa se a geração na abertura falhou.
 */
export function RecurringController({ startupFailed = false }: { startupFailed?: boolean }) {
  const toast = useToast();
  const month = monthKey(useToday());
  const generatedMonth = useRef(month);

  useEffect(() => {
    if (startupFailed) toast(RECURRING_FAILED_MESSAGE, 'error', WARNING_MS);
  }, [startupFailed, toast]);

  useEffect(() => {
    if (month === generatedMonth.current) return;
    generatedMonth.current = month;
    // runRecurring é idempotente: gera só o que ainda falta até o fim do mês.
    runRecurring(startOfMonth(month)).catch((e: unknown) => {
      console.error(e);
      toast(RECURRING_FAILED_MESSAGE, 'error', WARNING_MS);
    });
  }, [month, toast]);

  return null;
}
