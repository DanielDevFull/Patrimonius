/**
 * CONTRATO dos tipos de resultado das análises financeiras.
 * Estes tipos são consumidos pelas telas e pelo agente — não altere nomes/campos sem atualizar todos os usos.
 */
import type {
  AccountType,
  AssetType,
  Cents,
  Debt,
  Frequency,
  ID,
  ISODate,
  MonthKey,
  TransactionType,
} from '@/domain/types';

export interface BalanceOptions {
  /** Considera apenas lançamentos com date <= asOf. Se omitido, considera todos. Para "saldo atual" passe hoje. */
  asOf?: ISODate;
  /** Se true, lançamentos 'pendente' também entram (saldo projetado). Padrão false. */
  includePending?: boolean;
}

export interface MonthSummary {
  month: MonthKey;
  /** Total de receitas do mês (pagas + pendentes, salvo includePending=false). Transferências não entram. */
  income: Cents;
  /** Total de despesas do mês (pagas + pendentes, salvo includePending=false). Transferências não entram. */
  expense: Cents;
  /** income - expense */
  net: Cents;
  /** Despesas na categoria de investimentos/reserva (CATEGORY_IDS.investimentos) — dinheiro poupado. */
  invested: Cents;
  /** (net + invested) / income; null quando income === 0. */
  savingsRate: number | null;
  paidIncome: Cents;
  paidExpense: Cents;
  pendingIncome: Cents;
  pendingExpense: Cents;
  /** Quantidade de receitas + despesas (sem transferências). */
  transactionCount: number;
}

export interface CategoryTotal {
  categoryId: ID | null;
  name: string;
  icon: string;
  color: string;
  total: Cents;
  /** Fração (0..1) do total do tipo no período. */
  share: number;
  count: number;
}

export interface GroupBreakdown {
  month: MonthKey;
  income: Cents;
  necessidades: Cents;
  desejos: Cents;
  objetivos: Cents;
  /** Despesas cuja categoria não tem grupo (ou categoria inexistente). */
  semGrupo: Cents;
  /** Participação de cada grupo sobre a renda (null se renda = 0). */
  shares: { necessidades: number | null; desejos: number | null; objetivos: number | null };
  /** Valores ideais pela regra 50/30/20 sobre a renda do mês. */
  ideal: { necessidades: Cents; desejos: Cents; objetivos: Cents };
}

export type BudgetHealth = 'ok' | 'alerta' | 'estourado';

export interface BudgetStatus {
  categoryId: ID;
  categoryName: string;
  icon: string;
  color: string;
  budgetId: ID;
  /** true se veio de um orçamento padrão (month === null). */
  isDefault: boolean;
  budgeted: Cents;
  /** Despesas (pagas + pendentes) da categoria no mês. */
  spent: Cents;
  /** budgeted - spent (pode ser negativo). */
  remaining: Cents;
  /** spent / budgeted (0 quando budgeted = 0 e spent = 0; Infinity se budgeted = 0 e spent > 0). */
  percent: number;
  /**
   * Projeção para o fim do mês. Mês corrente: spent / diasDecorridos * diasNoMês (arredondado).
   * Mês passado: spent. Mês futuro: spent.
   */
  projected: Cents;
  /** 'estourado' se spent > budgeted; 'alerta' se percent >= 0.8 ou projected > budgeted; senão 'ok'. */
  status: BudgetHealth;
}

export interface BudgetOverview {
  month: MonthKey;
  totalBudgeted: Cents;
  totalSpent: Cents;
  totalRemaining: Cents;
  /** totalSpent / totalBudgeted (0 se não houver orçamento). */
  percent: number;
  /** Ordenados por percent desc. */
  items: BudgetStatus[];
  /** Despesas do mês em categorias sem orçamento. */
  unbudgetedSpent: Cents;
}

export interface BudgetSuggestion {
  categoryId: ID;
  /** Média mensal das despesas nos meses analisados. */
  average: Cents;
  /** Sugestão arredondada para cima em múltiplos de R$ 10 (1000 centavos). */
  suggested: Cents;
  /** Quantos meses tiveram gasto na categoria. */
  monthsWithData: number;
}

export interface ForecastPoint {
  date: ISODate;
  balance: Cents;
}

export interface CashflowForecast {
  today: ISODate;
  /** Último dia projetado (padrão: fim do mês de `today`). */
  until: ISODate;
  /** Saldo atual (contas não arquivadas, lançamentos pagos com date <= today). */
  currentBalance: Cents;
  /** Receitas esperadas no período (pendentes + futuras + recorrências ainda não materializadas). */
  expectedIncome: Cents;
  /** Despesas esperadas no período (pendentes + futuras + recorrências ainda não materializadas). */
  expectedExpense: Cents;
  /** Estimativa de gastos variáveis (não recorrentes) nos dias restantes, pela média diária dos últimos 3 meses. */
  projectedVariableSpending: Cents;
  /** currentBalance + expectedIncome - expectedExpense - projectedVariableSpending */
  projectedEndBalance: Cents;
  /** Ponto de menor saldo projetado no período. */
  lowestPoint: ForecastPoint;
  /** Um ponto por dia, de today até until (inclusive). */
  points: ForecastPoint[];
  willGoNegative: boolean;
}

export interface UpcomingItem {
  date: ISODate;
  description: string;
  amount: Cents;
  type: 'despesa' | 'receita';
  source: 'pendente' | 'recorrencia';
  transactionId: ID | null;
  recurringId: ID | null;
  /** date < today (somente para lançamentos pendentes). */
  overdue: boolean;
}

export interface RecurringCandidate {
  /** Chave estável (descrição normalizada + tipo). */
  key: string;
  description: string;
  type: TransactionType;
  /** Mediana dos valores. */
  amount: Cents;
  categoryId: ID | null;
  accountId: ID;
  frequency: Frequency;
  occurrences: number;
  lastDate: ISODate;
  nextExpectedDate: ISODate;
}

export interface DebtItemOverview {
  debt: Debt;
  currentBalance: Cents;
  /** Juros estimados por mês sobre o saldo atual. */
  monthlyInterest: Cents;
  /** Soma de todos os pagamentos registrados. */
  paidTotal: Cents;
  /** 1 - currentBalance / originalAmount (0..1); 0 se originalAmount = 0. */
  progress: number;
}

export interface DebtsOverview {
  /** Somente dívidas ativas. */
  totalBalance: Cents;
  totalMinimum: Cents;
  /** Taxa mensal média ponderada pelo saldo (% a.m.); 0 se não houver dívidas. */
  weightedRate: number;
  monthlyInterest: Cents;
  /** Ativas primeiro, ordenadas por taxa desc. */
  items: DebtItemOverview[];
}

export type PayoffStrategy = 'avalanche' | 'snowball';

export interface PayoffDebtInput {
  id: ID;
  name: string;
  balance: Cents;
  /** % ao mês */
  monthlyRatePct: number;
  minimumPayment: Cents;
}

export interface PayoffPlan {
  strategy: PayoffStrategy;
  /** false se o orçamento não cobre os mínimos ou se alguma dívida nunca diminui dentro de maxMonths. */
  feasible: boolean;
  /** Meses até quitar tudo (ou maxMonths se inviável). */
  months: number;
  totalInterest: Cents;
  totalPaid: Cents;
  /** Mês (1-based) em que cada dívida é quitada, em ordem de quitação. */
  payoffOrder: { debtId: ID; name: string; month: number }[];
  /** Saldo total ao fim de cada mês (month 0 = saldo inicial). */
  timeline: { month: number; totalBalance: Cents }[];
}

export interface StrategyComparison {
  avalanche: PayoffPlan;
  snowball: PayoffPlan;
  /** Estratégia com menor custo total de juros (empate => 'snowball', mais motivadora). */
  recommended: PayoffStrategy;
  /** snowball.totalInterest - avalanche.totalInterest (>= 0 normalmente). */
  interestSavings: Cents;
}

export type GoalTrack = 'concluida' | 'no_ritmo' | 'atrasada' | 'sem_prazo' | 'vencida' | 'pausada';

export interface GoalProgress {
  goalId: ID;
  name: string;
  icon: string;
  color: string;
  targetAmount: Cents;
  targetDate: ISODate | null;
  saved: Cents;
  remaining: Cents;
  /** saved / targetAmount limitado a [0, 1]. */
  percent: number;
  /** Meses restantes até o mês do prazo (mínimo 1 se o prazo é futuro; 0 se vencido; null sem prazo). */
  monthsLeft: number | null;
  /** Aporte mensal necessário para cumprir o prazo (null sem prazo). */
  requiredMonthly: Cents | null;
  /** Média de aportes líquidos por mês nos últimos 3 meses (incluindo o atual). */
  averageMonthlyContribution: Cents;
  /** Data estimada de conclusão no ritmo atual (null se ritmo <= 0 e não concluída). */
  projectedCompletionDate: ISODate | null;
  track: GoalTrack;
}

export interface GoalsOverview {
  totalTarget: Cents;
  totalSaved: Cents;
  activeCount: number;
  completedCount: number;
  /** Soma dos requiredMonthly das metas ativas. */
  totalRequiredMonthly: Cents;
  items: GoalProgress[];
}

export interface NetWorthAccountLine {
  accountId: ID;
  name: string;
  type: AccountType;
  balance: Cents;
}

export interface NetWorthBreakdown {
  asOf: ISODate;
  accounts: NetWorthAccountLine[];
  /** Soma dos saldos positivos das contas (incluídas no patrimônio). */
  accountsPositive: Cents;
  /** Soma (em módulo) dos saldos negativos das contas (ex.: fatura de cartão, cheque especial). */
  accountsNegative: Cents;
  assetsTotal: Cents;
  byAssetType: { type: AssetType; label: string; total: Cents }[];
  debtsTotal: Cents;
  totalAssets: Cents;
  totalLiabilities: Cents;
  netWorth: Cents;
}

export interface NetWorthPoint {
  month: MonthKey;
  totalAssets: Cents;
  totalLiabilities: Cents;
  netWorth: Cents;
}

export type EmergencyFundLevel = 'sem_dados' | 'critica' | 'baixa' | 'parcial' | 'completa';

export interface EmergencyFundStatus {
  /** Saldo positivo (pago, até hoje) das contas não arquivadas dos tipos corrente, poupança, carteira e investimento. */
  reserve: Cents;
  /** Custo essencial mensal estimado (média de 'necessidades' nos últimos 3 meses completos, com fallbacks). */
  monthlyEssential: Cents;
  monthsCovered: number | null;
  targetMonths: number;
  target: Cents;
  gap: Cents;
  level: EmergencyFundLevel;
}

export type HealthGrade = 'excelente' | 'boa' | 'regular' | 'atencao' | 'critica';

export interface HealthComponent {
  key: 'poupanca' | 'reserva' | 'dividas' | 'orcamento' | 'metas' | 'fluxo';
  label: string;
  /** 0..100 */
  score: number;
  /** Peso (soma dos pesos = 100). */
  weight: number;
  /** Valor legível, ex.: '18% da renda'. */
  value: string;
  /** Dica curta em pt-BR para melhorar o componente. */
  tip: string;
}

export interface HealthReport {
  /** 0..100 inteiro */
  score: number;
  grade: HealthGrade;
  components: HealthComponent[];
  /** Qualidade dos dados para a avaliação. */
  dataQuality: 'insuficiente' | 'parcial' | 'boa';
}

export interface GrowthPoint {
  month: number;
  contributed: Cents;
  interest: Cents;
  total: Cents;
}

export type AffordabilityVerdict = 'sim' | 'com_cautela' | 'nao';

export interface AffordabilityResult {
  amount: Cents;
  installments: number;
  /** Valor que sai no mês corrente (amount / installments arredondado). */
  firstPayment: Cents;
  verdict: AffordabilityVerdict;
  /** Saldo projetado no fim do mês ANTES da compra. */
  projectedEndBalance: Cents;
  /** Saldo projetado no fim do mês DEPOIS da compra. */
  balanceAfter: Cents;
  /** Sobra mensal média (receitas - despesas) dos últimos 3 meses completos. */
  averageMonthlySurplus: Cents;
  /** Frases curtas em pt-BR explicando o veredito. */
  reasons: string[];
}
