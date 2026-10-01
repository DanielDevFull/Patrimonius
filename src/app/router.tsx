/* eslint-disable react-refresh/only-export-components -- páginas carregadas sob demanda */
import { lazy } from 'react';
import { createHashRouter, type RouteObject } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { ROUTES } from './navigation';
import { NotFound } from './NotFound';
import { RouteError } from './RouteError';

const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const AssistantPage = lazy(() => import('@/features/assistant/AssistantPage'));
const TransactionsPage = lazy(() => import('@/features/transactions/TransactionsPage'));
const AccountsPage = lazy(() => import('@/features/accounts/AccountsPage'));
const BudgetsPage = lazy(() => import('@/features/budgets/BudgetsPage'));
const GoalsPage = lazy(() => import('@/features/goals/GoalsPage'));
const DebtsPage = lazy(() => import('@/features/debts/DebtsPage'));
const NetWorthPage = lazy(() => import('@/features/networth/NetWorthPage'));
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'));
const SimulatorsPage = lazy(() => import('@/features/simulators/SimulatorsPage'));
const RecurringPage = lazy(() => import('@/features/recurring/RecurringPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));

/**
 * Rotas do app. Erros de renderização (ou de carregamento de uma página) caem em RouteError, em pt-BR:
 * - na rota-layout sem path que envolve as páginas → o AppShell (menu) continua visível;
 * - na raiz → último recurso, quando o próprio AppShell falha.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError fullPage />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: ROUTES.assistant.slice(1), element: <AssistantPage /> },
          { path: ROUTES.transactions.slice(1), element: <TransactionsPage /> },
          { path: ROUTES.accounts.slice(1), element: <AccountsPage /> },
          { path: ROUTES.budgets.slice(1), element: <BudgetsPage /> },
          { path: ROUTES.goals.slice(1), element: <GoalsPage /> },
          { path: ROUTES.debts.slice(1), element: <DebtsPage /> },
          { path: ROUTES.netWorth.slice(1), element: <NetWorthPage /> },
          { path: ROUTES.reports.slice(1), element: <ReportsPage /> },
          { path: ROUTES.simulators.slice(1), element: <SimulatorsPage /> },
          { path: ROUTES.recurring.slice(1), element: <RecurringPage /> },
          { path: ROUTES.settings.slice(1), element: <SettingsPage /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
];

/** HashRouter: funciona em qualquer hospedagem estática e offline (file/PWA). */
export const router = createHashRouter(routes);
