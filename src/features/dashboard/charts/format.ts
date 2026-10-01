import { formatDateShort } from '@/domain/dates';
import { fromCents } from '@/domain/money';
import type { Cents, ISODate } from '@/domain/types';

const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

/**
 * Rótulo curto do eixo Y. Os dados dos gráficos ficam em centavos; só aqui convertemos para reais.
 * 150000 => '1,5 mil'; -250000000 => '-2,5 mi'; 0 => '0'.
 */
export function formatAxisReais(cents: Cents): string {
  if (!Number.isFinite(cents)) return '';
  const reais = fromCents(cents);
  return compact.format(reais === 0 ? 0 : reais).replace(/[\u00a0\u202f]/g, ' ');
}

/** Rótulo do eixo X para dias: '2026-10-05' => '05 out'. */
export function formatAxisDay(date: ISODate): string {
  return formatDateShort(date);
}

/** Rótulo do eixo no modo "ocultar valores" (o blur via CSS não funciona em todo navegador dentro de SVG). */
export function maskedAxis(): string {
  return '•••';
}

/** Formatador do eixo Y em reais, respeitando o modo "ocultar valores". */
export function axisReaisFormatter(hidden: boolean): (cents: Cents) => string {
  return hidden ? maskedAxis : formatAxisReais;
}
