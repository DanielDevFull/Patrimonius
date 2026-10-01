import { describe, expect, it } from 'vitest';
import type { CategoryTotal, HealthComponent } from '@/analytics';
import { ROUTES, newTransactionPath } from '@/app/navigation';
import { formatBRL } from '@/domain/money';
import { makeAccount, makeBudget, makeData, makeGoal, makeTransaction } from '@/test/factories';
import { axisReaisFormatter, formatAxisDay, formatAxisReais } from './charts/format';
import {
  OTHER_SLICE_COLOR,
  componentTone,
  displayAmount,
  donutSlices,
  firstNameOf,
  firstSteps,
  greetingFor,
  greetingLine,
  recentTransactions,
  splitMoneyText,
  weakestComponent,
  whenPhrase,
} from './dashboard-utils';

function row(p: Partial<CategoryTotal> & Pick<CategoryTotal, 'total'>): CategoryTotal {
  return { categoryId: `cat-${p.total}`, name: `Cat ${p.total}`, icon: '•', color: '#123456', share: 0, count: 1, ...p };
}

function comp(p: Partial<HealthComponent> & Pick<HealthComponent, 'key' | 'score' | 'weight'>): HealthComponent {
  return { label: p.key, value: '', tip: `dica ${p.key}`, ...p };
}

describe('saudação', () => {
  it('escolhe bom dia / boa tarde / boa noite pelas faixas de horário', () => {
    expect(greetingFor(4)).toBe('Boa noite');
    expect(greetingFor(5)).toBe('Bom dia');
    expect(greetingFor(11)).toBe('Bom dia');
    expect(greetingFor(12)).toBe('Boa tarde');
    expect(greetingFor(17)).toBe('Boa tarde');
    expect(greetingFor(18)).toBe('Boa noite');
    expect(greetingFor(0)).toBe('Boa noite');
  });

  it('usa só o primeiro nome e omite a vírgula sem nome', () => {
    expect(firstNameOf('  Ana   Maria Souza ')).toBe('Ana');
    expect(firstNameOf('')).toBe('');
    expect(firstNameOf(undefined)).toBe('');
    expect(greetingLine(9, 'Ana Maria')).toBe('Bom dia, Ana!');
    expect(greetingLine(20, '   ')).toBe('Boa noite!');
  });
});

describe('splitMoneyText', () => {
  it('separa valores em reais (inclusive negativos, com sinal e compactos) do restante do texto', () => {
    const text = `Você gastou ${formatBRL(123456)} em mercado, -R$ 50,00 de estorno e +R$ 10,00 de cashback; meta de R$ 1,2 mi.`;
    const parts = splitMoneyText(text);
    expect(parts.filter((p) => p.money).map((p) => p.text)).toEqual([
      'R$ 1.234,56',
      '-R$ 50,00',
      '+R$ 10,00',
      'R$ 1,2 mi',
    ]);
    expect(parts.map((p) => p.text).join('')).toBe(text);
  });

  it('não engole o ponto final da frase nem números que não são dinheiro', () => {
    const parts = splitMoneyText('Sobraram R$ 50. Você tem 3 metas e 12% de poupança.');
    expect(parts).toEqual([
      { text: 'Sobraram ', money: false },
      { text: 'R$ 50', money: true },
      { text: '. Você tem 3 metas e 12% de poupança.', money: false },
    ]);
    expect(splitMoneyText('')).toEqual([]);
    expect(splitMoneyText('sem valores')).toEqual([{ text: 'sem valores', money: false }]);
  });
});

describe('donutSlices', () => {
  it('mantém até 6 fatias com a cor da própria categoria e calcula a participação', () => {
    const slices = donutSlices([
      row({ total: 3000, color: '#22c55e', categoryId: 'cat-mercado', name: 'Mercado' }),
      row({ total: 1000, color: '#f97316', categoryId: null, name: 'Sem categoria' }),
    ]);
    expect(slices).toEqual([
      expect.objectContaining({ key: 'cat-mercado', color: '#22c55e', value: 3000, share: 0.75 }),
      expect.objectContaining({ key: 'sem-categoria', value: 1000, share: 0.25 }),
    ]);
  });

  it('agrupa a cauda em "Outras" quando passa do limite (soma preservada)', () => {
    const rows = [700, 600, 500, 400, 300, 200, 100].map((total) => row({ total }));
    const slices = donutSlices(rows, 6);
    expect(slices).toHaveLength(6);
    const other = slices[5];
    expect(other).toMatchObject({ key: 'outras', color: OTHER_SLICE_COLOR, value: 300, label: 'Outras (2 categorias)' });
    expect(slices.reduce((s, x) => s + x.value, 0)).toBe(2800);
    expect(slices.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 10);
  });

  it('com exatamente o limite não cria "Outras"; ignora totais zerados; vazio sem gastos', () => {
    expect(donutSlices([1, 2, 3, 4, 5, 6].map((total) => row({ total })), 6).map((s) => s.key)).not.toContain(
      'outras',
    );
    expect(donutSlices([row({ total: 0 }), row({ total: 500 })])).toHaveLength(1);
    expect(donutSlices([])).toEqual([]);
    expect(donutSlices([row({ total: 0 })])).toEqual([]);
  });
});

describe('recentTransactions', () => {
  const acc = makeAccount();
  it('ignora lançamentos futuros e ordena por data desc, depois pelo criado mais recente', () => {
    const a = makeTransaction({ accountId: acc.id, date: '2026-10-10', createdAt: '2026-10-10T10:00:00.000Z' });
    const b = makeTransaction({ accountId: acc.id, date: '2026-10-10', createdAt: '2026-10-10T12:00:00.000Z' });
    const c = makeTransaction({ accountId: acc.id, date: '2026-10-02' });
    const future = makeTransaction({ accountId: acc.id, date: '2026-10-20', status: 'pendente' });
    const list = recentTransactions([c, a, future, b], '2026-10-15', 5);
    expect(list.map((t) => t.id)).toEqual([b.id, a.id, c.id]);
    expect(recentTransactions([c, a, b], '2026-10-15', 2)).toHaveLength(2);
    expect(recentTransactions([c], '2026-10-15', 0)).toEqual([]);
  });

  it('displayAmount: receita positiva, despesa negativa, transferência neutra', () => {
    expect(displayAmount({ type: 'receita', amount: 500 })).toBe(500);
    expect(displayAmount({ type: 'despesa', amount: 500 })).toBe(-500);
    expect(displayAmount({ type: 'transferencia', amount: 500 })).toBe(0);
  });
});

describe('whenPhrase', () => {
  it('usa palavras para hoje/amanhã/ontem e "em DD/MM/AAAA" para o resto', () => {
    expect(whenPhrase('2026-10-15', '2026-10-15')).toBe('hoje');
    expect(whenPhrase('2026-10-16', '2026-10-15')).toBe('amanhã');
    expect(whenPhrase('2026-10-14', '2026-10-15')).toBe('ontem');
    expect(whenPhrase('2026-10-28', '2026-10-15')).toBe('em 28/10/2026');
  });
});

describe('firstSteps', () => {
  it('marca como concluído o que já existe e aponta para as rotas certas', () => {
    const data = makeData({
      accounts: [makeAccount({ archived: true })],
      budgets: [makeBudget({ categoryId: 'cat-mercado', amount: 50000 })],
    });
    const steps = firstSteps(data, false);
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ['contas', false], // só conta arquivada não conta
      ['lancamento', false],
      ['orcamento', true],
      ['meta', false],
      ['assistente', false],
    ]);
    expect(steps.map((s) => s.to)).toEqual([
      ROUTES.accounts,
      newTransactionPath('despesa'),
      ROUTES.budgets,
      ROUTES.goals,
      ROUTES.assistant,
    ]);
  });

  it('usa o nome do agente configurado e reconhece conversa iniciada', () => {
    const data = makeData({ accounts: [makeAccount()], goals: [makeGoal()] });
    data.settings.agentName = 'Lia';
    const steps = firstSteps(data, true);
    const assistant = steps.find((s) => s.key === 'assistente');
    expect(assistant).toMatchObject({ label: 'Converse com o Lia', done: true });
    expect(steps.find((s) => s.key === 'contas')?.done).toBe(true);
    expect(steps.find((s) => s.key === 'meta')?.done).toBe(true);
  });
});

describe('saúde financeira', () => {
  it('componentTone segue as faixas 70/40', () => {
    expect(componentTone(100)).toBe('positive');
    expect(componentTone(70)).toBe('positive');
    expect(componentTone(69)).toBe('warning');
    expect(componentTone(40)).toBe('warning');
    expect(componentTone(39.9)).toBe('negative');
    expect(componentTone(0)).toBe('negative');
  });

  it('weakestComponent considera pontos perdidos ponderados pelo peso', () => {
    const list = [
      comp({ key: 'poupanca', score: 60, weight: 25 }), // perde 1000
      comp({ key: 'metas', score: 0, weight: 10 }), // perde 1000 (empate: vence o primeiro)
      comp({ key: 'fluxo', score: 0, weight: 5 }), // perde 500
    ];
    expect(weakestComponent(list)?.key).toBe('poupanca');
    expect(weakestComponent([comp({ key: 'reserva', score: 30, weight: 25 }), ...list])?.key).toBe('reserva');
    expect(weakestComponent([comp({ key: 'fluxo', score: 100, weight: 5 })])).toBeNull();
    expect(weakestComponent([])).toBeNull();
  });
});

describe('formatação dos eixos', () => {
  it('converte centavos para reais só no rótulo, em formato compacto pt-BR', () => {
    expect(formatAxisReais(0)).toBe('0');
    expect(formatAxisReais(-0)).toBe('0');
    expect(formatAxisReais(50000)).toBe('500');
    expect(formatAxisReais(150000)).toBe('1,5 mil');
    expect(formatAxisReais(-250000000)).toBe('-2,5 mi');
    expect(formatAxisReais(Number.NaN)).toBe('');
    expect(formatAxisDay('2026-10-05')).toBe('05 out');
  });

  it('mascara o eixo no modo "ocultar valores"', () => {
    expect(axisReaisFormatter(false)(150000)).toBe('1,5 mil');
    expect(axisReaisFormatter(true)(150000)).toBe('•••');
  });
});
