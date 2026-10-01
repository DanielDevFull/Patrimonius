import { formatBRL, formatBRLCompact, formatSignedBRL } from '@/domain/money';
import type { Cents } from '@/domain/types';
import { cn } from './cn';

export interface MoneyProps {
  value: Cents;
  /** Mostra + / - explícito. */
  signed?: boolean;
  /** Verde para positivo, vermelho para negativo. */
  colored?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * Exibe um valor em reais. Usa a classe `.money`, que é borrada no modo privacidade (ocultar valores).
 * SEMPRE use este componente (ou a classe `money`) para exibir valores na interface.
 */
export function Money({ value, signed, colored, compact, className }: MoneyProps) {
  const text = compact ? formatBRLCompact(value) : signed ? formatSignedBRL(value) : formatBRL(value);
  return (
    <span
      className={cn(
        'money tabular whitespace-nowrap',
        // emerald-700 no claro: contraste AA (≈5,4:1) em fundo branco; emerald-600 dá só 3,65:1.
        colored && value > 0 && 'text-emerald-700 dark:text-emerald-400',
        colored && value < 0 && 'text-rose-600 dark:text-rose-400',
        className,
      )}
    >
      {text}
    </span>
  );
}
