/**
 * Verificações de layout para testes em jsdom (que não calcula layout): detectam, pelas classes Tailwind,
 * padrões que fazem a página rolar na horizontal no celular.
 */

const UNPREFIXED_COLUMNS = /^grid-cols-/;

/**
 * Grids sem colunas no breakpoint base (ex.: `grid gap-4 lg:grid-cols-3`). Sem `grid-cols-*`, o celular usa uma
 * coluna implícita `auto`, que cresce até o min-content dos itens (títulos com `truncate`, valores com
 * `whitespace-nowrap`) e deixa os cards mais largos que a tela. `grid-cols-1` = `repeat(1, minmax(0, 1fr))`.
 */
export function gridsWithoutBaseColumns(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll('.grid')).filter(
    (el) => !Array.from(el.classList).some((c) => UNPREFIXED_COLUMNS.test(c)),
  );
}

const SCROLLERS = '.overflow-x-auto, .overflow-auto, .overflow-x-scroll, .overflow-scroll';
const POSITIONED = ['relative', 'absolute', 'fixed', 'sticky'];

/**
 * Contêineres com rolagem que têm `.sr-only` (position: absolute) dentro, mas não são posicionados. Sem um ancestral
 * posicionado, o `.sr-only` é posicionado em relação à página e não é recortado pelo contêiner: numa tabela larga
 * (`min-w-max`), ele aumenta a largura do documento e a página inteira passa a rolar para o lado.
 */
export function unpositionedScrollersWithSrOnly(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll(SCROLLERS)).filter(
    (el) => el.querySelector('.sr-only') !== null && !POSITIONED.some((c) => el.classList.contains(c)),
  );
}

/** Descreve os elementos (tag + classes) para mensagens de falha legíveis. */
export function describeElements(elements: Element[]): string[] {
  return elements.map((el) => `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">`);
}
