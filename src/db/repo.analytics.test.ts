/**
 * Regras do repositório que dependem dos cálculos de análise (status de dívidas, histórico de bens).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { debtCurrentBalance, netWorthHistory } from '@/analytics';
import { addMonths, todayISO } from '@/domain/dates';
import { resetDb } from '@/test/render';
import { db } from './db';
import { addAsset, addDebt, addDebtPayment, deleteDebtPayment, loadFinanceData, updateAsset } from './repo';

beforeEach(async () => {
  await resetDb();
});

describe('dívidas com juros', () => {
  async function seedLoan() {
    // R$ 10.000,00 a 2% a.m., parcela de R$ 500,00 (são necessárias 26 parcelas).
    return addDebt({
      name: 'Empréstimo',
      creditor: 'Banco',
      type: 'emprestimo',
      originalAmount: 1000000,
      balance: 1000000,
      balanceDate: '2026-01-05',
      interestRate: 2,
      minimumPayment: 50000,
      dueDay: 10,
      remainingInstallments: null,
      status: 'ativa',
      notes: '',
    });
  }

  it('addDebtPayment só marca quitada quando o saldo amortizado (com juros) zera', async () => {
    const debt = await seedLoan();
    for (let i = 1; i <= 20; i++) await addDebtPayment({ debtId: debt.id, amount: 50000, date: addMonths('2026-01-10', i) });
    // Antes: 20 × 500 = 10.000 => 'quitada', com R$ 2.710,80 ainda devidos.
    expect((await db.debts.get(debt.id))?.status).toBe('ativa');
    const data = await loadFinanceData();
    expect(debtCurrentBalance(data.debts[0], data.debtPayments)).toBe(271080);

    for (let i = 21; i <= 26; i++) await addDebtPayment({ debtId: debt.id, amount: 50000, date: addMonths('2026-01-10', i) });
    expect((await db.debts.get(debt.id))?.status).toBe('quitada');
  });

  it('deleteDebtPayment reabre a dívida quando o saldo com juros volta a ser positivo', async () => {
    const debt = await seedLoan();
    // Quita em março: 10.000 + juros de jan e fev (2%) = 10.404,00.
    const payment = await addDebtPayment({ debtId: debt.id, amount: 1040400, date: '2026-03-10' });
    expect((await db.debts.get(debt.id))?.status).toBe('quitada');
    await deleteDebtPayment(payment.id);
    expect((await db.debts.get(debt.id))?.status).toBe('ativa');

    // R$ 10.000,00 pagos em março não bastam (antes: quitada).
    await addDebtPayment({ debtId: debt.id, amount: 1000000, date: '2026-03-10' });
    expect((await db.debts.get(debt.id))?.status).toBe('ativa');
  });
});

describe('bens arquivados', () => {
  it('updateAsset registra archivedAt ao arquivar (o histórico anterior mantém o bem) e limpa ao desarquivar', async () => {
    const asset = await addAsset(
      {
        name: 'Carro',
        type: 'veiculo',
        value: 5000000,
        acquisitionValue: null,
        acquisitionDate: null,
        notes: '',
        archived: false,
      },
      '2026-05-01',
    );
    await updateAsset(asset.id, { archived: true, archivedAt: '2026-09-20' });
    let data = await loadFinanceData();
    expect(data.assets[0]).toMatchObject({ archived: true, archivedAt: '2026-09-20' });
    // Antes: o bem sumia de todos os meses ao ser arquivado.
    expect(netWorthHistory(data, '2026-09', 2).map((p) => p.netWorth)).toEqual([5000000, 0]);

    await updateAsset(asset.id, { archived: false });
    expect((await db.assets.get(asset.id))?.archivedAt).toBeNull();

    // Sem data informada, vale hoje.
    await updateAsset(asset.id, { archived: true });
    data = await loadFinanceData();
    expect(data.assets[0].archivedAt).toBe(todayISO());
  });
});
