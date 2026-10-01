import { describe, expect, it } from 'vitest';
import { CATEGORY_IDS } from '@/domain/defaults';
import {
  makeAccount,
  makeContribution,
  makeData,
  makeDebt,
  makeDebtPayment,
  makeGoal,
  makeTransaction,
} from '@/test/factories';
import {
  activeAccounts,
  categoryOptions,
  defaultAccountId,
  installmentCounts,
  installmentPreview,
  otherAccountId,
  parseInstallments,
  parseTags,
  previousDescriptions,
  resolveDescription,
  stripInstallmentSuffix,
  transactionLinks,
  validateTransactionForm,
  type TransactionFormCheck,
} from './form-utils';

const base: TransactionFormCheck = {
  type: 'despesa',
  amount: 1000,
  accountId: 'a',
  toAccountId: null,
  categoryId: CATEGORY_IDS.mercado,
  date: '2026-10-15',
  today: '2026-10-15',
  installments: 1,
  installmentsApplies: true,
};

describe('parseTags', () => {
  it('separa por vírgula, remove vazios/espaços e repetidas ignorando caixa e acento', () => {
    expect(parseTags(' Viagem, viagem ,  Férias,,ferias , trabalho  extra ')).toEqual([
      'Viagem',
      'Férias',
      'trabalho extra',
    ]);
    expect(parseTags('  ,  ')).toEqual([]);
  });
});

describe('parseInstallments', () => {
  it('aceita inteiros de 1 a 48', () => {
    expect(parseInstallments('1')).toBe(1);
    expect(parseInstallments(' 48 ')).toBe(48);
  });
  it('rejeita zero, acima de 48, decimais e texto', () => {
    for (const v of ['0', '49', '2.5', '3,0', '', 'dez', '-2']) expect(parseInstallments(v)).toBeNull();
  });
});

describe('installmentPreview', () => {
  it('usa a mesma divisão do repositório: centavos extras na 1ª parcela', () => {
    expect(installmentPreview(10000, 3)).toEqual({ count: 3, first: 3334, regular: 3333 });
    expect(installmentPreview(9000, 3)).toEqual({ count: 3, first: 3000, regular: 3000 });
  });
  it('não mostra prévia à vista, sem valor ou com parcelas inválidas', () => {
    expect(installmentPreview(10000, 1)).toBeNull();
    expect(installmentPreview(null, 3)).toBeNull();
    expect(installmentPreview(0, 3)).toBeNull();
    expect(installmentPreview(10000, null)).toBeNull();
  });
});

describe('stripInstallmentSuffix', () => {
  it('remove apenas o sufixo final de parcela', () => {
    expect(stripInstallmentSuffix('Geladeira (2/10)')).toBe('Geladeira');
    expect(stripInstallmentSuffix('Plano 1/2 ano')).toBe('Plano 1/2 ano');
  });
});

describe('contas padrão', () => {
  const banco = makeAccount({ name: 'Banco', createdAt: '2026-01-02T00:00:00.000Z' });
  const cartao = makeAccount({
    name: 'Cartão',
    type: 'cartao_credito',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  const velha = makeAccount({ name: 'Antiga', archived: true, createdAt: '2025-01-01T00:00:00.000Z' });

  it('ordena ativas por criação e ignora arquivadas', () => {
    expect(activeAccounts([banco, velha, cartao]).map((a) => a.name)).toEqual(['Cartão', 'Banco']);
  });

  it('sem histórico, prefere a primeira conta que não é cartão/investimento', () => {
    expect(defaultAccountId([cartao, banco], [], 'despesa')).toBe(banco.id);
    expect(defaultAccountId([], [], 'despesa')).toBeNull();
  });

  it('usa a conta do último lançamento do mesmo tipo, se ainda ativa', () => {
    const txs = [
      makeTransaction({ accountId: banco.id, createdAt: '2026-10-01T10:00:00.000Z' }),
      makeTransaction({ accountId: cartao.id, createdAt: '2026-10-02T10:00:00.000Z' }),
      makeTransaction({ accountId: velha.id, createdAt: '2026-10-03T10:00:00.000Z' }),
      makeTransaction({ accountId: banco.id, type: 'receita', createdAt: '2026-10-04T10:00:00.000Z' }),
    ];
    expect(defaultAccountId([banco, cartao, velha], txs, 'despesa')).toBe(cartao.id);
    expect(defaultAccountId([banco, cartao, velha], txs, 'receita')).toBe(banco.id);
  });

  it('destino padrão de transferência é outra conta ativa', () => {
    expect(otherAccountId([cartao, banco], cartao.id)).toBe(banco.id);
    expect(otherAccountId([banco], banco.id)).toBeNull();
  });
});

describe('previousDescriptions', () => {
  it('mais recentes primeiro, sem sufixo de parcela e sem repetições', () => {
    const acc = makeAccount();
    const txs = [
      makeTransaction({ accountId: acc.id, description: 'Mercado', date: '2026-10-01' }),
      makeTransaction({ accountId: acc.id, description: 'Geladeira (1/3)', date: '2026-10-05' }),
      makeTransaction({ accountId: acc.id, description: 'Geladeira (2/3)', date: '2026-11-05' }),
      makeTransaction({ accountId: acc.id, description: 'mercado', date: '2026-10-03' }),
      makeTransaction({ accountId: acc.id, description: 'Salário', type: 'receita', date: '2026-10-05' }),
    ];
    expect(previousDescriptions(txs, 'despesa')).toEqual(['Geladeira', 'mercado']);
    expect(previousDescriptions(txs, 'receita')).toEqual(['Salário']);
    expect(previousDescriptions(txs, 'despesa', 1)).toEqual(['Geladeira']);
  });
});

describe('categoryOptions', () => {
  const { categories } = makeData();

  it('despesas agrupadas pela regra 50/30/20; receitas sem grupo', () => {
    const groups = categoryOptions(categories, 'despesa', null);
    expect(groups.map((g) => g.label)).toEqual(['Necessidades', 'Desejos', 'Objetivos financeiros']);
    expect(groups[0].categories.map((c) => c.name)).toContain('Mercado');
    const income = categoryOptions(categories, 'receita', null);
    expect(income).toHaveLength(1);
    expect(income[0].label).toBeNull();
    expect(income[0].categories.every((c) => c.kind === 'receita')).toBe(true);
  });

  it('esconde arquivadas, exceto a que está em uso no lançamento editado', () => {
    const archived = categories.map((c) => (c.id === CATEGORY_IDS.pets ? { ...c, archived: true } : c));
    const ids = (keep: string | null) =>
      categoryOptions(archived, 'despesa', keep).flatMap((g) => g.categories.map((c) => c.id));
    expect(ids(null)).not.toContain(CATEGORY_IDS.pets);
    expect(ids(CATEGORY_IDS.pets)).toContain(CATEGORY_IDS.pets);
  });
});

describe('validateTransactionForm', () => {
  it('formulário válido não tem erros', () => {
    expect(validateTransactionForm(base)).toEqual({});
  });

  it('valor obrigatório e maior que zero', () => {
    expect(validateTransactionForm({ ...base, amount: null }).amount).toBe(
      'Informe um valor maior que zero.',
    );
    expect(validateTransactionForm({ ...base, amount: 0 }).amount).toBeDefined();
  });

  it('conta e categoria obrigatórias para despesa/receita', () => {
    const errors = validateTransactionForm({ ...base, accountId: null, categoryId: null });
    expect(errors.accountId).toBe('Escolha uma conta.');
    expect(errors.categoryId).toBe('Escolha uma categoria.');
  });

  it('transferência exige destino diferente da origem e dispensa categoria', () => {
    const t = { ...base, type: 'transferencia' as const, categoryId: null };
    expect(validateTransactionForm({ ...t, toAccountId: null }).toAccountId).toBe(
      'Escolha a conta de destino.',
    );
    expect(validateTransactionForm({ ...t, toAccountId: 'a' }).toAccountId).toBe(
      'Origem e destino precisam ser contas diferentes.',
    );
    expect(validateTransactionForm({ ...t, toAccountId: 'b' })).toEqual({});
  });

  it('data inválida e parcelas fora do intervalo (só quando o campo se aplica)', () => {
    expect(validateTransactionForm({ ...base, date: '2026-02-30' }).date).toBe('Informe uma data válida.');
    expect(validateTransactionForm({ ...base, installments: null }).installments).toBe(
      'Informe de 1 a 48 parcelas.',
    );
    expect(validateTransactionForm({ ...base, installments: null, installmentsApplies: false })).toEqual({});
  });

  it('ano digitado errado (ex.: 0226 ou 2062) não passa: o lançamento ficaria escondido mexendo no saldo', () => {
    expect(validateTransactionForm({ ...base, date: '0226-01-10' }).date).toBe('Confira o ano da data.');
    expect(validateTransactionForm({ ...base, date: '2062-01-10' }).date).toBe('Confira o ano da data.');
    expect(validateTransactionForm({ ...base, date: '2027-03-10' })).toEqual({});
    expect(validateTransactionForm({ ...base, date: '1999-12-31' })).toEqual({});
  });
});

describe('installmentCounts', () => {
  const g = { groupId: 'g1', total: 4 };
  const parcels = [1, 2, 4].map((number) =>
    makeTransaction({ accountId: 'a', installment: { ...g, number } }),
  );
  it('conta só as parcelas que ainda existem (a 3/4 foi excluída)', () => {
    expect(installmentCounts(parcels, parcels[2])).toEqual({ group: 3, future: 1 });
    expect(installmentCounts(parcels, parcels[1])).toEqual({ group: 3, future: 2 });
  });
  it('lançamento sem parcela conta como 1', () => {
    expect(installmentCounts(parcels, makeTransaction({ accountId: 'a' }))).toEqual({ group: 1, future: 1 });
  });
});

describe('transactionLinks', () => {
  it('liga o lançamento ao pagamento da dívida ou ao aporte/resgate da meta', () => {
    const debt = makeDebt({ name: 'Crediário' });
    const goal = makeGoal({ name: 'Viagem' });
    const links = transactionLinks({
      debts: [debt],
      goals: [goal],
      debtPayments: [
        makeDebtPayment({ debtId: debt.id, id: 'p1', transactionId: 't1' }),
        makeDebtPayment({ debtId: debt.id, id: 'p2', transactionId: null }),
      ],
      goalContributions: [makeContribution({ goalId: goal.id, id: 'c1', amount: -500, transactionId: 't2' })],
    });
    expect(links.get('t1')).toEqual({ kind: 'debtPayment', id: 'p1', name: 'Crediário' });
    expect(links.get('t2')).toEqual({ kind: 'goalContribution', id: 'c1', name: 'Viagem', amount: -500 });
    expect(links.size).toBe(2);
  });
});

describe('resolveDescription', () => {
  const { categories } = makeData();
  const mercado = categories.find((c) => c.id === CATEGORY_IDS.mercado);

  it('mantém o texto digitado (colapsando espaços)', () => {
    expect(resolveDescription('  Feira   do  bairro ', 'despesa', mercado, undefined)).toBe(
      'Feira do bairro',
    );
  });

  it('vazia usa o nome da categoria ou o destino da transferência', () => {
    expect(resolveDescription('  ', 'despesa', mercado, undefined)).toBe('Mercado');
    expect(resolveDescription('', 'transferencia', undefined, makeAccount({ name: 'Poupança' }))).toBe(
      'Transferência para Poupança',
    );
    expect(resolveDescription('', 'receita', undefined, undefined)).toBe('Receita');
  });
});
