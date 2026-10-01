import { Fragment, useMemo } from 'react';
import { splitMoneyText } from './dashboard-utils';

/**
 * Texto do agente (insight, parágrafo de relatório) com os valores em reais marcados com a classe `.money`,
 * para serem borrados no modo "ocultar valores" sem esconder a frase inteira.
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
