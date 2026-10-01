import { useEffect, useState } from 'react';
import { formatDecimal, parseMoney } from '@/domain/money';
import type { Cents } from '@/domain/types';
import { cn } from './cn';
import { controlClass } from './Field';

export interface MoneyInputProps {
  id?: string;
  /** Valor em centavos ou null (vazio). */
  value: Cents | null;
  onChange: (value: Cents | null) => void;
  placeholder?: string;
  allowNegative?: boolean;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
  'aria-label'?: string;
}

/**
 * Campo monetário em reais. Aceita '1.234,56', '1234.56', '50', '2 mil'.
 * Emite centavos (inteiro) ou null quando vazio/inválido. Formata ao sair do campo.
 */
export function MoneyInput({
  id,
  value,
  onChange,
  placeholder = '0,00',
  allowNegative,
  disabled,
  className,
  autoFocus,
  ...rest
}: MoneyInputProps) {
  const [text, setText] = useState(() => (value == null ? '' : formatDecimal(value)));
  const [focused, setFocused] = useState(false);

  // Sincroniza quando o valor muda externamente (ex.: reset do formulário).
  useEffect(() => {
    if (focused) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronização intencional com prop externa
    setText(value == null ? '' : formatDecimal(value));
  }, [value, focused]);

  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">R$</span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={rest['aria-label']}
        className={cn(controlClass, 'tabular pl-10 text-right')}
        value={text}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const parsed = parseMoney(raw);
          if (parsed == null) onChange(null);
          else onChange(allowNegative ? parsed : Math.abs(parsed));
        }}
        onBlur={() => {
          setFocused(false);
          const parsed = parseMoney(text);
          if (parsed == null) {
            setText('');
            onChange(null);
          } else {
            const v = allowNegative ? parsed : Math.abs(parsed);
            setText(formatDecimal(v));
          }
        }}
      />
    </div>
  );
}
