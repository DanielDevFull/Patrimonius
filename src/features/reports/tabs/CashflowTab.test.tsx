import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { FinanceData } from '@/domain/types';
import { makeData, makeTransaction } from '@/test/factories';
import { renderWithProviders, resetDb } from '@/test/render';
import { CashflowTab } from './CashflowTab';

function dataWithTarget(savingsRateTarget: number): FinanceData {
  const base = makeData();
  return makeData({
    transactions: [
      makeTransaction({ accountId: 'cc', type: 'receita', amount: 500000, date: '2026-09-05', categoryId: CATEGORY_IDS.salario }),
      makeTransaction({ accountId: 'cc', type: 'despesa', amount: 450000, date: '2026-09-10', categoryId: CATEGORY_IDS.mercado }),
    ],
    settings: { ...base.settings, savingsRateTarget },
  });
}

describe('CashflowTab — meta de poupança', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('mostra a meta das Configurações', () => {
    renderWithProviders(<CashflowTab data={dataWithTarget(25)} months={['2026-08', '2026-09']} />);
    expect(screen.getByText('Meta: 25% da renda')).toBeInTheDocument();
  });

  it('com 0% (sem meta) não inventa uma meta de 20%', () => {
    renderWithProviders(<CashflowTab data={dataWithTarget(0)} months={['2026-08', '2026-09']} />);
    expect(screen.getByText('Sem meta de poupança definida')).toBeInTheDocument();
    expect(screen.queryByText(/Meta: 20%/)).not.toBeInTheDocument();
  });
});
