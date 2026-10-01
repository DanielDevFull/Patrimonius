import { Fragment, useMemo } from 'react';
import { splitMoneyText } from '@/domain/money';

/**
 * Exibe um texto pronto (insight, relatório, resposta do agente, razões de simulação) marcando cada valor em reais
 * com a classe `money`, para que o modo "ocultar valores" os esconda sem esconder a frase inteira.
 */
export function MoneyText({ text }: { text: string }) {
  const parts = useMemo(() => splitMoneyText(text), [text]);
  return (
    <>
      {parts.map((part, i) =>
        part.money ? (
          <span key={i} className="money tabular whitespace-nowrap">
            {part.text}
          </span>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}
