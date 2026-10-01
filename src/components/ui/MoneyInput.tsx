import { useEffect, useRef, useState } from 'react';
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
  /** Último valor que o próprio campo emitiu (ou já refletido no texto). */
  const lastValue = useRef<Cents | null>(value);

  const emit = (v: Cents | null) => {
    lastValue.current = v;
    onChange(v);
  };

  // Sincroniza o texto só quando o valor muda DE FORA (ex.: reset do "Salvar e novo", edição carregada). O null que o
  // próprio campo emite num trecho ainda incompleto ('2 m' de '2 mil') não apaga o que o usuário está digitando.
  useEffect(() => {
    if (value === lastValue.current) return;
    lastValue.current = value;
    setText(value == null ? '' : formatDecimal(value));
  }, [value]);

  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500 dark:text-slate-400">R$</span>
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
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const parsed = parseMoney(raw);
          if (parsed == null) emit(null);
          else emit(allowNegative ? parsed : Math.abs(parsed));
        }}
        onBlur={() => {
          const parsed = parseMoney(text);
          if (parsed == null) {
            setText('');
            emit(null);
          } else {
            const v = allowNegative ? parsed : Math.abs(parsed);
            setText(formatDecimal(v));
          }
        }}
      />
    </div>
  );
}
