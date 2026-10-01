import { Fragment } from 'react';

/** Valores 'R$ 1.234,56' (com sinal opcional) dentro de um texto pronto. */
const MONEY_IN_TEXT = /[-+]?R\$ ?\d{1,3}(?:\.\d{3})*,\d{2}/g;

/**
 * Exibe um texto gerado pelas análises (ex.: razões do "Posso comprar?") marcando cada valor em reais com a
 * classe `money`, para que o modo "ocultar valores" também os esconda.
 */
export function MoneyText({ text }: { text: string }) {
  const parts: { key: number; value: string; money: boolean }[] = [];
  let last = 0;
  for (const match of text.matchAll(MONEY_IN_TEXT)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ key: last, value: text.slice(last, start), money: false });
    parts.push({ key: start, value: match[0], money: true });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ key: last, value: text.slice(last), money: false });
  return (
    <>
      {parts.map((p) =>
        p.money ? (
          <span key={p.key} className="money tabular whitespace-nowrap">
            {p.value}
          </span>
        ) : (
          <Fragment key={p.key}>{p.value}</Fragment>
        ),
      )}
    </>
  );
}
