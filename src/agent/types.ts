/**
 * CONTRATO do agente financeiro local ("Pat").
 * O agente roda 100% no dispositivo: NLU por regras em pt-BR + análises de `@/analytics`. Sem chamadas de rede.
 */
import type {
  Cents,
  GoalStatus,
  ID,
  ISODate,
  MonthKey,
  Priority,
  TransactionStatus,
  TransactionType,
} from '@/domain/types';

export type IntentName =
  | 'registrar_despesa'
  | 'registrar_receita'
  | 'registrar_transferencia'
  | 'consultar_saldo'
  | 'consultar_gastos'
  | 'consultar_receitas'
  | 'resumo_mes'
  | 'comparar_meses'
  | 'maiores_gastos'
  | 'status_orcamento'
  | 'definir_orcamento'
  | 'criar_meta'
  | 'status_metas'
  | 'aportar_meta'
  | 'status_dividas'
  | 'plano_dividas'
  | 'patrimonio'
  | 'reserva_emergencia'
  | 'saude_financeira'
  | 'previsao'
  | 'posso_gastar'
  | 'contas_a_pagar'
  | 'assinaturas'
  | 'dicas'
  | 'relatorio'
  | 'ajuda'
  | 'saudacao'
  | 'agradecimento'
  | 'desconhecido';

export interface Period {
  start: ISODate;
  end: ISODate;
  /** Rótulo amigável: 'este mês', 'mês passado', 'setembro de 2026', 'esta semana', 'hoje', 'últimos 3 meses'... */
  label: string;
}

export interface ParsedEntities {
  amount?: Cents;
  date?: ISODate;
  period?: Period;
  categoryId?: ID;
  /** 0..1 */
  categoryConfidence?: number;
  accountId?: ID;
  toAccountId?: ID;
  goalId?: ID;
  /** Descrição limpa para um lançamento (ex.: 'ifood', 'conta de luz'). */
  description?: string;
  installments?: number;
  /** Nome para criação de meta. */
  name?: string;
  targetDate?: ISODate;
  /** Quantidade de meses mencionada (ex.: 'em 12 meses'). */
  months?: number;
  /** Mês de referência para orçamento (null = todos os meses / padrão). */
  budgetMonth?: MonthKey | null;
  /** Segundo mês citado numa comparação ("compara setembro com agosto": period = agosto, comparePeriod = setembro). */
  comparePeriod?: Period;
  /** true quando `date` foi deduzida de um período ("mês passado") e não de um dia exato: o usuário deve conferir. */
  dateApprox?: boolean;
  /** Quantidade de itens citada antes do preço ("comprei 2 pizzas de 40": quantity 2, amount = 40). */
  quantity?: number;
  /** Outros lançamentos citados na mesma mensagem, no texto original ("e 30 na farmácia" => ['30 na farmácia']). */
  otherEntries?: string[];
  /** Estabelecimento/item citado numa consulta ("quanto gastei com ifood?" => 'ifood'), além da categoria. */
  term?: string;
  /** Frase no presente que descreve um hábito com valor ("recebo 9650 dia 5"): não é um lançamento. */
  habitual?: boolean;
}

export interface ParsedIntent {
  intent: IntentName;
  /** 0..1 */
  confidence: number;
  entities: ParsedEntities;
  raw: string;
  /** Texto normalizado (sem acentos, minúsculo). */
  normalized: string;
}

/* ------------------------------------------------------------------ */
/* Resposta                                                            */
/* ------------------------------------------------------------------ */

export type CardTone = 'positive' | 'negative' | 'neutral' | 'warning';

export type AgentCard =
  | { type: 'stat'; title: string; value: string; hint?: string; tone?: CardTone }
  | { type: 'list'; title: string; items: { label: string; value: string; hint?: string; tone?: CardTone }[] }
  | {
      type: 'progress';
      title: string;
      items: { label: string; current: Cents; target: Cents; hint?: string; tone?: CardTone }[];
    }
  | {
      type: 'chart';
      title: string;
      chart: 'bar' | 'pie';
      /** `value` em CENTAVOS (Cents); a interface formata com formatBRL/<Money>. */
      data: { label: string; value: number; color?: string }[];
    };

export interface TransactionDraft {
  type: TransactionType;
  amount: Cents;
  date: ISODate;
  description: string;
  categoryId: ID | null;
  /** null => a interface pede para o usuário escolher a conta antes de confirmar. */
  accountId: ID | null;
  toAccountId: ID | null;
  status: TransactionStatus;
  installments: number;
}

export interface GoalDraft {
  name: string;
  targetAmount: Cents;
  targetDate: ISODate | null;
  icon: string;
  color: string;
  priority: Priority;
  status: GoalStatus;
}

/** Ações PROPOSTAS pelo agente. Só são executadas após confirmação do usuário na interface. */
export type AgentAction =
  | { type: 'create_transaction'; label: string; draft: TransactionDraft }
  | { type: 'set_budget'; label: string; categoryId: ID; amount: Cents; month: MonthKey | null }
  | { type: 'create_goal'; label: string; draft: GoalDraft }
  | { type: 'contribute_goal'; label: string; goalId: ID; amount: Cents; date: ISODate }
  | { type: 'navigate'; label: string; to: string };

export interface AgentReply {
  intent: IntentName;
  /** Texto da resposta em pt-BR. Pode usar **negrito** e quebras de linha; listas com '• '. */
  text: string;
  cards: AgentCard[];
  actions: AgentAction[];
  /** Sugestões de próximas perguntas (chips clicáveis), 0..4. */
  suggestions: string[];
}

/** Memória curta da conversa para perguntas de continuação ("e no mês passado?", "e com mercado?"). */
export interface ConversationState {
  lastIntent?: IntentName;
  lastPeriod?: Period;
  lastCategoryId?: ID;
  lastAccountId?: ID;
  /**
   * Entidades da última resposta que uma continuação reaproveita: o rascunho de lançamento ("foi ontem",
   * "no cartão"), a compra simulada ("e em 10x?") ou o pedido à espera do valor (meta, transferência, aporte...).
   */
  lastEntities?: ParsedEntities;
  /** O Pat perguntou o valor ("Qual foi o valor?", "Quanto você quer juntar?"): o próximo valor completa `lastEntities`. */
  awaitingAmount?: boolean;
}

/* ------------------------------------------------------------------ */
/* Insights proativos                                                  */
/* ------------------------------------------------------------------ */

export type InsightSeverity = 'critico' | 'atencao' | 'info' | 'positivo';

export type InsightArea =
  | 'orcamento'
  | 'gastos'
  | 'economia'
  | 'dividas'
  | 'metas'
  | 'reserva'
  | 'fluxo'
  | 'recorrencia'
  | 'patrimonio'
  | 'dados';

export interface Insight {
  /** Estável para a mesma situação no mesmo mês (ex.: 'orcamento-estourado:cat-mercado:2026-10'). Usado para dispensar. */
  id: string;
  severity: InsightSeverity;
  area: InsightArea;
  title: string;
  message: string;
  /** 0..100 (maior = mais importante). */
  priority: number;
  action?: { label: string; to: string };
}

export interface MonthlyReport {
  month: MonthKey;
  title: string;
  /** Parágrafos narrativos em pt-BR. */
  paragraphs: string[];
  cards: AgentCard[];
}

export interface CategorySuggestion {
  categoryId: ID;
  /** 0..1 */
  confidence: number;
  reason: 'historico' | 'palavra_chave' | 'nome_categoria';
}
