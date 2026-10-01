/**
 * Modelo de domínio do Patrimonius.
 *
 * Convenções (valem para TODO o código):
 * - Valores monetários são `Cents`: inteiros em centavos de real (R$ 12,34 => 1234). Nunca use float para dinheiro.
 * - Datas de calendário são `ISODate` no formato 'YYYY-MM-DD' (sem fuso horário).
 * - Meses são `MonthKey` no formato 'YYYY-MM'.
 * - Carimbos de tempo (createdAt/updatedAt) são `Timestamp`: ISO 8601 completo (new Date().toISOString()).
 * - IDs são strings (crypto.randomUUID()), exceto categorias padrão que têm IDs estáveis ('cat-...').
 */

export type ID = string;
/** Inteiro em centavos. */
export type Cents = number;
/** 'YYYY-MM-DD' */
export type ISODate = string;
/** 'YYYY-MM' */
export type MonthKey = string;
/** ISO 8601 completo, ex.: '2026-10-01T12:00:00.000Z' */
export type Timestamp = string;

interface Entity {
  id: ID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/* ------------------------------------------------------------------ */
/* Contas                                                              */
/* ------------------------------------------------------------------ */

export type AccountType = 'corrente' | 'poupanca' | 'carteira' | 'investimento' | 'cartao_credito' | 'outro';

export interface Account extends Entity {
  name: string;
  type: AccountType;
  /**
   * Saldo inicial da conta (pode ser negativo). Para cartão de crédito, uma fatura em aberto
   * no momento do cadastro deve ser informada como valor NEGATIVO.
   * Saldo atual = initialBalance + efeito de todos os lançamentos 'pago' (ver analytics/balances).
   */
  initialBalance: Cents;
  color: string;
  /** Emoji opcional. */
  icon: string;
  archived: boolean;
  /** Se entra no cálculo de patrimônio líquido. */
  includeInNetWorth: boolean;
  /** Somente cartão de crédito. */
  creditLimit: Cents | null;
  /** Somente cartão de crédito: dia de fechamento da fatura (1-31). */
  closingDay: number | null;
  /** Somente cartão de crédito: dia de vencimento da fatura (1-31). */
  dueDay: number | null;
}

/* ------------------------------------------------------------------ */
/* Categorias                                                          */
/* ------------------------------------------------------------------ */

export type CategoryKind = 'despesa' | 'receita';

/**
 * Grupo da regra 50/30/20 (somente categorias de despesa):
 * - necessidades: gastos essenciais (moradia, contas, mercado, saúde, transporte...)
 * - desejos: estilo de vida (lazer, restaurantes, compras, assinaturas...)
 * - objetivos: poupança, investimentos e pagamento de dívidas
 */
export type BudgetGroup = 'necessidades' | 'desejos' | 'objetivos';

export interface Category extends Entity {
  name: string;
  kind: CategoryKind;
  /** Emoji. */
  icon: string;
  color: string;
  /** Somente para kind === 'despesa'. */
  group: BudgetGroup | null;
  /** Palavras-chave (minúsculas, sem acento) usadas pela categorização automática. */
  keywords: string[];
  archived: boolean;
}

/* ------------------------------------------------------------------ */
/* Lançamentos                                                         */
/* ------------------------------------------------------------------ */

export type TransactionType = 'despesa' | 'receita' | 'transferencia';

/** 'pago' afeta o saldo atual; 'pendente' só entra em projeções/previsões. */
export type TransactionStatus = 'pago' | 'pendente';

export interface InstallmentInfo {
  /** Mesmo groupId para todas as parcelas de uma compra parcelada. */
  groupId: ID;
  /** 1-based. */
  number: number;
  total: number;
}

export interface Transaction extends Entity {
  type: TransactionType;
  /** Sempre > 0. O sinal é dado pelo `type`. */
  amount: Cents;
  date: ISODate;
  description: string;
  /** null somente para transferências. */
  categoryId: ID | null;
  /**
   * despesa: conta de onde saiu o dinheiro (ou cartão de crédito usado);
   * receita: conta onde entrou;
   * transferencia: conta de origem.
   */
  accountId: ID;
  /** Somente transferências: conta de destino. */
  toAccountId: ID | null;
  status: TransactionStatus;
  notes: string;
  tags: string[];
  /** Regra de recorrência que gerou este lançamento, se houver. */
  recurringId: ID | null;
  installment: InstallmentInfo | null;
}

/* ------------------------------------------------------------------ */
/* Recorrências                                                        */
/* ------------------------------------------------------------------ */

export type Frequency = 'semanal' | 'quinzenal' | 'mensal' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';

export interface RecurringRule extends Entity {
  type: 'despesa' | 'receita';
  amount: Cents;
  description: string;
  categoryId: ID;
  accountId: ID;
  frequency: Frequency;
  startDate: ISODate;
  /** Última data possível (inclusive) ou null para indeterminado. */
  endDate: ISODate | null;
  /** Próxima ocorrência ainda NÃO materializada como lançamento. */
  nextDate: ISODate;
  /**
   * Se true, o app cria automaticamente lançamentos 'pendente' para as ocorrências
   * até o fim do mês corrente (o usuário confirma o pagamento depois).
   */
  autoGenerate: boolean;
  active: boolean;
}

/* ------------------------------------------------------------------ */
/* Orçamentos                                                          */
/* ------------------------------------------------------------------ */

export interface Budget extends Entity {
  categoryId: ID;
  amount: Cents;
  /**
   * Mês específico ('YYYY-MM') ou null = orçamento padrão que vale para todos os meses
   * sem um orçamento específico para a categoria.
   */
  month: MonthKey | null;
}

/* ------------------------------------------------------------------ */
/* Metas                                                               */
/* ------------------------------------------------------------------ */

export type Priority = 'alta' | 'media' | 'baixa';
export type GoalStatus = 'ativa' | 'concluida' | 'pausada';

export interface Goal extends Entity {
  name: string;
  targetAmount: Cents;
  targetDate: ISODate | null;
  icon: string;
  color: string;
  priority: Priority;
  status: GoalStatus;
  /** Conta onde o dinheiro da meta fica guardado (opcional, informativo). */
  accountId: ID | null;
  notes: string;
}

export interface GoalContribution {
  id: ID;
  goalId: ID;
  /** Positivo = aporte; negativo = resgate. */
  amount: Cents;
  date: ISODate;
  note: string;
  /** Lançamento vinculado (ex.: transferência para a poupança), se o usuário optou por criar. */
  transactionId: ID | null;
  createdAt: Timestamp;
}

/* ------------------------------------------------------------------ */
/* Dívidas                                                             */
/* ------------------------------------------------------------------ */

export type DebtType = 'cartao' | 'emprestimo' | 'financiamento' | 'cheque_especial' | 'pessoal' | 'outro';
export type DebtStatus = 'ativa' | 'quitada';

export interface Debt extends Entity {
  name: string;
  creditor: string;
  type: DebtType;
  /** Valor originalmente contratado (informativo). */
  originalAmount: Cents;
  /**
   * Saldo devedor na data `balanceDate`. O saldo atual é uma estimativa amortizada mês a mês (ver
   * analytics/debts `debtCurrentBalance`): a cada pagamento com date >= balanceDate, somam-se os juros mensais
   * (`interestRate`) das viradas de mês desde o pagamento anterior e desconta-se o valor pago (mínimo 0).
   * Sem juros, é `balance - soma(pagamentos com date >= balanceDate)`.
   */
  balance: Cents;
  balanceDate: ISODate;
  /** Juros MENSAIS em porcentagem (ex.: 2.5 = 2,5% a.m.). */
  interestRate: number;
  /** Parcela/pagamento mínimo mensal. */
  minimumPayment: Cents;
  /** Dia de vencimento (1-31) ou null. */
  dueDay: number | null;
  /** Parcelas restantes, se for parcelado (informativo). */
  remainingInstallments: number | null;
  status: DebtStatus;
  notes: string;
}

export interface DebtPayment {
  id: ID;
  debtId: ID;
  amount: Cents;
  date: ISODate;
  note: string;
  /** Lançamento de despesa vinculado, se o usuário optou por criar. */
  transactionId: ID | null;
  createdAt: Timestamp;
}

/* ------------------------------------------------------------------ */
/* Bens / Patrimônio                                                   */
/* ------------------------------------------------------------------ */

export type AssetType =
  | 'imovel'
  | 'veiculo'
  | 'investimento'
  | 'previdencia'
  | 'participacao'
  | 'bem_pessoal'
  | 'outro';

export interface Asset extends Entity {
  name: string;
  type: AssetType;
  /** Valor atual estimado (o mesmo da avaliação mais recente). */
  value: Cents;
  acquisitionValue: Cents | null;
  acquisitionDate: ISODate | null;
  notes: string;
  archived: boolean;
  /**
   * Data em que o bem foi arquivado (ex.: vendido). A partir dela ele deixa de contar no patrimônio; antes, o histórico
   * o mantém. null/ausente se não estiver arquivado (ou em dados antigos, arquivados antes deste campo existir).
   */
  archivedAt?: ISODate | null;
}

/** Histórico de avaliações de um bem (para a evolução do patrimônio). */
export interface AssetValuation {
  id: ID;
  assetId: ID;
  value: Cents;
  date: ISODate;
  createdAt: Timestamp;
}

/* ------------------------------------------------------------------ */
/* Configurações                                                       */
/* ------------------------------------------------------------------ */

export type ThemePreference = 'system' | 'light' | 'dark';

export interface Settings {
  /** Sempre 'settings' (registro único). */
  id: 'settings';
  userName: string;
  /** Nome do agente financeiro. */
  agentName: string;
  /** Meta de reserva de emergência em meses de custo essencial (padrão 6). */
  emergencyFundTargetMonths: number;
  /** Meta de taxa de poupança em % da renda (padrão 20). */
  savingsRateTarget: number;
  /** Renda mensal estimada informada pelo usuário (usada quando há pouco histórico). */
  monthlyIncomeEstimate: Cents | null;
  theme: ThemePreference;
  onboardingDone: boolean;
  /** Ocultar valores na interface (modo privacidade). */
  hideValues: boolean;
  /** Insights dispensados: id do insight -> MonthKey em que foi dispensado (volta no mês seguinte). */
  dismissedInsights: Record<string, MonthKey>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/* ------------------------------------------------------------------ */
/* Conversa com o agente                                               */
/* ------------------------------------------------------------------ */

export interface ChatMessage {
  id: ID;
  role: 'user' | 'agent';
  text: string;
  createdAt: Timestamp;
  /** Dados estruturados da resposta do agente (cards, ações propostas, sugestões). */
  payload: unknown | null;
}

/* ------------------------------------------------------------------ */
/* Agregado com todos os dados (entrada das análises e do agente)      */
/* ------------------------------------------------------------------ */

export interface FinanceData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  recurring: RecurringRule[];
  budgets: Budget[];
  goals: Goal[];
  goalContributions: GoalContribution[];
  debts: Debt[];
  debtPayments: DebtPayment[];
  assets: Asset[];
  assetValuations: AssetValuation[];
  settings: Settings;
}

/* ------------------------------------------------------------------ */
/* Rótulos em pt-BR (para selects e exibição)                          */
/* ------------------------------------------------------------------ */

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  corrente: 'Conta corrente',
  poupanca: 'Poupança',
  carteira: 'Carteira (dinheiro)',
  investimento: 'Investimentos',
  cartao_credito: 'Cartão de crédito',
  outro: 'Outra',
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  despesa: 'Despesa',
  receita: 'Receita',
  transferencia: 'Transferência',
};

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  mensal: 'Mensal',
  bimestral: 'Bimestral',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

export const BUDGET_GROUP_LABELS: Record<BudgetGroup, string> = {
  necessidades: 'Necessidades (50%)',
  desejos: 'Desejos (30%)',
  objetivos: 'Objetivos financeiros (20%)',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

export const DEBT_TYPE_LABELS: Record<DebtType, string> = {
  cartao: 'Cartão de crédito',
  emprestimo: 'Empréstimo',
  financiamento: 'Financiamento',
  cheque_especial: 'Cheque especial',
  pessoal: 'Dívida pessoal',
  outro: 'Outra',
};

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  imovel: 'Imóvel',
  veiculo: 'Veículo',
  investimento: 'Investimento',
  previdencia: 'Previdência',
  participacao: 'Participação societária',
  bem_pessoal: 'Bem pessoal',
  outro: 'Outro',
};
