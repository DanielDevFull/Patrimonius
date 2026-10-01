import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateInsights } from '@/agent/insights';
import { monthlyReport } from '@/agent/report';
import { CATEGORY_IDS } from '@/domain/defaults';
import type { Account, Category } from '@/domain/types';
import { makeAccount, makeBudget, makeTransaction } from '@/test/factories';
import { resetDb } from '@/test/render';
import {
  backupCounts,
  backupFileName,
  csvDecimal,
  csvField,
  csvText,
  downloadBackup,
  downloadCSV,
  exportBackup,
  importBackup,
  parseBackupText,
  resetAllData,
  transactionsToCSV,
  validateBackup,
  type BackupFile,
} from './backup';
import { DATA_TABLES, db } from './db';
import { loadDemoData } from './demo';
import {
  addAccount,
  addAsset,
  addCategory,
  addChatMessage,
  addDebt,
  addDebtPayment,
  addGoal,
  addGoalContribution,
  addRecurring,
  addTransaction,
  deleteBudget,
  loadFinanceData,
  revalueAsset,
  runRecurring,
  setBudget,
  setTransactionStatus,
  updateSettings,
} from './repo';

const accountInput = (p: Partial<Account> = {}): Omit<Account, 'id' | 'createdAt' | 'updatedAt'> => ({
  name: 'Conta corrente',
  type: 'corrente',
  initialBalance: 150000,
  color: '#0f766e',
  icon: '🏦',
  archived: false,
  includeInNetWorth: true,
  creditLimit: null,
  closingDay: null,
  dueDay: null,
  ...p,
});

/** Popula todas as tabelas usando o repositório. */
async function seedEverything(): Promise<void> {
  const checking = await addAccount(accountInput());
  const card = await addAccount(
    accountInput({ name: 'Cartão', type: 'cartao_credito', initialBalance: -50000, creditLimit: 500000, closingDay: 3, dueDay: 10 }),
  );
  const savings = await addAccount(accountInput({ name: 'Poupança', type: 'poupanca', initialBalance: 0 }));
  const custom = await addCategory({
    name: 'Viagens',
    kind: 'despesa',
    icon: '🧳',
    color: '#2563eb',
    group: 'desejos',
    keywords: ['hotel', 'passagem'],
    archived: false,
  });
  await addTransaction({
    type: 'despesa',
    amount: 12345,
    date: '2026-09-10',
    description: 'Mercado; "promoção"',
    categoryId: CATEGORY_IDS.mercado,
    accountId: checking.id,
    notes: 'linha 1\nlinha 2',
    tags: ['casa'],
  });
  await addTransaction({
    type: 'despesa',
    amount: 100000,
    date: '2026-09-15',
    description: 'Hotel',
    categoryId: custom.id,
    accountId: card.id,
    installments: 4,
  });
  await addTransaction({
    type: 'transferencia',
    amount: 20000,
    date: '2026-09-20',
    description: 'Guardar',
    categoryId: null,
    accountId: checking.id,
    toAccountId: savings.id,
  });
  await addRecurring({
    type: 'despesa',
    amount: 4490,
    description: 'Streaming',
    categoryId: CATEGORY_IDS.assinaturas,
    accountId: card.id,
    frequency: 'mensal',
    startDate: '2026-09-05',
    endDate: null,
    autoGenerate: false,
    active: true,
  });
  await setBudget(CATEGORY_IDS.mercado, 150000, null);
  await setBudget(CATEGORY_IDS.mercado, 180000, '2026-10');
  const goal = await addGoal({
    name: 'Reserva',
    targetAmount: 1000000,
    targetDate: null,
    icon: '🛟',
    color: '#16a34a',
    priority: 'alta',
    status: 'ativa',
    accountId: savings.id,
    notes: '',
  });
  await addGoalContribution({ goalId: goal.id, amount: 30000, date: '2026-09-21', fromAccountId: checking.id });
  const debt = await addDebt({
    name: 'Empréstimo',
    creditor: 'Banco',
    type: 'emprestimo',
    originalAmount: 500000,
    balance: 400000,
    balanceDate: '2026-09-01',
    interestRate: 3.5,
    minimumPayment: 30000,
    dueDay: 20,
    remainingInstallments: 12,
    status: 'ativa',
    notes: 'observação',
  });
  await addDebtPayment({ debtId: debt.id, amount: 30000, date: '2026-09-20', fromAccountId: checking.id });
  const asset = await addAsset(
    {
      name: 'Carro',
      type: 'veiculo',
      value: 5000000,
      acquisitionValue: 6000000,
      acquisitionDate: '2024-01-10',
      notes: '',
      archived: false,
    },
    '2026-08-01',
  );
  await revalueAsset(asset.id, 4900000, '2026-09-01');
  await addChatMessage('user', 'Quanto gastei?');
  await addChatMessage('agent', 'Você gastou R$ 123,45.', { kind: 'resumo', total: 12345 });
  await updateSettings({ userName: 'Ana', agentName: 'Lia', theme: 'dark', hideValues: true, monthlyIncomeEstimate: 800000 });
}

/** Clona como se o arquivo fosse salvo e lido de novo. */
function throughJSON(backup: BackupFile): unknown {
  return JSON.parse(JSON.stringify(backup));
}

function validBackup(): BackupFile {
  const data = Object.fromEntries(DATA_TABLES.map((t) => [t, [] as unknown[]])) as BackupFile['data'];
  return { app: 'patrimonius', version: 1, exportedAt: '2026-10-01T12:00:00.000Z', data };
}

function withRows(table: keyof BackupFile['data'], rows: unknown[]): unknown {
  const b = validBackup();
  b.data[table] = rows;
  return b;
}

describe('backup: exportação, importação e limpeza', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('round-trip: exportar -> apagar -> importar (substituir) restaura exatamente os mesmos dados', async () => {
    await seedEverything();
    const before = await exportBackup();
    expect(before.app).toBe('patrimonius');
    expect(before.version).toBe(1);
    for (const t of DATA_TABLES) expect(Array.isArray(before.data[t])).toBe(true);
    expect(before.data.transactions.length).toBe(1 + 4 + 1 + 1 + 1); // simples + 4 parcelas + transf. + aporte + pagamento

    const file = throughJSON(before);
    await resetAllData();
    expect(await db.accounts.count()).toBe(0);
    expect(await db.transactions.count()).toBe(0);

    const result = validateBackup(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const total = await importBackup(result.backup, 'replace');
    expect(total).toBe(Object.values(backupCounts(result.backup)).reduce((a, b) => a + b, 0));

    const after = await exportBackup();
    for (const t of DATA_TABLES) expect(after.data[t], `tabela ${t}`).toEqual(before.data[t]);
  });

  it('substituir remove registros que não estão no backup', async () => {
    await seedEverything();
    const backup = await exportBackup();
    await addAccount(accountInput({ name: 'Conta criada depois' }));
    await importBackup(backup, 'replace');
    const names = (await db.accounts.toArray()).map((a) => a.name);
    expect(names).not.toContain('Conta criada depois');
    expect(names).toHaveLength(3);
  });

  it('mesclar mantém os dados atuais e atualiza registros com o mesmo id', async () => {
    const existing = await addAccount(accountInput({ name: 'Original' }));
    const backup = validBackup();
    backup.data.accounts = [
      { ...existing, name: 'Renomeada no backup' },
      makeAccount({ id: 'acc-do-backup', name: 'Nova do backup' }),
    ];
    const other = await addAccount(accountInput({ name: 'Só local' }));
    await importBackup(backup, 'merge');
    const byId = Object.fromEntries((await db.accounts.toArray()).map((a) => [a.id, a.name]));
    expect(byId[existing.id]).toBe('Renomeada no backup');
    expect(byId[other.id]).toBe('Só local');
    expect(byId['acc-do-backup']).toBe('Nova do backup');
    // Categorias e configurações continuam existindo.
    expect(await db.categories.count()).toBeGreaterThan(0);
    expect((await db.settings.get('settings'))?.userName).toBe('Teste');
  });

  it('importar backup sem categorias/configurações recria os padrões; configurações antigas são completadas', async () => {
    const backup = validBackup();
    backup.data.settings = [{ id: 'settings', userName: 'Bia', onboardingDone: true }];
    await importBackup(backup, 'replace');
    expect(await db.categories.get(CATEGORY_IDS.mercado)).toBeDefined();
    const s = await db.settings.get('settings');
    expect(s?.userName).toBe('Bia');
    expect(s?.agentName).toBe('Pat');
    expect(s?.emergencyFundTargetMonths).toBe(6);
    expect(s?.dismissedInsights).toEqual({});
  });

  it('configurações com campos nulos ou de tipo errado voltam ao padrão (sem derrubar Configurações)', async () => {
    const backup = validBackup();
    backup.data.settings = [
      {
        id: 'settings',
        userName: null,
        agentName: null,
        emergencyFundTargetMonths: 'seis',
        hideValues: 'sim',
        dismissedInsights: null,
        onboardingDone: true,
      },
    ];
    expect(validateBackup(backup).ok).toBe(true);
    await importBackup(backup, 'replace');
    const s = await db.settings.get('settings');
    expect(s).toMatchObject({
      userName: '',
      agentName: 'Pat',
      emergencyFundTargetMonths: 6,
      hideValues: false,
      dismissedInsights: {},
      onboardingDone: true,
    });
  });

  it('importar backup sem campos não essenciais (ícone de categoria, cor de conta...) completa os padrões', async () => {
    await loadDemoData('2026-10-01');
    const file = throughJSON(await exportBackup()) as BackupFile;
    const category = file.data.categories.find((c) => (c as Category).id === 'cat-alimentacao-fora') as Record<
      string,
      unknown
    >;
    delete category.icon;
    delete category.keywords;
    const account = file.data.accounts[0] as Record<string, unknown>;
    delete account.icon;
    delete account.color;
    delete account.includeInNetWorth;
    const tx = file.data.transactions[0] as Record<string, unknown>;
    delete tx.notes;
    delete tx.recurringId;

    const result = validateBackup(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await importBackup(result.backup, 'replace');

    expect(await db.categories.get('cat-alimentacao-fora')).toMatchObject({ icon: '', keywords: [] });
    expect(await db.accounts.get(account.id as string)).toMatchObject({ icon: '', includeInNetWorth: true });
    expect((await db.accounts.get(account.id as string))?.color).toMatch(/^#/);
    expect(await db.transactions.get(tx.id as string)).toMatchObject({ notes: '', recurringId: null });
    // Antes: "Cannot read properties of undefined (reading 'trim')" no painel e no relatório, sempre.
    const data = await loadFinanceData();
    expect(() => generateInsights(data, '2026-10-01')).not.toThrow();
    expect(() => monthlyReport(data, '2026-09', '2026-10-01')).not.toThrow();
  });

  it('resetAllData apaga tudo e volta ao primeiro uso', async () => {
    await seedEverything();
    await resetAllData();
    for (const t of ['accounts', 'transactions', 'goals', 'debts', 'assets', 'chat'] as const) {
      expect(await db.table(t).count(), t).toBe(0);
    }
    const s = await db.settings.get('settings');
    expect(s?.onboardingDone).toBe(false);
    expect(s?.userName).toBe('');
    expect(await db.categories.get(CATEGORY_IDS.salario)).toBeDefined();
  });
});

describe('mesclar: registros equivalentes com ids diferentes', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 15, 12, 0, 0));
    await resetDb();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a mesma ocorrência de recorrência gerada em dois aparelhos fica uma só (a paga é mantida)', async () => {
    const banco = await addAccount(accountInput());
    const rule = await addRecurring({
      type: 'despesa',
      amount: 150000,
      description: 'Aluguel',
      categoryId: CATEGORY_IDS.moradia,
      accountId: banco.id,
      frequency: 'mensal',
      startDate: '2026-09-10',
      endDate: null,
      autoGenerate: true,
      active: true,
    });
    const backup0 = throughJSON(await exportBackup()) as BackupFile;

    // Aparelho A: em outubro gera o pendente de 10/10.
    await importBackup(backup0, 'replace');
    await runRecurring('2026-10-01');
    const fromA = throughJSON(await exportBackup()) as BackupFile;

    // Aparelho B: gera o mesmo pendente com outro id e o usuário já o marcou como pago.
    await importBackup(backup0, 'replace');
    await runRecurring('2026-10-01');
    const octoberB = (await db.transactions.toArray()).find((t) => t.date === '2026-10-10');
    if (!octoberB) throw new Error('pendente de outubro não gerado');
    await setTransactionStatus(octoberB.id, 'pago');

    await importBackup(fromA, 'merge');
    const generated = (await db.transactions.where('recurringId').equals(rule.id).toArray()).sort((a, b) =>
      a.date < b.date ? -1 : 1,
    );
    expect(generated.map((t) => t.date)).toEqual(['2026-09-10', '2026-10-10']);
    expect(generated[1]).toMatchObject({ id: octoberB.id, status: 'pago' });

    // Mesclar de novo não muda nada.
    await importBackup(fromA, 'merge');
    expect(await db.transactions.where('recurringId').equals(rule.id).count()).toBe(2);
  });

  it('orçamentos da mesma categoria e mês ficam um só (o mais recente); excluir não traz o antigo de volta', async () => {
    const file = validBackup();
    file.data.budgets = [
      makeBudget({
        id: 'b-arquivo',
        categoryId: CATEGORY_IDS.mercado,
        amount: 100000,
        updatedAt: '2026-09-01T00:00:00.000Z',
      }),
      makeBudget({ id: 'b-outubro', categoryId: CATEGORY_IDS.mercado, amount: 120000, month: '2026-10' }),
    ];
    const local = await setBudget(CATEGORY_IDS.mercado, 80000, null);

    await importBackup(file, 'merge');
    const amounts = Object.fromEntries((await db.budgets.toArray()).map((b) => [b.id, b.amount]));
    expect(amounts).toEqual({ 'b-outubro': 120000, [local.id]: 80000 });

    await deleteBudget(local.id);
    expect((await db.budgets.toArray()).map((b) => b.id)).toEqual(['b-outubro']);
  });

  it('no empate de data de edição vale a versão do arquivo', async () => {
    const stamp = '2026-09-01T00:00:00.000Z';
    await db.budgets.add(makeBudget({ id: 'b-local', categoryId: CATEGORY_IDS.mercado, amount: 80000, updatedAt: stamp }));
    const file = validBackup();
    file.data.budgets = [
      makeBudget({ id: 'b-arquivo', categoryId: CATEGORY_IDS.mercado, amount: 100000, updatedAt: stamp }),
    ];
    await importBackup(file, 'merge');
    expect((await db.budgets.toArray()).map((b) => b.id)).toEqual(['b-arquivo']);
  });
});

describe('validateBackup', () => {
  it('aceita um backup válido e mínimo', () => {
    const r = validateBackup(validBackup());
    expect(r.ok).toBe(true);
  });

  it.each([
    [null, 'não contém um backup válido'],
    [[], 'não contém um backup válido'],
    ['texto', 'não contém um backup válido'],
    [{ ...validBackup(), app: 'outro-app' }, 'não é um backup do Patrimonius'],
    [{ ...validBackup(), version: 2 }, 'Versão de backup não suportada (2)'],
    [{ app: 'patrimonius', version: 1 }, 'não contém a seção de dados'],
  ])('rejeita arquivo inválido (%#)', (json, message) => {
    const r = validateBackup(json);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(message);
  });

  it('exige que cada tabela seja uma lista', () => {
    const b = validBackup() as unknown as { data: Record<string, unknown> };
    delete b.data.transactions;
    let r = validateBackup(b);
    expect(r).toEqual({ ok: false, error: 'O backup não contém a lista de lançamentos.' });
    b.data.transactions = { a: 1 };
    r = validateBackup(b);
    expect(r.ok).toBe(false);
  });

  const tx = (p: Record<string, unknown>) => ({ ...makeTransaction({ accountId: 'a1' }), ...p });

  it.each([
    ['sem id', tx({ id: undefined }), 'sem identificador'],
    ['id vazio', tx({ id: '' }), 'sem identificador'],
    ['valor com centavos fracionados', tx({ amount: 12.5 }), 'inteiro em centavos'],
    ['valor em texto', tx({ amount: '100' }), 'inteiro em centavos'],
    ['valor zero', tx({ amount: 0 }), 'maior ou igual a 1'],
    ['data inexistente', tx({ date: '2026-02-30' }), 'data inválida em "date"'],
    ['data no formato brasileiro', tx({ date: '10/09/2026' }), 'data inválida'],
    ['tipo desconhecido', tx({ type: 'pix' }), 'valor inválido em "type"'],
    ['status desconhecido', tx({ status: 'cancelado' }), 'valor inválido em "status"'],
    ['transferência sem destino', tx({ type: 'transferencia', categoryId: null, toAccountId: null }), 'sem conta de destino'],
    ['parcelamento inválido', tx({ installment: { groupId: 'g', number: '1', total: 3 } }), 'parcelamento'],
    ['tags inválidas', tx({ tags: 'casa' }), '"tags"'],
  ])('rejeita lançamento %s', (_name, row, message) => {
    const r = validateBackup(withRows('transactions', [row]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('Registro 1 de lançamentos');
      expect(r.error).toContain(message);
    }
  });

  it('rejeita registros que não são objetos e ids repetidos', () => {
    let r = validateBackup(withRows('accounts', [42]));
    expect(r).toEqual({ ok: false, error: 'Registro 1 de contas não é um objeto.' });
    const acc = makeAccount({ id: 'dup' });
    r = validateBackup(withRows('accounts', [acc, { ...acc }]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Registro 2 de contas tem o identificador repetido "dup".');
  });

  it('valida tipos enumerados e datas das demais tabelas', () => {
    const cases: [keyof BackupFile['data'], unknown, string][] = [
      ['accounts', makeAccount({ type: 'bitcoin' as Account['type'] }), 'Registro 1 de contas'],
      ['accounts', makeAccount({ initialBalance: 10.5 }), '"initialBalance"'],
      ['categories', { id: 'c', name: 'X', kind: 'gasto', group: null } as unknown as Category, 'Registro 1 de categorias'],
      ['budgets', { id: 'b', categoryId: 'c', amount: 100, month: '2026-13' }, 'mês inválido'],
      ['recurring', { id: 'r', type: 'despesa', amount: 100, description: '', categoryId: 'c', accountId: 'a', frequency: 'diaria', startDate: '2026-01-01', nextDate: '2026-01-01', endDate: null }, '"frequency"'],
      ['goals', { id: 'g', name: 'M', targetAmount: 100, targetDate: '2026-1-1', priority: 'alta', status: 'ativa', accountId: null }, '"targetDate"'],
      ['debts', { id: 'd', name: 'D', type: 'emprestimo', balance: 100, balanceDate: '2026-01-01', interestRate: 'alto', minimumPayment: 10, status: 'ativa' }, '"interestRate"'],
      ['debtPayments', { id: 'p', debtId: 'd', amount: -5, date: '2026-01-01', transactionId: null }, 'Registro 1 de pagamentos de dívidas'],
      ['assetValuations', { id: 'v', assetId: 'a', value: 100, date: '' }, 'avaliações de bens'],
      ['settings', { id: 'outro' }, 'id "settings"'],
      ['settings', { id: 'settings', theme: 'azul' }, '"theme"'],
      ['chat', { id: 'm', role: 'bot', text: 'oi' }, '"role"'],
    ];
    for (const [table, row, message] of cases) {
      const r = validateBackup(withRows(table, [row]));
      expect(r.ok, `${table}: ${message}`).toBe(false);
      if (!r.ok) expect(r.error).toContain(message);
    }
  });

  it('rejeita mais de um registro de configurações', () => {
    const r = validateBackup(withRows('settings', [{ id: 'settings' }, { id: 'settings2' }]));
    expect(r.ok).toBe(false);
  });

  it('parseBackupText trata JSON inválido e BOM', () => {
    const bad = parseBackupText('{ isso não é json');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('não é um JSON válido');
    const good = parseBackupText('\uFEFF' + JSON.stringify(validBackup()));
    expect(good.ok).toBe(true);
  });
});

describe('CSV de lançamentos', () => {
  const accounts = [makeAccount({ id: 'a1', name: 'Banco; Digital' }), makeAccount({ id: 'a2', name: 'Poupança' })];
  const categories = [
    { id: 'cat-mercado', name: 'Mercado' },
    { id: 'cat-salario', name: 'Salário' },
  ] as Category[];

  it('formata decimais com vírgula e sinal', () => {
    expect(csvDecimal(0)).toBe('0,00');
    expect(csvDecimal(5)).toBe('0,05');
    expect(csvDecimal(123456)).toBe('1234,56');
    expect(csvDecimal(-123456)).toBe('-1234,56');
    expect(csvDecimal(-7)).toBe('-0,07');
  });

  it('escapa aspas, separador e quebras de linha', () => {
    expect(csvField('simples')).toBe('simples');
    expect(csvField('a;b')).toBe('"a;b"');
    expect(csvField('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvField('l1\nl2')).toBe('"l1\nl2"');
  });

  it('gera BOM, cabeçalho em pt-BR, linhas ordenadas por data e CRLF', () => {
    const txs = [
      makeTransaction({ id: 't2', accountId: 'a1', type: 'receita', amount: 500000, date: '2026-09-05', description: 'Salário', categoryId: 'cat-salario' }),
      makeTransaction({
        id: 't1',
        accountId: 'a1',
        type: 'despesa',
        amount: 12345,
        date: '2026-09-01',
        description: 'Mercado "Bom Preço"',
        categoryId: 'cat-mercado',
        status: 'pendente',
        tags: ['casa', 'mês'],
        notes: 'pago no débito',
        installment: { groupId: 'g', number: 2, total: 10 },
      }),
      makeTransaction({ id: 't3', accountId: 'a1', type: 'transferencia', amount: 10000, date: '2026-09-10', description: 'Guardar', categoryId: null, toAccountId: 'a2' }),
      makeTransaction({ id: 't4', accountId: 'sumiu', amount: 999, date: '2026-09-11', description: 'Órfão', categoryId: 'cat-apagada' }),
    ];
    const csv = transactionsToCSV(txs, categories, accounts);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    const lines = csv.slice(1).split('\r\n').filter(Boolean);
    expect(lines[0]).toBe('Data;Descrição;Tipo;Categoria;Conta;Conta de destino;Valor;Status;Parcela;Tags;Observações');
    expect(lines[1]).toBe('01/09/2026;"Mercado ""Bom Preço""";Despesa;Mercado;"Banco; Digital";;-123,45;Pendente;2 de 10;casa, mês;pago no débito');
    expect(lines[2]).toBe('05/09/2026;Salário;Receita;Salário;"Banco; Digital";;5000,00;Pago;;;');
    expect(lines[3]).toBe('10/09/2026;Guardar;Transferência;;"Banco; Digital";Poupança;100,00;Pago;;;');
    expect(lines[4]).toBe('11/09/2026;Órfão;Despesa;Sem categoria;(conta removida);;-9,99;Pago;;;');
    expect(lines).toHaveLength(5);
  });

  it('textos que começam com = + - @ não viram fórmula; parcela sai como "1 de 12" (e não a data 01/dez)', () => {
    expect(csvText('=1+1')).toBe("'=1+1");
    expect(csvText('- ajuste')).toBe("'- ajuste");
    expect(csvText('normal')).toBe('normal');
    expect(csvText('@casa;x')).toBe(`"'@casa;x"`);
    const csv = transactionsToCSV(
      [
        makeTransaction({
          id: 'f1',
          accountId: 'a3',
          amount: 1000,
          date: '2026-10-01',
          description: '=HYPERLINK("http://x","clique")',
          categoryId: null,
          tags: ['@casa'],
          notes: '-ajuste',
          installment: { groupId: 'g', number: 1, total: 12 },
        }),
      ],
      categories,
      [makeAccount({ id: 'a3', name: '+Conta' })],
    );
    const line = csv.slice(1).split('\r\n')[1];
    expect(line).toBe(
      `01/10/2026;"'=HYPERLINK(""http://x"",""clique"")";Despesa;;'+Conta;;-10,00;Pago;1 de 12;'@casa;'-ajuste`,
    );
  });

  it('sem lançamentos gera só o cabeçalho', () => {
    const csv = transactionsToCSV([], [], []);
    expect(csv).toBe('\uFEFFData;Descrição;Tipo;Categoria;Conta;Conta de destino;Valor;Status;Parcela;Tags;Observações\r\n');
  });
});

describe('downloads (Blob local)', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let blobs: Blob[];
  let clicked: HTMLAnchorElement[];

  beforeEach(async () => {
    await resetDb();
    blobs = [];
    clicked = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      blobs.push(b as Blob);
      return 'blob:local-1';
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });
  });

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.restoreAllMocks();
  });

  it('downloadBackup baixa patrimonius-backup-AAAA-MM-DD.json com o backup completo', async () => {
    await updateSettings({ userName: 'Caio' });
    const name = await downloadBackup('2026-10-01');
    expect(name).toBe('patrimonius-backup-2026-10-01.json');
    expect(backupFileName('2027-01-31')).toBe('patrimonius-backup-2027-01-31.json');
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe(name);
    expect(clicked[0].isConnected).toBe(false);
    const parsed = parseBackupText(await blobs[0].text());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect((parsed.backup.data.settings[0] as { userName: string }).userName).toBe('Caio');
  });

  it('downloadCSV baixa o texto como text/csv UTF-8', async () => {
    downloadCSV('lancamentos.csv', '\uFEFFa;b\r\n');
    expect(clicked[0].download).toBe('lancamentos.csv');
    expect(blobs[0].type).toBe('text/csv;charset=utf-8');
    const bytes = new Uint8Array(await blobs[0].arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });
});
