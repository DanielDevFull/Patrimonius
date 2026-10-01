/**
 * Números por extenso em pt-BR ("cem", "mil e quinhentos", "duzentos e cinquenta", "dois mil").
 * Trabalha sobre tokens do texto dobrado (sem acentos).
 */
import type { Token } from './text';

const SIMPLE: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezasseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  cincoenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  duzentas: 200,
  trezentos: 300,
  trezentas: 300,
  quatrocentos: 400,
  quatrocentas: 400,
  quinhentos: 500,
  quinhentas: 500,
  seiscentos: 600,
  seiscentas: 600,
  setecentos: 700,
  setecentas: 700,
  oitocentos: 800,
  oitocentas: 800,
  novecentos: 900,
  novecentas: 900,
};

const SCALES: Record<string, number> = {
  mil: 1000,
  milhao: 1_000_000,
  milhoes: 1_000_000,
};

export function isNumberWord(word: string): boolean {
  return word in SIMPLE || word in SCALES;
}

/** Valor de uma palavra numérica simples ('doze' => 12), ou null. */
export function simpleNumberWord(word: string): number | null {
  return SIMPLE[word] ?? null;
}

/** Converte '12' ou 'doze' em inteiro (null se não for número). */
export function toInt(word: string): number | null {
  if (/^\d+$/.test(word)) return Number(word);
  return simpleNumberWord(word);
}

export interface WordNumber {
  value: number;
  /** Índice do primeiro e do último token consumidos. */
  first: number;
  last: number;
  /** Contém centena ou escala (cem, duzentos, mil...). */
  big: boolean;
}

/**
 * Lê um número por extenso começando em tokens[index]. Aceita "e" entre as partes
 * ("mil e quinhentos", "vinte e cinco") e escalas ("dois mil", "um milhão e duzentos mil").
 */
export function readWordNumber(tokens: Token[], index: number): WordNumber | null {
  if (!tokens[index] || !isNumberWord(tokens[index].text)) return null;
  let total = 0;
  let current = 0;
  let big = false;
  let i = index;
  let last = index;
  while (i < tokens.length) {
    const w = tokens[i].text;
    if (w in SCALES) {
      current = (current || 1) * SCALES[w];
      total += current;
      current = 0;
      big = true;
    } else if (w in SIMPLE) {
      current += SIMPLE[w];
      if (SIMPLE[w] >= 100) big = true;
    } else {
      break;
    }
    last = i;
    const next = tokens[i + 1];
    if (next && next.text === 'e' && tokens[i + 2] && isNumberWord(tokens[i + 2].text)) {
      i += 2;
    } else if (next && isNumberWord(next.text)) {
      i += 1;
    } else {
      break;
    }
  }
  return { value: total + current, first: index, last, big };
}
