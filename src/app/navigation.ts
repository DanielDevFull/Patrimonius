import {
  ArrowLeftRight,
  Bot,
  Calculator,
  ChartPie,
  Gem,
  LayoutDashboard,
  Landmark,
  PiggyBank,
  Repeat,
  Settings,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/** Rotas do app (use estas constantes em links e nas ações do agente/insights). */
export const ROUTES = {
  dashboard: '/',
  assistant: '/assistente',
  transactions: '/lancamentos',
  accounts: '/contas',
  budgets: '/orcamentos',
  goals: '/metas',
  debts: '/dividas',
  netWorth: '/patrimonio',
  reports: '/relatorios',
  simulators: '/simuladores',
  recurring: '/recorrencias',
  settings: '/configuracoes',
} as const;

/**
 * Abre o formulário de novo lançamento na página de lançamentos.
 * A página de lançamentos lê `?novo=despesa|receita|transferencia` e abre o formulário.
 */
export function newTransactionPath(type: 'despesa' | 'receita' | 'transferencia' = 'despesa'): string {
  return `${ROUTES.transactions}?novo=${type}`;
}

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { to: ROUTES.dashboard, label: 'Painel', icon: LayoutDashboard },
  { to: ROUTES.assistant, label: 'Assistente', icon: Bot },
  { to: ROUTES.transactions, label: 'Lançamentos', icon: ArrowLeftRight },
  { to: ROUTES.accounts, label: 'Contas', icon: Wallet },
  { to: ROUTES.budgets, label: 'Orçamentos', icon: PiggyBank },
  { to: ROUTES.goals, label: 'Metas', icon: Target },
  { to: ROUTES.debts, label: 'Dívidas', icon: Landmark },
  { to: ROUTES.netWorth, label: 'Patrimônio', icon: Gem },
  { to: ROUTES.reports, label: 'Relatórios', icon: ChartPie },
  { to: ROUTES.simulators, label: 'Simuladores', icon: Calculator },
  { to: ROUTES.recurring, label: 'Recorrências', icon: Repeat },
  { to: ROUTES.settings, label: 'Configurações', icon: Settings },
];

/** Itens fixos da barra inferior no celular (o restante fica em "Mais"). */
export const MOBILE_PRIMARY: string[] = [ROUTES.dashboard, ROUTES.transactions, ROUTES.assistant];
