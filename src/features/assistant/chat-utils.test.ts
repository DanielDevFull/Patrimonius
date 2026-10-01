import { describe, expect, it } from 'vitest';
import { respond, type AgentReply, type TransactionDraft } from '@/agent';
import { ROUTES } from '@/app/navigation';
import { CATEGORY_IDS } from '@/domain/defaults';
import { makeAccount, makeContribution, makeData, makeGoal, makeTransaction } from '@/test/factories';
import {
  actionState,
  budgetDoneReply,
  contributionDoneReply,
  draftToInitial,
  draftToInput,
  EXAMPLE_GROUPS,
  formatMessageTime,
  goalDoneReply,
  isInternalPath,
  makePayload,
  readAgentPayload,
  transactionDoneReply,
  withActionState,
} from './chat-utils';

const TODAY = '2026-10-15';

const DRAFT: TransactionDraft = {
  type: 'despesa',
  amount: 5000,
  date: TODAY,
  description: 'Mercado',
  categoryId: CATEGORY_IDS.mercado,
  accountId: null,
  toAccountId: null,
  status: 'pago',
  installments: 1,
};

function baseReply(p: Partial<AgentReply> = {}): AgentReply {
  return {
    intent: 'registrar_despesa',
    text: 'Entendi. Confirma?',
    cards: [],
    actions: [{ type: 'create_transaction', label: 'Registrar despesa', draft: DRAFT }],
    suggestions: ['Qual meu saldo?'],
    ...p,
  };
}

describe('readAgentPayload', () => {
  it('lê o formato { reply, done, canceled } e saneia os índices', () => {
    const reply = baseReply({
      actions: [
        { type: 'create_transaction', label: 'Registrar despesa', draft: DRAFT },
        { type: 'navigate', label: 'Ver lançamentos', to: ROUTES.transactions },
      ],
    });
    const parsed = readAgentPayload({ reply, done: [1, 1, 7, -1, 0.5, 'x'], canceled: [1, 0] });
    expect(parsed?.reply).toEqual(reply);
    expect(parsed?.done).toEqual([1]);
    // 'done' prevalece: índice 1 não pode estar também em canceled.
    expect(parsed?.canceled).toEqual([0]);
  });

  it('aceita um AgentReply puro (formato antigo) com todas as ações pendentes', () => {
    const parsed = readAgentPayload(baseReply());
    expect(parsed).toEqual({ reply: baseReply(), done: [], canceled: [] });
  });

  it('retorna null para payloads sem resposta', () => {
    expect(readAgentPayload(null)).toBeNull();
    expect(readAgentPayload('texto')).toBeNull();
    expect(readAgentPayload([baseReply()])).toBeNull();
    expect(readAgentPayload({ kind: 'resumo', total: 12345 })).toBeNull();
  });

  it('descarta cards malformados e completa campos ausentes', () => {
    const parsed = readAgentPayload({
      reply: {
        intent: 'intencao-inventada',
        text: 'Oi',
        cards: [
          { type: 'stat', title: 'Saldo', value: 'R$ 10,00', tone: 'roxo' },
          { type: 'stat', title: 'Sem valor' },
          { type: 'list', title: 'Vazia', items: [{ label: 1 }] },
          { type: 'chart', title: 'Barras', chart: 'linha', data: [{ label: 'a', value: 1 }] },
          { type: 'chart', title: 'Pizza', chart: 'pie', data: [{ label: 'a', value: 100 }, { label: 'b', value: Number.NaN }] },
          { type: 'progress', title: 'Metas', items: [{ label: 'Viagem', current: 10, target: 100, tone: 'positive' }] },
          'lixo',
        ],
      },
    });
    expect(parsed?.reply.intent).toBe('desconhecido');
    expect(parsed?.reply.actions).toEqual([]);
    expect(parsed?.reply.suggestions).toEqual([]);
    expect(parsed?.reply.cards.map((c) => c.title)).toEqual(['Saldo', 'Pizza', 'Metas']);
    const stat = parsed?.reply.cards[0];
    expect(stat?.type === 'stat' && stat.tone).toBeUndefined();
    const pie = parsed?.reply.cards[1];
    expect(pie?.type === 'chart' && pie.data).toEqual([{ label: 'a', value: 100, color: undefined }]);
  });

  it('nunca aceita navegação externa nem rascunhos inválidos; nesse caso todas as ações ficam canceladas', () => {
    const parsed = readAgentPayload({
      reply: baseReply({
        actions: [
          { type: 'create_transaction', label: 'Registrar despesa', draft: DRAFT },
          { type: 'navigate', label: 'Golpe', to: 'https://exemplo.com' },
          { type: 'create_transaction', label: 'Inválido', draft: { ...DRAFT, amount: 10.5 } },
        ],
      }),
      done: [],
      canceled: [],
    });
    expect(parsed?.reply.actions).toHaveLength(1);
    expect(parsed?.canceled).toEqual([0]);
    expect(parsed && actionState(parsed, 0)).toBe('canceled');
  });

  it('valida set_budget, create_goal e contribute_goal', () => {
    const parsed = readAgentPayload({
      reply: baseReply({
        actions: [
          { type: 'set_budget', label: 'Definir', categoryId: CATEGORY_IDS.mercado, amount: 80000, month: null },
          { type: 'set_budget', label: 'Definir mês', categoryId: CATEGORY_IDS.mercado, amount: 80000, month: '2026-10' },
          {
            type: 'create_goal',
            label: 'Criar meta',
            draft: { name: 'Viagem', targetAmount: 1000000, targetDate: null, icon: '✈️', color: '#2563eb', priority: 'media', status: 'ativa' },
          },
          { type: 'contribute_goal', label: 'Aportar', goalId: 'g1', amount: 30000, date: TODAY },
        ],
      }),
    });
    expect(parsed?.reply.actions.map((a) => a.type)).toEqual(['set_budget', 'set_budget', 'create_goal', 'contribute_goal']);
    expect(parsed?.canceled).toEqual([]);

    const bad = readAgentPayload({
      reply: baseReply({
        actions: [{ type: 'set_budget', label: 'Definir', categoryId: CATEGORY_IDS.mercado, amount: 800, month: '2026-13' }],
      }),
    });
    expect(bad?.reply.actions).toEqual([]);
  });
});

describe('estado das ações', () => {
  it('marca feito/cancelado de forma idempotente e "feito" prevalece', () => {
    const p0 = makePayload(baseReply());
    expect(actionState(p0, 0)).toBe('pending');
    const canceled = withActionState(p0, 0, 'canceled');
    expect(actionState(canceled, 0)).toBe('canceled');
    expect(withActionState(canceled, 0, 'canceled')).toEqual(canceled);
    const done = withActionState(canceled, 0, 'done');
    expect(done).toMatchObject({ done: [0], canceled: [] });
    expect(withActionState(done, 0, 'canceled')).toBe(done);
    expect(withActionState(withActionState(p0, 3, 'done'), 1, 'done').done).toEqual([1, 3]);
    // Não altera o original.
    expect(p0).toEqual(makePayload(baseReply()));
  });
});

describe('isInternalPath', () => {
  it('aceita só rotas internas', () => {
    expect(isInternalPath('/contas')).toBe(true);
    expect(isInternalPath('/lancamentos?novo=despesa')).toBe(true);
    expect(isInternalPath('https://exemplo.com')).toBe(false);
    expect(isInternalPath('//exemplo.com')).toBe(false);
    expect(isInternalPath('/\\exemplo.com')).toBe(false);
    expect(isInternalPath('javascript:alert(1)')).toBe(false);
    expect(isInternalPath(42)).toBe(false);
  });
});

describe('draftToInput / draftToInitial', () => {
  it('despesa usa a conta escolhida e mantém parcelas', () => {
    expect(draftToInput({ ...DRAFT, installments: 3, description: '  Tênis ' }, { accountId: 'a1', toAccountId: 'x' })).toEqual({
      type: 'despesa',
      amount: 5000,
      date: TODAY,
      description: 'Tênis',
      categoryId: CATEGORY_IDS.mercado,
      accountId: 'a1',
      toAccountId: null,
      status: 'pago',
      installments: 3,
    });
  });

  it('transferência zera a categoria; receita nunca é parcelada', () => {
    const transfer = draftToInput(
      { ...DRAFT, type: 'transferencia', categoryId: CATEGORY_IDS.mercado },
      { accountId: 'a1', toAccountId: 'a2' },
    );
    expect(transfer).toMatchObject({ categoryId: null, accountId: 'a1', toAccountId: 'a2' });
    const income = draftToInput({ ...DRAFT, type: 'receita', installments: 4 }, { accountId: 'a1', toAccountId: null });
    expect(income.installments).toBe(1);
  });

  it('pré-preenche o formulário com as contas escolhidas no card', () => {
    expect(draftToInitial(DRAFT)).toMatchObject({ accountId: null, toAccountId: null, amount: 5000, installments: 1 });
    expect(draftToInitial(DRAFT, { accountId: 'a1' }).accountId).toBe('a1');
    const transfer = draftToInitial({ ...DRAFT, type: 'transferencia', accountId: 'a1', toAccountId: null }, { toAccountId: 'a2' });
    expect(transfer).toMatchObject({ categoryId: null, accountId: 'a1', toAccountId: 'a2' });
  });
});

describe('respostas "Pronto!"', () => {
  const banco = makeAccount({ id: 'acc-banco', name: 'Banco', icon: '🏦' });
  const poupanca = makeAccount({ id: 'acc-poup', name: 'Poupança', icon: '🐷', type: 'poupanca' });
  const data = makeData({ accounts: [banco, poupanca] });

  it('despesa simples: valor, descrição, data relativa e conta; sem repetir a categoria igual à descrição', () => {
    const tx = makeTransaction({ accountId: banco.id, amount: 5000, description: 'Mercado', date: TODAY });
    const r = transactionDoneReply([tx], data, TODAY);
    expect(r.text).toBe('Pronto! Registrei a despesa de **R$ 50,00**: Mercado, hoje, em 🏦 Banco. ✅');
    expect(r.intent).toBe('registrar_despesa');
    expect(r.suggestions[0]).toBe('Quanto gastei com Mercado este mês?');
    expect(r.actions).toEqual([{ type: 'navigate', label: 'Ver lançamentos', to: ROUTES.transactions }]);
  });

  it('mostra a categoria quando a descrição é diferente e avisa quando fica pendente', () => {
    const tx = makeTransaction({
      accountId: banco.id,
      amount: 4590,
      description: 'Supermercado do bairro',
      date: '2026-10-20',
      status: 'pendente',
    });
    const r = transactionDoneReply([tx], data, TODAY);
    expect(r.text).toContain('Supermercado do bairro (🛒 Mercado), em 20/10/2026');
    expect(r.text).toContain('Ficou como pendente');
  });

  it('compra parcelada soma as parcelas e cita as pendentes', () => {
    const group = { groupId: 'g', total: 3 };
    const txs = [1, 2, 3].map((n) =>
      makeTransaction({
        accountId: banco.id,
        amount: n === 1 ? 10001 : 10000,
        description: `Tênis (${n}/3)`,
        categoryId: CATEGORY_IDS.compras,
        date: `2026-${String(9 + n).padStart(2, '0')}-15`,
        status: n === 1 ? 'pago' : 'pendente',
        installment: { ...group, number: n },
      }),
    );
    const r = transactionDoneReply(txs.reverse(), data, TODAY);
    expect(r.text).toMatch(/^Pronto! Registrei a compra parcelada de \*\*R\$ 300,01\*\* em 3x: Tênis \(.+\), 1ª parcela hoje, em 🏦 Banco\./);
    expect(r.text).toContain('As próximas parcelas ficaram pendentes');
  });

  it('receita e transferência', () => {
    const income = makeTransaction({
      type: 'receita',
      accountId: banco.id,
      amount: 500000,
      description: 'Salário',
      categoryId: CATEGORY_IDS.salario,
      date: '2026-10-14',
    });
    expect(transactionDoneReply([income], data, TODAY).text).toBe(
      'Pronto! Registrei a receita de **R$ 5.000,00**: Salário, ontem, em 🏦 Banco. ✅',
    );
    const transfer = makeTransaction({
      type: 'transferencia',
      accountId: banco.id,
      toAccountId: poupanca.id,
      categoryId: null,
      amount: 50000,
      description: 'Transferência para Poupança',
      date: TODAY,
    });
    const r = transactionDoneReply([transfer], data, TODAY);
    expect(r.text).toBe('Pronto! Registrei a transferência de **R$ 500,00** de 🏦 Banco para 🐷 Poupança, hoje. ✅');
    expect(r.intent).toBe('registrar_transferencia');
  });

  it('lista vazia (ex.: recorrência sem lançamento gerado ainda) não quebra', () => {
    expect(transactionDoneReply([], data, TODAY).text).toContain('Pronto!');
  });

  it('orçamento, meta e aporte', () => {
    expect(budgetDoneReply(CATEGORY_IDS.mercado, 80000, null, data).text).toContain(
      'Defini o orçamento de **🛒 Mercado** em **R$ 800,00** por mês (vale para todos os meses)',
    );
    expect(budgetDoneReply(CATEGORY_IDS.mercado, 80000, '2026-11', data).text).toContain('em novembro de 2026');

    const goalText = goalDoneReply({
      name: 'Viagem',
      targetAmount: 1000000,
      targetDate: '2027-06-30',
      icon: '✈️',
      color: '#2563eb',
      priority: 'media',
      status: 'ativa',
    }).text;
    expect(goalText).toContain('Criei a meta ✈️ **Viagem**: R$ 10.000,00 até 30/06/2027');

    const goal = makeGoal({ id: 'goal-x', name: 'Viagem', targetAmount: 100000 });
    const withGoal = makeData({ goals: [goal], goalContributions: [makeContribution({ goalId: goal.id, amount: 70000 })] });
    expect(contributionDoneReply(goal.id, 20000, withGoal).text).toContain('Agora são R$ 900,00 de R$ 1.000,00.');
    expect(contributionDoneReply(goal.id, 30000, withGoal).text).toContain('Meta concluída');
    expect(contributionDoneReply(goal.id, -10000, withGoal).text).toContain('resgate de **R$ 100,00**');
  });
});

describe('formatMessageTime', () => {
  const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString();

  it('hoje mostra só a hora; ontem e outros dias com data', () => {
    expect(formatMessageTime(at(2026, 10, 15, 9, 5), TODAY)).toBe('09:05');
    expect(formatMessageTime(at(2026, 10, 14, 23, 59), TODAY)).toBe('ontem, 23:59');
    expect(formatMessageTime(at(2026, 10, 1, 8, 0), TODAY)).toBe('01/10, 08:00');
    expect(formatMessageTime(at(2025, 12, 31, 18, 30), TODAY)).toBe('31/12/2025, 18:30');
  });

  it('carimbo inválido vira texto vazio', () => {
    expect(formatMessageTime('ontem', TODAY)).toBe('');
  });
});

describe('EXAMPLE_GROUPS', () => {
  it('tem os três grupos e todos os exemplos são entendidos pelo Pat', () => {
    expect(EXAMPLE_GROUPS.map((g) => g.title)).toEqual(['Registrar', 'Consultar', 'Planejar']);
    const data = makeData({
      accounts: [
        makeAccount({ name: 'Conta corrente', type: 'corrente', initialBalance: 300000 }),
        makeAccount({ name: 'Poupança', type: 'poupanca' }),
      ],
    });
    for (const example of EXAMPLE_GROUPS.flatMap((g) => g.examples)) {
      const { reply } = respond(example, data, TODAY, {});
      expect(reply.intent, example).not.toBe('desconhecido');
    }
  });
});
