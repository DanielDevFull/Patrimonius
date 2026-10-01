import { CircleCheck, GraduationCap, Scale, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { groupBreakdown } from '@/analytics';
import { Badge, Card, CardHeader, EmptyState, Money, MonthPicker } from '@/components/ui';
import { formatMonthLong } from '@/domain/dates';
import { formatPercent } from '@/domain/money';
import { BUDGET_GROUP_LABELS, type BudgetGroup, type FinanceData, type MonthKey } from '@/domain/types';
import { ruleRows, unallocatedIncome, type RuleRow } from '../report-utils';

const GROUP_FILL: Record<BudgetGroup, string> = {
  necessidades: 'bg-sky-500 dark:bg-sky-400',
  desejos: 'bg-fuchsia-500 dark:bg-fuchsia-400',
  objetivos: 'bg-emerald-500 dark:bg-emerald-400',
};

const GROUP_HELP: Record<BudgetGroup, string> = {
  necessidades:
    'Gastos essenciais para viver: moradia, contas da casa, mercado, saúde, transporte, educação e impostos. A regra sugere que eles caibam em até metade da renda.',
  desejos:
    'O que deixa a vida mais gostosa, mas não é essencial: restaurantes, lazer, compras, assinaturas e cuidados pessoais. Até 30% da renda.',
  objetivos:
    'O dinheiro que trabalha pelo seu futuro: reserva de emergência, investimentos e pagamento de dívidas. Pelo menos 20% da renda.',
};

function StatusBadge({ row }: { row: RuleRow }) {
  if (row.status === 'ok')
    return (
      <Badge tone="positive">
        <CircleCheck size={12} aria-hidden /> {row.group === 'objetivos' ? 'Meta atingida' : 'Dentro do ideal'}
      </Badge>
    );
  return (
    <Badge tone="warning">
      <TriangleAlert size={12} aria-hidden /> {row.status === 'acima' ? 'Acima do ideal' : 'Abaixo do ideal'}
    </Badge>
  );
}

function BulletBar({ row }: { row: RuleRow }) {
  const share = row.share ?? 0;
  // Escala até 100% da renda; o marcador mostra o ideal.
  const width = Math.max(0, Math.min(1, share)) * 100;
  return (
    <div className="relative mt-2 h-3 w-full rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden>
      <div className={`h-full rounded-full ${GROUP_FILL[row.group]}`} style={{ width: `${width}%` }} />
      <div
        className="absolute -top-1 h-5 w-0.5 rounded-full bg-slate-900 dark:bg-white"
        style={{ left: `calc(${row.idealShare * 100}% - 1px)` }}
        title={`Ideal: ${formatPercent(row.idealShare)}`}
      />
    </div>
  );
}

export interface RuleTabProps {
  data: FinanceData;
  month: MonthKey;
  maxMonth: MonthKey;
  onMonthChange: (month: MonthKey) => void;
}

/** Regra 50/30/20: real x ideal por grupo, com explicação didática. */
export function RuleTab({ data, month, maxMonth, onMonthChange }: RuleTabProps) {
  const breakdown = useMemo(
    () => groupBreakdown(data.transactions, data.categories, month),
    [data.transactions, data.categories, month],
  );
  const rows = ruleRows(breakdown);
  const free = unallocatedIncome(breakdown);
  const byGroup = useMemo(() => {
    const map: Record<BudgetGroup, string[]> = { necessidades: [], desejos: [], objetivos: [] };
    for (const c of data.categories) {
      if (c.kind === 'despesa' && !c.archived && c.group) map[c.group].push(`${c.icon} ${c.name}`);
    }
    return map;
  }, [data.categories]);

  return (
    <div className="space-y-4">
      <MonthPicker value={month} onChange={onMonthChange} max={maxMonth} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <section aria-labelledby="rule-title">
            <CardHeader
              icon={<Scale size={18} aria-hidden />}
              title={<span id="rule-title">Real x ideal</span>}
              subtitle={
                breakdown.income > 0 ? (
                  <>
                    Sobre a renda de {formatMonthLong(month)}: <Money value={breakdown.income} />
                  </>
                ) : (
                  formatMonthLong(month)
                )
              }
            />
            {breakdown.income === 0 ? (
              <EmptyState
                icon={<Scale size={36} aria-hidden />}
                title={`Sem receitas em ${formatMonthLong(month)}`}
                description="A regra 50/30/20 divide a renda do mês. Registre suas receitas (salário, renda extra) para ver a análise."
              />
            ) : (
              <>
                <ul className="space-y-5">
                  {rows.map((row) => (
                    <li key={row.group} aria-label={BUDGET_GROUP_LABELS[row.group]}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                          {BUDGET_GROUP_LABELS[row.group]}
                        </h3>
                        <StatusBadge row={row} />
                      </div>
                      <BulletBar row={row} />
                      <div className="mt-1.5 flex flex-wrap justify-between gap-x-4 gap-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                        <span>
                          Real: <Money value={row.actual} className="font-semibold" /> (
                          {formatPercent(row.share ?? 0)} da renda)
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          Ideal: <Money value={row.ideal} /> ({formatPercent(row.idealShare)})
                        </span>
                      </div>
                      {row.status !== 'ok' && (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                          {row.status === 'acima' ? (
                            <>
                              <Money value={row.diff} /> acima do ideal neste mês.
                            </>
                          ) : (
                            <>
                              Faltaram <Money value={-row.diff} /> para chegar aos 20%.
                            </>
                          )}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
                  {breakdown.semGrupo > 0 && (
                    <p>
                      <Money value={breakdown.semGrupo} /> em despesas sem grupo (sem categoria ou com categoria fora da
                      regra).
                    </p>
                  )}
                  {free > 0 ? (
                    <p>
                      <Money value={free} /> da renda não foi gasta nem guardada em objetivos ({formatPercent(free / breakdown.income)}).
                      Se esse dinheiro ficou parado na conta, que tal movê-lo para a reserva ou uma meta?
                    </p>
                  ) : free < 0 ? (
                    <p className="text-rose-600 dark:text-rose-400">
                      As despesas superaram a renda em <Money value={-free} />.
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </section>
        </Card>

        <Card className="lg:col-span-2">
          <section aria-labelledby="rule-help-title">
            <CardHeader
              icon={<GraduationCap size={18} aria-hidden />}
              title={<span id="rule-help-title">Como funciona a regra 50/30/20</span>}
            />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              É um jeito simples de equilibrar o orçamento: divida a renda do mês em três partes. A barra mostra quanto
              cada grupo levou da renda; o traço vertical marca o ideal.
            </p>
            <dl className="mt-3 space-y-3 text-sm">
              {(['necessidades', 'desejos', 'objetivos'] as const).map((g) => (
                <div key={g}>
                  <dt className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                    <span aria-hidden className={`size-2.5 rounded-sm ${GROUP_FILL[g]}`} />
                    {BUDGET_GROUP_LABELS[g]}
                  </dt>
                  <dd className="mt-0.5 text-slate-600 dark:text-slate-300">{GROUP_HELP[g]}</dd>
                  {byGroup[g].length > 0 && (
                    <dd className="mt-1 text-xs text-slate-500 dark:text-slate-400">Suas categorias: {byGroup[g].join(', ')}</dd>
                  )}
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              O grupo de cada categoria pode ser alterado em Configurações → Categorias. A regra é um ponto de partida:
              ajuste os percentuais à sua realidade.
            </p>
          </section>
        </Card>
      </div>
    </div>
  );
}
