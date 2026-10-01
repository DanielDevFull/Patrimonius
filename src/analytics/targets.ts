import { RULE_50_30_20 } from '@/domain/defaults';
import type { Settings } from '@/domain/types';

/**
 * Taxa de poupança de referência, em % da renda (o "20" da regra 50/30/20). Usada só onde é preciso uma régua
 * mesmo sem meta do usuário (nota de saúde financeira) — e apresentada como referência, nunca como "sua meta".
 */
export const REFERENCE_SAVINGS_PCT = Math.round(RULE_50_30_20.objetivos * 100);

/**
 * Meta de poupança das configurações, em % da renda, ou null quando o usuário não definiu meta (0%).
 * Fonte única para insights, respostas do Pat, fechamento do mês, relatórios e saúde financeira: com null,
 * ninguém compara a poupança com uma meta (nada de "sua meta é 20%" para quem escolheu 0%).
 */
export function savingsTargetPct(settings: Pick<Settings, 'savingsRateTarget'>): number | null {
  const pct = settings.savingsRateTarget;
  return Number.isFinite(pct) && pct > 0 ? pct : null;
}
