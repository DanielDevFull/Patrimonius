import { Bot, Check, Lock, PartyPopper, PiggyBank, Plus, Target, Trash2, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, cn, Field, IconButton, Input, Money, MoneyInput, Select } from '@/components/ui';
import { ACCOUNT_TYPE_ICONS } from '@/domain/defaults';
import { ACCOUNT_TYPE_LABELS, type AccountType, type Cents } from '@/domain/types';
import { EMERGENCY_MONTHS, SAVINGS_RATE } from '@/features/settings/preferences';
import { ACCOUNT_SUGGESTIONS, type DraftAccount } from './drafts';

/* ------------------------------------------------------------------ */
/* Peças visuais                                                       */
/* ------------------------------------------------------------------ */

/** Balão de fala do agente. */
export function PatSays({ agentName, children }: { agentName: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-700 text-white shadow-sm"
        aria-hidden
      >
        <Bot size={22} />
      </span>
      <div className="relative rounded-2xl rounded-tl-sm bg-brand-50 px-4 py-3 text-sm text-brand-950 dark:bg-brand-950/70 dark:text-brand-100">
        <p className="mb-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">{agentName}</p>
        {children}
      </div>
    </div>
  );
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-400"
        aria-hidden
      >
        {icon}
      </span>
      <div>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{children}</p>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Passo 1: boas-vindas                                                */
/* ------------------------------------------------------------------ */

export function WelcomeStep({ agentName }: { agentName: string }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Um jeito simples de organizar o seu dinheiro: registre gastos e receitas, planeje o mês e acompanhe seus
        objetivos com a ajuda de um agente financeiro.
      </p>
      <ul className="grid gap-4 sm:grid-cols-2">
        <Feature icon={<Wallet size={18} />} title="Contas e lançamentos">
          Conta corrente, cartão, carteira e investimentos em um só lugar.
        </Feature>
        <Feature icon={<PiggyBank size={18} />} title="Orçamentos">
          Limites por categoria e a regra 50/30/20.
        </Feature>
        <Feature icon={<Target size={18} />} title="Metas, dívidas e patrimônio">
          Veja o progresso e o plano para quitar dívidas.
        </Feature>
        <Feature icon={<Bot size={18} />} title={`${agentName}, seu agente`}>
          Analisa seus números, responde perguntas e dá dicas.
        </Feature>
      </ul>
      <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
        <Lock size={18} className="mt-0.5 shrink-0" aria-hidden />
        <p>
          <strong>Privado de verdade:</strong> funciona 100% offline. Você digita seus dados e eles ficam só neste
          dispositivo. Sem cadastro, sem senha de banco, sem nuvem.
        </p>
      </div>
      <PatSays agentName={agentName}>
        Oi! Eu sou o {agentName}. Vou acompanhar seus números e avisar quando algo merecer atenção. Vamos configurar
        tudo em um minutinho?
      </PatSays>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Passo 2: nome e renda                                               */
/* ------------------------------------------------------------------ */

export interface ProfileStepProps {
  agentName: string;
  name: string;
  onName: (v: string) => void;
  income: Cents | null;
  onIncome: (v: Cents | null) => void;
  ids: { name: string; income: string };
}

export function ProfileStep({ agentName, name, onName, income, onIncome, ids }: ProfileStepProps) {
  return (
    <div className="space-y-5">
      <PatSays agentName={agentName}>Como posso te chamar? E, mais ou menos, quanto entra por mês?</PatSays>
      <Field label="Seu nome" htmlFor={ids.name} hint="Opcional.">
        <Input
          id={ids.name}
          value={name}
          maxLength={60}
          autoComplete="given-name"
          placeholder="Ex.: Ana"
          onChange={(e) => onName(e.target.value)}
        />
      </Field>
      <Field
        label="Renda mensal estimada (líquida)"
        htmlFor={ids.income}
        hint="Salário e outras entradas já descontados os impostos. Ajuda nas análises enquanto há pouco histórico."
      >
        <MoneyInput id={ids.income} value={income} onChange={onIncome} placeholder="0,00" />
      </Field>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Passo 3: contas                                                     */
/* ------------------------------------------------------------------ */

export interface AccountsStepProps {
  agentName: string;
  drafts: DraftAccount[];
  baseId: string;
  error: string | null;
  showNameErrors: boolean;
  onAdd: (seed?: { name: string; type: AccountType }) => void;
  onChange: (key: string, patch: Partial<DraftAccount>) => void;
  onRemove: (key: string) => void;
}

export function AccountsStep({ agentName, drafts, baseId, error, showNameErrors, onAdd, onChange, onRemove }: AccountsStepProps) {
  const usedNames = new Set(drafts.map((d) => d.name.trim().toLowerCase()));
  return (
    <div className="space-y-5">
      <PatSays agentName={agentName}>
        Onde está o seu dinheiro hoje? Adicione suas contas com o saldo atual. Pode ser aproximado: dá para ajustar
        depois.
      </PatSays>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Sugestões (1 clique)</p>
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_SUGGESTIONS.map((s) => {
            const added = usedNames.has(s.name.toLowerCase());
            return (
              <button
                key={s.name}
                type="button"
                disabled={added}
                onClick={() => onAdd(s)}
                aria-label={added ? `${s.name} já adicionada` : `Adicionar ${s.name}`}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  added
                    ? 'cursor-default border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-300'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-brand-400 hover:text-brand-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200',
                )}
              >
                <span aria-hidden>{ACCOUNT_TYPE_ICONS[s.type]}</span>
                {s.name}
                {added ? <Check size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>

      {drafts.length > 0 && (
        <ul className="space-y-3">
          {drafts.map((d, i) => {
            const isCard = d.type === 'cartao_credito';
            const nameId = `${baseId}-name-${d.key}`;
            const typeId = `${baseId}-type-${d.key}`;
            const balanceId = `${baseId}-balance-${d.key}`;
            const nameMissing = showNameErrors && !d.name.trim();
            return (
              <li
                key={d.key}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/40"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge tone="brand">
                    <span aria-hidden>{ACCOUNT_TYPE_ICONS[d.type]}</span> Conta {i + 1}
                  </Badge>
                  <IconButton
                    label={`Remover ${d.name.trim() || `conta ${i + 1}`}`}
                    size="sm"
                    variant="danger"
                    onClick={() => onRemove(d.key)}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nome da conta" htmlFor={nameId} error={nameMissing ? 'Dê um nome à conta.' : null}>
                    <Input
                      id={nameId}
                      value={d.name}
                      maxLength={40}
                      placeholder="Ex.: Nubank, Itaú, Carteira"
                      aria-invalid={nameMissing}
                      onChange={(e) => onChange(d.key, { name: e.target.value })}
                    />
                  </Field>
                  <Field label="Tipo" htmlFor={typeId}>
                    <Select
                      id={typeId}
                      value={d.type}
                      onChange={(e) => onChange(d.key, { type: e.target.value as AccountType })}
                    >
                      {(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((t) => (
                        <option key={t} value={t}>
                          {ACCOUNT_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    className="sm:col-span-2"
                    label={isCard ? 'Fatura atual em aberto' : 'Saldo atual'}
                    htmlFor={balanceId}
                    hint={isCard ? 'Quanto você deve no cartão hoje (deixe em branco se não houver).' : 'Pode ser negativo (cheque especial).'}
                  >
                    <MoneyInput
                      id={balanceId}
                      value={d.balance}
                      allowNegative={!isCard}
                      onChange={(balance) => onChange(d.key, { balance })}
                    />
                  </Field>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => onAdd()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 hover:border-brand-400 hover:text-brand-800 dark:border-slate-700 dark:text-slate-300 dark:hover:text-brand-300"
      >
        <Plus size={18} aria-hidden /> {drafts.length === 0 ? 'Adicionar uma conta' : 'Adicionar outra conta'}
      </button>

      {error && (
        <p role="alert" className="text-sm font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Passo 4: objetivos                                                  */
/* ------------------------------------------------------------------ */

function QuickChoices({ values, current, suffix, onPick, label }: {
  values: number[];
  current: string;
  suffix: string;
  onPick: (v: number) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={current.trim() === String(v)}
          onClick={() => onPick(v)}
          className="rounded-full border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:border-brand-400 aria-pressed:border-brand-600 aria-pressed:bg-brand-700 aria-pressed:text-white dark:border-slate-600 dark:text-slate-200"
        >
          {v}
          {suffix}
        </button>
      ))}
    </div>
  );
}

export interface GoalsStepProps {
  agentName: string;
  months: string;
  onMonths: (v: string) => void;
  monthsError: string | null;
  rate: string;
  onRate: (v: string) => void;
  rateError: string | null;
  income: Cents | null;
  parsedRate: number | null;
  ids: { months: string; rate: string };
}

export function GoalsStep(p: GoalsStepProps) {
  return (
    <div className="space-y-6">
      <PatSays agentName={p.agentName}>
        Agora, seus objetivos. Eu uso essas metas para medir sua saúde financeira e sugerir próximos passos.
      </PatSays>
      <div className="space-y-2">
        <Field
          label="Reserva de emergência"
          htmlFor={p.ids.months}
          error={p.monthsError}
          hint="Quantos meses de custo essencial (moradia, contas, mercado...) você quer ter guardados. O recomendado é 6."
        >
          <div className="relative max-w-40">
            <Input
              id={p.ids.months}
              type="number"
              inputMode="numeric"
              min={EMERGENCY_MONTHS.min}
              max={EMERGENCY_MONTHS.max}
              value={p.months}
              aria-invalid={!!p.monthsError}
              className="pr-16"
              onChange={(e) => p.onMonths(e.target.value)}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500 dark:text-slate-400">
              meses
            </span>
          </div>
        </Field>
        <QuickChoices label="Sugestões de meses" values={[3, 6, 12]} current={p.months} suffix=" meses" onPick={(v) => p.onMonths(String(v))} />
      </div>
      <div className="space-y-2">
        <Field
          label="Meta de poupança"
          htmlFor={p.ids.rate}
          error={p.rateError}
          hint="Parte da renda que você quer guardar todo mês. A regra 50/30/20 sugere 20%. Use 0 para não ter meta."
        >
          <div className="relative max-w-40">
            <Input
              id={p.ids.rate}
              type="number"
              inputMode="numeric"
              min={SAVINGS_RATE.min}
              max={SAVINGS_RATE.max}
              value={p.rate}
              aria-invalid={!!p.rateError}
              className="pr-10"
              onChange={(e) => p.onRate(e.target.value)}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500 dark:text-slate-400">
              %
            </span>
          </div>
        </Field>
        <QuickChoices label="Sugestões de porcentagem" values={[10, 20, 30]} current={p.rate} suffix="%" onPick={(v) => p.onRate(String(v))} />
      </div>
      {p.income !== null && p.income > 0 && p.parsedRate !== null && p.parsedRate > 0 && (
        <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900 dark:bg-brand-950 dark:text-brand-200">
          Com renda de <Money value={p.income} />, guardar {p.parsedRate}% significa{' '}
          <strong>
            <Money value={Math.round((p.income * p.parsedRate) / 100)} />
          </strong>{' '}
          por mês.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Passo 5: pronto                                                     */
/* ------------------------------------------------------------------ */

export interface DoneStepProps {
  agentName: string;
  name: string;
  income: Cents | null;
  accounts: DraftAccount[];
  months: number | null;
  rate: number | null;
}

export function DoneStep({ agentName, name, income, accounts, months, rate }: DoneStepProps) {
  const rows: { label: string; value: ReactNode }[] = [
    { label: 'Nome', value: name.trim() || '—' },
    { label: 'Renda estimada', value: income ? <Money value={income} /> : '—' },
    {
      label: accounts.length === 1 ? 'Conta' : 'Contas',
      value: accounts.length ? accounts.map((a) => a.name.trim()).join(', ') : 'nenhuma por enquanto',
    },
    { label: 'Reserva de emergência', value: months !== null ? `${months} ${months === 1 ? 'mês' : 'meses'}` : '—' },
    { label: 'Meta de poupança', value: rate === null ? '—' : rate === 0 ? 'sem meta' : `${rate}% da renda` },
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300" aria-hidden>
          <PartyPopper size={28} />
        </span>
        <p className="text-sm text-slate-600 dark:text-slate-300">Confira o resumo. Tudo pode ser alterado depois em Configurações.</p>
      </div>
      <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-700">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-4 px-3 py-2">
            <dt className="text-slate-500 dark:text-slate-400">{r.label}</dt>
            <dd className="min-w-0 truncate text-right font-medium text-slate-900 dark:text-slate-100">{r.value}</dd>
          </div>
        ))}
      </dl>
      <PatSays agentName={agentName}>
        Prontinho! Depois é só registrar seus gastos (até por mensagem, como “gastei 35 no almoço”) que eu cuido das
        contas.
      </PatSays>
    </div>
  );
}
