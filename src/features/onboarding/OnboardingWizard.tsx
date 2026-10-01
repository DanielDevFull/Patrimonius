import { ArrowLeft, ArrowRight, Rocket, Sparkles } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ROUTES } from '@/app/navigation';
import { Button, Card, cn, Spinner, useToast } from '@/components/ui';
import { loadDemoData } from '@/db/demo';
import { useSettings, useToday } from '@/db/hooks';
import { addAccount, updateSettings } from '@/db/repo';
import type { AccountType, Cents, Settings } from '@/domain/types';
import {
  EMERGENCY_MONTHS,
  SAVINGS_RATE,
  emergencyMonthsError,
  parseIntInRange,
  savingsRateError,
} from '@/features/settings/preferences';
import { draftToAccount, validDrafts, type DraftAccount } from './drafts';
import { AccountsStep, DoneStep, GoalsStep, ProfileStep, WelcomeStep } from './OnboardingSteps';

const STEPS = ['Boas-vindas', 'Você', 'Suas contas', 'Objetivos', 'Pronto'] as const;
const LAST = STEPS.length - 1;

const TITLES: Record<number, (name: string) => string> = {
  0: () => 'Boas-vindas ao Patrimonius',
  1: () => 'Vamos nos conhecer',
  2: () => 'Suas contas',
  3: () => 'Seus objetivos',
  4: (name) => (name ? `Tudo pronto, ${name}!` : 'Tudo pronto!'),
};

type Finish = 'start' | 'demo' | 'skip';

/** Assistente de primeiro uso em tela cheia (exibido pelo AppShell enquanto onboardingDone === false). */
export default function OnboardingWizard() {
  const settings = useSettings();
  if (!settings) return <Spinner label="Preparando…" />;
  return <Wizard settings={settings} />;
}

function Wizard({ settings }: { settings: Settings }) {
  const toast = useToast();
  const navigate = useNavigate();
  const today = useToday();
  const baseId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const draftSeq = useRef(0);

  const agentName = settings.agentName.trim() || 'Pat';
  const [step, setStep] = useState(0);
  const [name, setName] = useState(settings.userName);
  const [income, setIncome] = useState<Cents | null>(settings.monthlyIncomeEstimate);
  const [drafts, setDrafts] = useState<DraftAccount[]>([]);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [showNameErrors, setShowNameErrors] = useState(false);
  const [months, setMonths] = useState(String(settings.emergencyFundTargetMonths));
  const [rate, setRate] = useState(String(settings.savingsRateTarget));
  const [busy, setBusy] = useState<Finish | null>(null);

  const monthsErr = emergencyMonthsError(months);
  const rateErr = savingsRateError(rate);
  const parsedMonths = parseIntInRange(months, EMERGENCY_MONTHS.min, EMERGENCY_MONTHS.max);
  const parsedRate = parseIntInRange(rate, SAVINGS_RATE.min, SAVINGS_RATE.max);

  // Leva o foco ao título quando o passo muda (leitores de tela anunciam a mudança).
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    headingRef.current?.focus();
  }, [step]);

  function addDraft(seed?: { name: string; type: AccountType }) {
    draftSeq.current += 1;
    const key = `d${draftSeq.current}`;
    setDrafts((list) => [...list, { key, name: seed?.name ?? '', type: seed?.type ?? 'corrente', balance: null }]);
    setAccountsError(null);
  }

  function changeDraft(key: string, patch: Partial<DraftAccount>) {
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function removeDraft(key: string) {
    setDrafts((list) => list.filter((d) => d.key !== key));
  }

  /** Valida o passo atual; retorna true se pode avançar. */
  function validateStep(): boolean {
    if (step === 2) {
      if (drafts.length === 0) {
        setAccountsError('Adicione pelo menos uma conta para continuar (ou toque em "Pular").');
        return false;
      }
      if (drafts.some((d) => !d.name.trim())) {
        setShowNameErrors(true);
        setAccountsError('Dê um nome a todas as contas ou remova as que estão em branco.');
        return false;
      }
      setAccountsError(null);
    }
    if (step === 3 && (monthsErr || rateErr)) return false;
    return true;
  }

  function next() {
    if (!validateStep()) return;
    setStep((s) => Math.min(LAST, s + 1));
  }

  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  async function finish(mode: Finish) {
    if (busy) return;
    setBusy(mode);
    const patch: Partial<Settings> = {
      userName: name.trim(),
      monthlyIncomeEstimate: income && income > 0 ? income : null,
      emergencyFundTargetMonths: parsedMonths ?? settings.emergencyFundTargetMonths,
      savingsRateTarget: parsedRate ?? settings.savingsRateTarget,
    };
    try {
      // Navega antes de concluir: ao marcar onboardingDone o AppShell troca esta tela pelo app.
      navigate(ROUTES.dashboard);
      if (mode === 'demo') {
        await updateSettings(patch);
        await loadDemoData(today);
        toast('Dados de exemplo carregados. Explore à vontade!');
        return;
      }
      const accounts = validDrafts(drafts);
      for (const [i, draft] of accounts.entries()) {
        await addAccount(draftToAccount(draft, i));
      }
      await updateSettings({ ...patch, onboardingDone: true });
      toast(mode === 'skip' ? 'Tudo bem! Você pode completar as configurações quando quiser.' : 'Tudo pronto. Bom começo!');
    } catch (e) {
      console.error(e);
      toast('Não foi possível salvar. Tente novamente.', 'error');
      setBusy(null);
    }
  }

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-brand-50 via-slate-50 to-slate-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-950">
      <header className="mx-auto flex w-full max-w-xl items-center justify-between px-4 pt-4 sm:pt-8">
        <div className="flex items-center gap-2">
          <img src="./favicon.svg" alt="" className="size-8" />
          <span className="text-lg font-bold tracking-tight">Patrimonius</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void finish('skip')} disabled={!!busy} loading={busy === 'skip'}>
          Pular
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pb-8 pt-4">
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400" aria-live="polite">
            Passo {step + 1} de {STEPS.length} · {STEPS[step]}
          </p>
          <div
            role="progressbar"
            aria-label="Progresso da configuração"
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-valuenow={step + 1}
            aria-valuetext={`Passo ${step + 1} de ${STEPS.length}: ${STEPS[step]}`}
            className="flex gap-1.5"
          >
            {STEPS.map((label, i) => (
              <span
                key={label}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors duration-300',
                  i <= step ? 'bg-brand-600' : 'bg-slate-200 dark:bg-slate-800',
                )}
              />
            ))}
          </div>
          <span className="sr-only">{Math.round(progress)}% concluído</span>
        </div>

        <Card className="p-5 sm:p-7">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="mb-5 text-2xl font-bold tracking-tight text-slate-900 outline-none dark:text-white"
          >
            {TITLES[step](name.trim())}
          </h1>

          {step === 0 && <WelcomeStep agentName={agentName} />}
          {step === 1 && (
            <ProfileStep
              agentName={agentName}
              name={name}
              onName={setName}
              income={income}
              onIncome={setIncome}
              ids={{ name: `${baseId}-name`, income: `${baseId}-income` }}
            />
          )}
          {step === 2 && (
            <AccountsStep
              agentName={agentName}
              drafts={drafts}
              baseId={baseId}
              error={accountsError}
              showNameErrors={showNameErrors}
              onAdd={addDraft}
              onChange={changeDraft}
              onRemove={removeDraft}
            />
          )}
          {step === 3 && (
            <GoalsStep
              agentName={agentName}
              months={months}
              onMonths={setMonths}
              monthsError={monthsErr}
              rate={rate}
              onRate={setRate}
              rateError={rateErr}
              income={income}
              parsedRate={parsedRate}
              ids={{ months: `${baseId}-months`, rate: `${baseId}-rate` }}
            />
          )}
          {step === LAST && (
            <DoneStep
              agentName={agentName}
              name={name}
              income={income}
              accounts={validDrafts(drafts)}
              months={parsedMonths}
              rate={parsedRate}
            />
          )}

          {step < LAST ? (
            <div className="mt-7 flex items-center justify-between gap-3">
              {step > 0 ? (
                <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={back} disabled={!!busy}>
                  Voltar
                </Button>
              ) : (
                <span />
              )}
              <Button onClick={next} disabled={!!busy || (step === 3 && (!!monthsErr || !!rateErr))}>
                {step === 0 ? 'Vamos começar' : 'Continuar'}
                <ArrowRight size={16} aria-hidden />
              </Button>
            </div>
          ) : (
            <div className="mt-7 space-y-3">
              <Button
                size="lg"
                fullWidth
                icon={<Rocket size={18} />}
                onClick={() => void finish('start')}
                loading={busy === 'start'}
                disabled={!!busy}
              >
                Começar a usar
              </Button>
              <Button
                size="lg"
                variant="secondary"
                fullWidth
                icon={<Sparkles size={18} />}
                onClick={() => void finish('demo')}
                loading={busy === 'demo'}
                disabled={!!busy}
              >
                Explorar com dados de exemplo
              </Button>
              <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                Os dados de exemplo são fictícios (6 meses) e substituem as contas informadas. Para começar do zero
                depois, use “Apagar todos os dados” em Configurações.
              </p>
              <div className="flex justify-start">
                <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} />} onClick={back} disabled={!!busy}>
                  Voltar
                </Button>
              </div>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
