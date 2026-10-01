/**
 * Classificação de intenção por regras (pt-BR). Trabalha sobre o texto dobrado, com gírias expandidas
 * e erros leves de digitação corrigidos (`prepareForIntent`).
 */
import type { IntentName } from '../types';
import { fuzzyScore, squash } from './text';

/* ------------------------------------------------------------------ */
/* Correção de erros de digitação                                      */
/* ------------------------------------------------------------------ */

/** Palavras-chave das intenções (alvos da correção ortográfica). */
export const INTENT_VOCAB = [
  'quanto',
  'gastei',
  'gastos',
  'gastando',
  'despesas',
  'receitas',
  'ganhei',
  'recebi',
  'orcamento',
  'orcamentos',
  'saldo',
  'resumo',
  'dividas',
  'divida',
  'devendo',
  'metas',
  'patrimonio',
  'reserva',
  'emergencia',
  'previsao',
  'assinaturas',
  'relatorio',
  'fechamento',
  'transferi',
  'transferencia',
  'paguei',
  'comprei',
  'salario',
  'poupanca',
  'carteira',
  'cartao',
  'corrente',
  'economizar',
  'comparar',
  'compara',
  'financeira',
  'financas',
  'limite',
  'maximo',
  'definir',
  'criar',
  'juntar',
  'guardar',
  'guardei',
  'aportar',
  'quitar',
  'vencer',
  'vencem',
  'pagar',
  'obrigado',
  'obrigada',
  'valeu',
  'ajuda',
  'passado',
  'passada',
  'semana',
  'ontem',
  'anteontem',
  'amanha',
  'sobrar',
  'consigo',
  'posso',
  'comprar',
  'gastar',
  'maiores',
  'emprestimo',
  'financiamento',
  'dicas',
  'economia',
  'previsto',
  'estourei',
  'mercado',
  'restaurante',
  'janeiro',
  'fevereiro',
  'marco',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** Palavras comuns que NÃO devem ser corrigidas (estão perto demais de palavras do vocabulário). */
const PROTECTED = new Set([
  'gosto',
  'posto',
  'resto',
  'conto',
  'pasta',
  'gasta',
  'gasto',
  'gastou',
  'gastamos',
  'pagou',
  'pagamos',
  'pagando',
  'comprou',
  'compramos',
  'compras',
  'compra',
  'quanta',
  'quantas',
  'quantos',
  'metade',
  'mesmo',
  'mesma',
  'passei',
  'passou',
  'passa',
  'carteiras',
  'sobrou',
  'sobra',
  'sobre',
  'salao',
  'saude',
  'saldos',
  'dicas',
  'divido',
  'dividi',
  'dividido',
  'dividir',
  'recebido',
  'receber',
  'recebe',
  'cartoes',
  'limites',
  'ganhar',
  'ganho',
  'ganhos',
  'guarda',
  'guardo',
  'semanas',
  'meses',
  'agora',
  'aonde',
  'quando',
  'quinta',
  'segunda',
  'sexta',
  'terca',
  'quarta',
  'sabado',
  'domingo',
  'tenho',
  'tenis',
  'carro',
  'conta',
  'contas',
  'contar',
  'vence',
  'venceu',
  'vencido',
  'vencida',
  'vencidas',
  'vencidos',
  // Palavras comuns a 1 erro de uma palavra-chave (meses curtos, verbos e nomes do vocabulário).
  'maior',
  'menor',
  'junto',
  'juntos',
  'junta',
  'juntas',
  'juntou',
  'vender',
  'vendo',
  'vende',
  'vendeu',
  'venda',
  'vendas',
  'recebo',
  'abrir',
  'abriu',
  'marca',
  'marcas',
  'passo',
  'meias',
  'mesas',
  'salvo',
  'salto',
  'pegar',
  'quarto',
  'gatos',
  'gostar',
  'gostei',
  'gosta',
  'gostou',
  'gostando',
  'duvida',
  'duvidas',
  'manha',
  'manhas',
  'jantar',
  'jantares',
]);

/** Meses curtos (<= 5 letras) não são alvo da correção aproximada: "maior" => "maio", "junto" => "junho"... */
const NO_FUZZY_TARGET = new Set(['maio', 'junho', 'julho', 'abril', 'marco']);

/**
 * Corrige palavras desconhecidas (>= 5 letras) que estão a ~1 erro de uma palavra-chave de intenção
 * ("quato" => "quanto", "orcamneto" => "orcamento"). `known` são palavras que não devem ser tocadas
 * (vocabulário das categorias, nomes de contas/metas).
 */
export function correctTypos(t: string, known: Set<string>): string {
  const vocab = new Set(INTENT_VOCAB);
  return t.replace(/[a-z]+/g, (w) => {
    if (w.length < 5 || vocab.has(w) || PROTECTED.has(w) || known.has(w)) return w;
    let best = w;
    let bestScore = 0;
    for (const v of INTENT_VOCAB) {
      if (NO_FUZZY_TARGET.has(v) || Math.abs(v.length - w.length) > 2) continue;
      const score = fuzzyScore(w, v);
      if (score >= 0.8 && score > bestScore) {
        best = v;
        bestScore = score;
      }
    }
    return best;
  });
}

/* ------------------------------------------------------------------ */
/* Cumprimentos e agradecimentos                                       */
/* ------------------------------------------------------------------ */

const GREETING_START =
  /^(?:oi+e?|ola+|opa|eai|e ai|eae|e ae|hey|hello|hi|salve|fala|falae|bom dia|boa tarde|boa noite|boa madrugada|tudo bem|tudo bom|tudo certo|como vai|beleza|alo)\b/;
const GREETING_WORDS = new Set([
  'oi',
  'oii',
  'oiii',
  'oie',
  'ola',
  'opa',
  'eai',
  'eae',
  'e',
  'ai',
  'ae',
  'hey',
  'hello',
  'hi',
  'salve',
  'fala',
  'falae',
  'bom',
  'boa',
  'dia',
  'tarde',
  'noite',
  'madrugada',
  'tudo',
  'bem',
  'bom',
  'certo',
  'como',
  'vai',
  'voce',
  'esta',
  'beleza',
  'pat',
  'alo',
  'amigo',
  'amiga',
  'assistente',
  'ai',
  'por',
  'ai',
  'contigo',
  'com',
  'joia',
]);

const THANKS_STRONG = /\b(obrigad[oa]s?|valeu|grat[oa]|agradec\w*|thanks|thank you|tmj|brigad[oa]|ajudou)\b/;
/** Palavras que, sozinhas, já são agradecimento ou confirmação. */
const THANKS_CORE = new Set([
  'obrigado',
  'obrigada',
  'obrigados',
  'valeu',
  'grato',
  'grata',
  'agradeco',
  'agradecido',
  'agradecida',
  'thanks',
  'thank',
  'tmj',
  'brigado',
  'brigada',
  'ajudou',
  'show',
  'top',
  'perfeito',
  'otimo',
  'otima',
  'beleza',
  'legal',
  'massa',
  'ok',
  'okay',
  'certo',
  'entendi',
  'bacana',
  'maravilha',
  'excelente',
  'joia',
  'demais',
]);
/** Palavras que podem acompanhar um agradecimento. */
const THANKS_FILLER = new Set([
  'muito',
  'muitissimo',
  'you',
  'pat',
  'me',
  'isso',
  'sim',
  'pela',
  'ajuda',
  'de',
  'novo',
  'mais',
  'uma',
  'vez',
  'boa',
  'bom',
  'tudo',
  'e',
  'ai',
  'mesmo',
  'mto',
  'mt',
  'ta',
  'esta',
  'entao',
  'por',
  'tudo',
  'pelas',
  'dicas',
  'informacao',
  'informacoes',
]);

function onlyWords(t: string): string[] {
  return squash(t.replace(/[^a-z0-9\s]/g, ' '))
    .split(' ')
    .filter(Boolean);
}

/** A mensagem inteira é só um cumprimento ("oi", "bom dia", "olá pat", "e aí, tudo bem?"). */
export function isGreeting(t: string): boolean {
  const ws = onlyWords(t);
  if (!ws.length) return false;
  const joined = ws.join(' ');
  if (!GREETING_START.test(joined)) return false;
  const rest = ws.filter((w) => !GREETING_WORDS.has(w));
  return rest.length === 0 || (rest.length === 1 && ws.length <= 3 && /^[a-z]+$/.test(rest[0]));
}

/** A mensagem inteira é um agradecimento/confirmação. Retorna a confiança (0 se não for). */
export function thanksConfidence(t: string): number {
  const ws = onlyWords(t);
  if (!ws.length || ws.some((w) => !THANKS_CORE.has(w) && !THANKS_FILLER.has(w))) return 0;
  if (!ws.some((w) => THANKS_CORE.has(w))) return 0;
  return THANKS_STRONG.test(ws.join(' ')) ? 0.95 : 0.6;
}

/* ------------------------------------------------------------------ */
/* Verbos e marcadores                                                 */
/* ------------------------------------------------------------------ */

export const EXPENSE_VERB =
  /\b(gastei|gastamos|gastou|paguei|pagamos|pago|comprei|compramos|torrei|desembolsei|custou|custaram|saiu|sairam|deu|foram|almocei|jantei|lanchei|abasteci|assinei|doei|investi|contratei|emprestei|dei|perdi|fiz uma compra|fiz compras|tive um gasto|tive uma despesa|pagou)\b/;
export const INCOME_VERB =
  /\b(recebi|recebemos|ganhei|ganhamos|caiu|cairam|entrou|entraram|pagaram|me pagou|vendi|vendemos|faturei|rendeu|renderam|depositaram|herdei|reembolsaram|estornaram|devolveram|recebimento)\b/;
export const TRANSFER_STRONG =
  /\b(transferi|transfere|transferir|transferencia|transfira|movi|mover|movimentei|saquei|sacar|saque)\b/;
export const TRANSFER_WEAK =
  /\b(passei|passa|mandei|enviei|joguei|depositei|guardei|coloquei|botei|apliquei|separei|resgatei|resgatar|resgate)\b/;
/**
 * Pagamento de fatura: o verbo pode vir separado de "fatura" pelo valor ("paguei 3907,96 da fatura do cartão"),
 * mas só por até 4 palavras — "paguei 50 no uber, vai pra fatura" continua sendo uma despesa.
 */
export const INVOICE_PAYMENT = /\b(paguei|pagamos|pagar|pagamento|quitei)\b(?:\s+\S+){0,4}?\s+fatura\b/;
/** Tirar dinheiro de uma conta própria ("tirei 200 da poupança") é transferência (exige a conta citada). */
export const WITHDRAW_FROM_ACCOUNT = /\b(tirei|retirei|puxei|tirar|retirar|puxar)\b/;
/** Valor dito no presente ("recebo 9650 dia 5", "ganho 5 mil por mês"): hábito, não um lançamento. */
const HABITUAL_INCOME = /^(?:eu\s+)?(?:recebo|ganho|faturo)\b/;
const HABITUAL_EXPENSE = /^(?:eu\s+)?(?:gasto|pago)\b.*\b(?:(?:todo|cada)\s+mes|por\s+mes|mensalmente|ao\s+mes)\b/;

/** Frase no presente que descreve um hábito com valor ("recebo 9650 dia 5"): não deve virar lançamento. */
export function isHabitualStatement(tc: string): boolean {
  return HABITUAL_INCOME.test(tc) || HABITUAL_EXPENSE.test(tc);
}
export const INTERROGATIVE =
  /^(?:e\s+)?(?:quanto|quanta|quantas|quantos|qual|quais|como|onde|aonde|quando|por que|porque|sera|o que|que|cade|posso|consigo|da pra|da para|devo|vale a pena|tenho como|existe|me (?:diz|diga|mostra|mostre|fala))\b/;
/** Palavras que indicam pedido/planejamento (não um lançamento curto do tipo "uber 23,50"). */
const NOT_A_LOG =
  /\b(quero|vou|preciso|gostaria|pretendo|posso|devo|consigo|quanto|qual|quais|como|onde|orcamento|limite|meta|metas|economizar|juntar|guardar|poupar|planejar|simular|simulacao|se eu|caso eu|previsao|resumo|relatorio|saldo)\b/;

export interface IntentSignals {
  /** Texto dobrado + gírias + correções. */
  tc: string;
  hasAmount: boolean;
  /** Termina/contém '?' ou começa com palavra interrogativa. */
  question: boolean;
  interrogative: boolean;
  /** Há conta citada depois de para/pra/na/no (destino de transferência). */
  hasDestinationAccount: boolean;
  hasAnyAccount: boolean;
  /** Meta citada com confiança >= 0,75. */
  hasGoal: boolean;
  hasPeriod: boolean;
  /** Número de palavras "de conteúdo" (sem valor, data, conta e palavras vazias). */
  contentWords: number;
  /** Categoria de receita é mais provável que a de despesa (para frases curtas "freela 300"). */
  incomeLikely: boolean;
}

export interface Classification {
  intent: IntentName;
  confidence: number;
}

type Rule = [IntentName, RegExp, number];

/** Consultas (sem valor ou interrogativas). A ordem importa: a primeira que casar vence. */
const QUERY_RULES: Rule[] = [
  [
    'plano_dividas',
    /\b(quitar|quito|quitacao|sair d[ao]s? (?:minhas? )?dividas?|sair do vermelho|pagar (?:minhas |as |todas as )?dividas|plano\b.*\bdividas?|estrategia\b.*\bdividas?|avalanche|bola de neve|livre d[ae]s? dividas?|eliminar\b.*\bdividas?|acabar com\b.*\bdividas?|limpar (?:o |meu )?nome|renegociar|ordem\b.*\bdividas?|qual divida pagar|qual (?:divida )?pagar primeiro|pagar\b.*\bprimeiro|primeiro\b.*\bdividas?)\b/,
    0.9,
  ],
  // Fatura e limite do cartão ("qual a fatura do cartão?", "quanto tenho de limite no cartão?", "quanto devo no cartão?").
  [
    'consultar_saldo',
    /\bfaturas?\b|\blimites?\b.*\bcartao\b|\bcartao\b.*\blimites?\b|\b(?:devo|devendo|deve|devemos)\b.*\bcartao\b/,
    0.85,
  ],
  [
    'status_dividas',
    /\b(dividas?|devendo|emprestimos?|financiamentos?|endividad[oa]|cheque especial)\b|\b(?:quanto|o que) (?:eu )?devo\b(?!\s+(?:\w+(?:ar|er|ir))\b)|\bdevo\s*\??$/,
    0.85,
  ],
  ['status_metas', /\b(metas?|objetivos?|sonhos?)\b/, 0.85],
  [
    'status_orcamento',
    /\b(orcamentos?|limites?|teto|estourei|estourando|estourar|estourou|dentro do planejado|quanto (?:ainda )?(?:posso|consigo|da pra) gastar com)\b/,
    0.85,
  ],
  [
    'patrimonio',
    /\b(patrimonio|patrimonial|quanto (?:eu )?valho|meus bens|riqueza|net worth|ativos e passivos|meu valor liquido)\b/,
    0.9,
  ],
  [
    'reserva_emergencia',
    /\b(reserva(?: de emergencia)?|fundo de emergencia|colchao (?:financeiro|de seguranca)|emergencia)\b/,
    0.85,
  ],
  [
    'saude_financeira',
    /\b(saude financeira|nota (?:d[aoe]s? )?(?:minhas? )?financas|nota financeira|minha nota|score|pontuacao|diagnostico|check ?up|avali\w* (?:as |minhas? )?financas|como (?:estao|vao|anda|andam) (?:as )?minhas financas|minhas financas|avaliacao financeira|estou bem financeiramente|indice financeiro|vida financeira)\b/,
    0.85,
  ],
  [
    'previsao',
    /\b(previsao|previsto|projecao|projetar|vou fechar|vamos fechar|fechar o mes|vai sobrar|vou ter sobra|quanto (?:vai|vou) sobrar|sobrar no fim|no azul|no vermelho|fim do mes|final do mes|ate o fim do mes|vai faltar|vai dar|vou conseguir pagar|como vou terminar|como vai terminar|tendencia)\b/,
    0.85,
  ],
  ['relatorio', /\b(relatorio|fechamento|balanco|prestacao de contas|extrato do mes|retrospectiva)\b/, 0.9],
  [
    'comparar_meses',
    /\b(compar\w*|versus|vs|em relacao a|diferenca|evolucao|aumentou|diminuiu|cresceu|caiu muito)\b|\b(?:mais|menos)\s+(?:do\s+)?que\s+(?:n?o\s+)?(?:mes|semana|ano)\b/,
    0.85,
  ],
  [
    'maiores_gastos',
    /\b(onde (?:(?:eu )?(?:estou|estamos|ando|to) )?(?:gastando|gasto|gastei|gastamos)|maiores (?:gastos|despesas)|maior (?:gasto|despesa)s?|com o que (?:eu )?(?:mais )?(?:gasto|gastei|estou gastando)|com que (?:mais )?gast\w*|em que (?:eu )?(?:mais )?gast\w*|principais (?:gastos|despesas)|top (?:gastos|despesas|categorias)|o que mais (?:pesa|gastei|gasto|consome)|ranking|categorias? que mais|gastando mais|gastei mais com|(?:pra|para) onde (?:vai|foi|esta indo|ta indo|estao indo) (?:o |meu )?dinheiro|vil[aoe]e?s?)\b/,
    0.85,
  ],
  [
    'contas_a_pagar',
    /\b(contas? (?:a|para|pra) pagar|pagar (?:as|minhas|todas as) contas|dinheiro (?:pra|para) pagar|o que (?:vence|tenho (?:pra|para|a) pagar)|vencendo|vencimentos?|vence|vencem|vencer|vencidas?|vencidos?|a vencer|proximas contas|proximos pagamentos|boletos?|pagamentos? pendentes?|contas? pendentes?|lancamentos? pendentes?|pendencias|tenho que pagar|preciso pagar|falta pagar)\b/,
    0.85,
  ],
  ['assinaturas', /\b(gastos fixos|despesas fixas|contas fixas|recorrentes|recorrencias)\b/, 0.85],
  [
    'consultar_gastos',
    /\b(gastei|gastamos|gastos?|gastando|despesas?|saiu|sairam|paguei|pagamos|gastou|quanto (?:eu )?(?:ja )?(?:paguei|pago|gasto)|total gasto)\b/,
    0.85,
  ],
  [
    'consultar_receitas',
    /\b(ganhei|ganhamos|recebi|recebemos|entrou|entraram|receitas?|ganhos|rendas?|entradas|recebimentos|faturei|faturamento|rendeu|renderam|rendimentos?|quanto (?:eu )?ganho)\b/,
    0.85,
  ],
  [
    'assinaturas',
    /\b(assinaturas?|recorrentes?|recorrencias?|gastos fixos|despesas fixas|contas fixas|streamings?|mensalidades)\b/,
    0.85,
  ],
  [
    'dicas',
    /\b(dicas?|como (?:posso |eu |vou |devo )?(?:economizar|poupar|guardar|gastar menos|juntar|melhorar|organizar|investir|cortar)|economizar|sugest(?:ao|oes)|conselhos?|recomenda\w*|o que (?:eu )?(?:devo|posso) fazer|me ajud[ae] a (?:economizar|poupar|organizar)|cortar gastos|cortar custos|reduzir (?:os |meus )?gastos|gastar menos|melhorar (?:minhas )?financas|onde (?:posso )?cortar|como sobra mais)\b/,
    0.85,
  ],
  [
    'consultar_saldo',
    /\b(saldos?|quanto (?:eu )?tenho|tenho quanto|quanto (?:ha|tem) (?:na|no|em)|quanto (?:de )?dinheiro|extrato|dinheiro disponivel|disponivel na conta)\b/,
    0.85,
  ],
  [
    'resumo_mes',
    /\b(resumo|resuma|resumir|como (?:eu )?(?:estou|estamos|ando|vai|vou|foi|fui|fomos|esta|estao|anda|andam|ficou|fiquei|terminei)|situacao|panorama|visao geral|status|overview|sobrou|balanco do mes|me (?:de|da) um resumo|como (?:foi|esta) (?:o|meu|este|esse) mes)\b/,
    0.8,
  ],
  [
    'ajuda',
    /\b(ajuda|ajude|help|socorro|o que (?:voce|tu) (?:sabe|pode|consegue|faz)|como (?:voce|isso|o app|o aplicativo|o pat) funciona|como funciona|comandos|menu|funcionalidades|o que (?:eu )?posso (?:perguntar|pedir|fazer)|como (?:te )?usar|como usa|exemplos?|quem e voce|quem (?:e|eh) o pat|o que voce e)\b/,
    0.9,
  ],
];

/**
 * Classifica a intenção. Desambiguação principal:
 * - valor + verbo no passado (gastei, paguei, comprei, recebi, caiu...) => registrar;
 * - palavras interrogativas (quanto, qual, como, onde, '?') => consultar;
 * - frase curta valor + descrição ("uber 23,50", "salário 5000") => registrar (receita se a categoria for de receita).
 */
export function classify(s: IntentSignals): Classification {
  const t = s.tc;
  if (!/[a-z0-9]/.test(t)) return { intent: 'desconhecido', confidence: 0 };
  const thanks = thanksConfidence(t);
  if (thanks >= 0.9) return { intent: 'agradecimento', confidence: thanks };
  if (isGreeting(t)) return { intent: 'saudacao', confidence: 0.95 };
  if (thanks) return { intent: 'agradecimento', confidence: thanks };

  const pastExpense = EXPENSE_VERB.test(t);
  const income = INCOME_VERB.test(t);

  // "posso gastar 300 num tênis?", "consigo comprar um celular de 2000 em 10x?", "dá pra comprar...?"
  const canSpend =
    /^(?:e\s+)?(?:sera que\s+)?(?:eu\s+)?(?:posso|consigo|da pra|da para|devo|tenho como|vale a pena|cabe|e se eu|daria pra|daria para|seria possivel)\b/.test(
      t,
    ) ||
    /\b(?:posso|consigo|da pra|da para|cabe no (?:meu )?orcamento)\s+(?:\w+\s+)?(?:gastar|comprar|parcelar|pagar|financiar|viajar)\b/.test(
      t,
    );
  if (
    canSpend &&
    /\b(gastar|comprar|compra|pagar|parcelar|investir|viajar|assinar|pegar|trocar|fazer|financiar|bancar|torrar|ir|levar|gasto|cabe)\b/.test(
      t,
    ) &&
    !/\bquanto\b.*\bcom\b/.test(t) &&
    !/\bdividas?\b/.test(t)
  ) {
    return { intent: 'posso_gastar', confidence: s.hasAmount ? 0.9 : 0.7 };
  }

  if (
    s.hasAmount &&
    !pastExpense &&
    /\b(orcamento|limite|teto|no maximo|no max|maximo de|budget|gastar ate)\b/.test(t)
  ) {
    return { intent: 'definir_orcamento', confidence: 0.9 };
  }

  const createGoal =
    /\b(criar|crie|cria|nova|novo|adicionar|adiciona|cadastrar|cadastra|montar|monta|abrir|comecar|definir|define|registrar|registra)\b.*\bmetas?\b/.test(
      t,
    );
  const contributeVerb =
    /\b(guardei|guardar|guarda|aportei|aportar|aporte|aporta|depositei|depositar|coloquei|colocar|coloca|botei|separei|juntei|adicionei|adicionar|adiciona|investi|transferi|mandei|poupei|reservei|economizei|contribui|contribuir)\b/;
  if (s.hasAmount && !createGoal && contributeVerb.test(t) && (/\bmetas?\b/.test(t) || s.hasGoal)) {
    return { intent: 'aportar_meta', confidence: 0.9 };
  }
  if (s.hasAmount && !createGoal && /\b(?:na|pra|para|para a|pra a)\s+meta\b/.test(t)) {
    return { intent: 'aportar_meta', confidence: 0.75 };
  }
  if (createGoal) return { intent: 'criar_meta', confidence: s.hasAmount ? 0.9 : 0.7 };
  // "meta reserva de 20 mil até o fim do ano", "meta de 5 mil para viagem em 10 meses"
  if (
    s.hasAmount &&
    (/^\s*(?:nova\s+)?metas?\b/.test(t) ||
      (/\bmetas?\b/.test(t) && /\b(ate|em \d+ (?:meses|anos)|prazo)\b/.test(t)))
  ) {
    return { intent: 'criar_meta', confidence: 0.8 };
  }
  if (
    s.hasAmount &&
    /\b(?:quero|vou|preciso|gostaria de|pretendo|planejo|desejo|meu sonho e|meu objetivo e|objetivo de|sonho de)\s+(?:\w+\s+)?(?:juntar|guardar|economizar|poupar|acumular|comprar|trocar|viajar|fazer)\b/.test(
      t,
    ) &&
    /\b(para|pra|ate|meses|mes|anos|ano|por mes)\b/.test(t)
  ) {
    return { intent: 'criar_meta', confidence: 0.8 };
  }

  if (s.hasAmount && !s.interrogative) {
    // Hábito no presente: não vira lançamento (o respondedor sugere cadastrar uma recorrência).
    if (isHabitualStatement(t)) return { intent: 'desconhecido', confidence: 0.1 };
    if (INVOICE_PAYMENT.test(t)) return { intent: 'registrar_transferencia', confidence: 0.85 };
    if (TRANSFER_STRONG.test(t)) return { intent: 'registrar_transferencia', confidence: 0.9 };
    if (TRANSFER_WEAK.test(t) && s.hasDestinationAccount)
      return { intent: 'registrar_transferencia', confidence: 0.85 };
    if (/\b(resgatei|resgatar|resgate)\b/.test(t) && s.hasAnyAccount) {
      return { intent: 'registrar_transferencia', confidence: 0.85 };
    }
    if (WITHDRAW_FROM_ACCOUNT.test(t) && s.hasAnyAccount) {
      return { intent: 'registrar_transferencia', confidence: 0.85 };
    }
    if (income && !(pastExpense && /^(?:eu\s+)?(gastei|paguei|comprei)/.test(t))) {
      return { intent: 'registrar_receita', confidence: 0.9 };
    }
    if (pastExpense) return { intent: 'registrar_despesa', confidence: 0.9 };
    if (/\b(guardei|juntei|poupei|economizei|separei)\b/.test(t))
      return { intent: 'registrar_transferencia', confidence: 0.5 };
    if (!s.question && !NOT_A_LOG.test(t) && s.contentWords <= 5) {
      return s.incomeLikely
        ? { intent: 'registrar_receita', confidence: 0.75 }
        : { intent: 'registrar_despesa', confidence: s.contentWords > 0 ? 0.7 : 0.55 };
    }
  }

  // Pedido de registro sem valor (o respondedor pergunta "Qual foi o valor?" e guarda o resto para a resposta).
  if (!s.hasAmount && !s.question && !s.hasPeriod) {
    if (/^(?:eu\s+)?(?:recebi|ganhei|caiu|entrou)\b/.test(t) && s.contentWords > 0)
      return { intent: 'registrar_receita', confidence: 0.5 };
    if (INVOICE_PAYMENT.test(t) || /^(?:eu\s+)?(?:paguei|quitei)\s+(?:a\s+|da\s+|o\s+)?fatura\b/.test(t))
      return { intent: 'registrar_transferencia', confidence: 0.5 };
    if (
      (TRANSFER_STRONG.test(t) && s.hasAnyAccount) ||
      (WITHDRAW_FROM_ACCOUNT.test(t) && s.hasAnyAccount) ||
      (/^(?:eu\s+)?(?:passei|mandei|enviei|depositei|coloquei|botei|apliquei|resgatei)\b/.test(t) && s.hasDestinationAccount)
    )
      return { intent: 'registrar_transferencia', confidence: 0.5 };
    if (
      /\b(definir|define|defina|colocar|coloca|criar|crie|cria|cadastrar|mudar|muda|alterar|altera|ajustar|ajusta|fixar|estabelecer|novo|nova)\b.*\b(orcamento|limite|teto)\b/.test(t) &&
      !/\bcartao\b/.test(t)
    )
      return { intent: 'definir_orcamento', confidence: 0.5 };
    if (
      !createGoal &&
      contributeVerb.test(t) &&
      (/\bmetas?\b/.test(t) || s.hasGoal) &&
      !/\b(quanto|falta|faltam)\b/.test(t)
    )
      return { intent: 'aportar_meta', confidence: 0.5 };
  }

  for (const [intent, re, confidence] of QUERY_RULES) {
    if (re.test(t)) {
      // "gastei muito" sem valor e sem pergunta é registro incompleto só quando começa pelo verbo e não cita período.
      if (
        intent === 'consultar_gastos' &&
        !s.question &&
        !s.hasPeriod &&
        /^(?:eu\s+)?(?:paguei|comprei|gastei)\b/.test(t) &&
        s.contentWords > 0
      ) {
        return { intent: 'registrar_despesa', confidence: 0.5 };
      }
      return { intent, confidence };
    }
  }

  if (/\b(economizar|poupar|guardar dinheiro|juntar dinheiro)\b/.test(t))
    return { intent: 'dicas', confidence: 0.6 };
  return { intent: 'desconhecido', confidence: 0.05 };
}
