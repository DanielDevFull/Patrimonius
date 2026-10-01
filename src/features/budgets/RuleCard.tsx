import { CircleCheck, CircleMinus, Scale, TriangleAlert } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';
import { ROUTES } from '@/app/navigation';
import { Badge, Card, CardHeader, Money, ProgressBar, type BadgeTone, type ProgressTone } from '@/components/ui';
import { BUDGET_GROUP_LABELS } from '@/domain/types';
import type { RuleAnalysis, RuleGroupLine, RuleVerdict } from './budget-utils';

const GROUP_EXAMPLES = {
  necessidades: 'Moradia, contas, mercado, saúde, transporte, educação.',
  desejos: 'Restaurantes, lazer, compras, assinaturas, cuidados pessoais.',
  objetivos: 'Reserva de emergência, investimentos e quitação de dívidas.',
} as const;

const VERDICT_META: Record<RuleVerdict, { label: string; tone: BadgeTone; icon: typeof CircleCheck }> = {
  dentro: { label: 'Dentro do ideal', tone: 'positive', icon: CircleCheck },
  acima: { label: 'Acima do ideal', tone: 'warning', icon: TriangleAlert },
  abaixo: { label: 'Abaixo do ideal', tone: 'warning', icon: TriangleAlert },
  vazio: { label: 'Sem orçamento', tone: 'neutral', icon: CircleMinus },
};

function barTone(line: RuleGroupLine): ProgressTone {
  if (line.verdict === 'vazio') return 'neutral';
  return line.verdict === 'dentro' ? 'positive' : 'warning';
}

function GroupLine({ line }: { line: RuleGroupLine }) {
  const meta = VERDICT_META[line.verdict];
  const Icon = meta.icon;
  const label = BUDGET_GROUP_LABELS[line.group];
  return (
    <li className="space-y-1.5" aria-label={label}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{label}</p>
        <Badge tone={meta.tone}>
          <Icon size={12} aria-hidden />
          {meta.label}
        </Badge>
      </div>
      <ProgressBar value={line.ratio ?? 0} tone={barTone(line)} size="sm" label={`Orçado em ${label} em relação ao ideal`} />
      <div className="flex flex-wrap justify-between gap-x-3 text-xs text-slate-600 dark:text-slate-300">
        <span>
          Orçado <Money value={line.budgeted} />
        </span>
        <span>
          Ideal <Money value={line.ideal} />
        </span>
      </div>
      {line.verdict === 'acima' && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          <Money value={line.diff} /> acima do sugerido — veja onde dá para cortar.
        </p>
      )}
      {line.verdict === 'abaixo' && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Faltam <Money value={-line.diff} /> para chegar a 20% da renda guardados para o futuro.
        </p>
      )}
    </li>
  );
}

/** Card didático da regra 50/30/20: ideal por grupo x soma dos orçamentos do mês. */
export function RuleCard({ analysis }: { analysis: RuleAnalysis }) {
  const titleId = useId();
  return (
    <Card>
      <section aria-labelledby={titleId}>
        <CardHeader
          icon={<Scale size={18} aria-hidden />}
          title={<span id={titleId}>Regra 50/30/20</span>}
          subtitle="Uma referência simples para dividir a renda."
        />
        {analysis.source === 'nenhuma' ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Para comparar seus orçamentos com a regra, registre suas receitas ou informe sua renda mensal em{' '}
            <Link to={ROUTES.settings} className="font-medium text-brand-700 underline dark:text-brand-400">
              Configurações
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Renda de referência: <Money value={analysis.income} className="font-semibold" />{' '}
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {analysis.source === 'historico'
                  ? '(média das receitas dos últimos 3 meses)'
                  : '(renda mensal estimada nas configurações)'}
              </span>
            </p>
            <ul className="space-y-4">
              {analysis.lines.map((line) => (
                <GroupLine key={line.group} line={line} />
              ))}
            </ul>
            {analysis.ungrouped > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <Money value={analysis.ungrouped} /> em categorias sem grupo não entram na comparação.
              </p>
            )}
            <p
              className={
                analysis.unallocated < 0
                  ? 'rounded-lg bg-rose-50 p-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                  : 'rounded-lg bg-slate-50 p-2 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300'
              }
            >
              {analysis.unallocated < 0 ? (
                <>
                  Seus orçamentos somam <Money value={-analysis.unallocated} /> a mais do que a renda. Revise os
                  valores para não fechar o mês no vermelho.
                </>
              ) : (
                <>
                  Ainda sem destino definido: <Money value={analysis.unallocated} /> da renda. Que tal reservar
                  parte disso para uma meta?
                </>
              )}
            </p>
          </div>
        )}
        <details className="group mt-4 text-sm">
          <summary className="cursor-pointer font-medium text-brand-700 dark:text-brand-400">
            Como funciona a regra?
          </summary>
          <div className="mt-2 space-y-2 text-slate-600 dark:text-slate-300">
            <p>
              A ideia é dividir a renda líquida em três partes: <strong>até 50%</strong> para necessidades,{' '}
              <strong>até 30%</strong> para desejos e <strong>pelo menos 20%</strong> para objetivos financeiros.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Necessidades:</strong> {GROUP_EXAMPLES.necessidades}
              </li>
              <li>
                <strong>Desejos:</strong> {GROUP_EXAMPLES.desejos}
              </li>
              <li>
                <strong>Objetivos:</strong> {GROUP_EXAMPLES.objetivos}
              </li>
            </ul>
            <p>
              Não é uma lei: use como ponto de partida e ajuste à sua realidade. O grupo de cada categoria pode ser
              alterado em Configurações → Categorias.
            </p>
          </div>
        </details>
      </section>
    </Card>
  );
}
