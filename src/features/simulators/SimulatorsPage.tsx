import { useSearchParams } from 'react-router';
import { PageHeader, SegmentedControl, Spinner } from '@/components/ui';
import { useFinanceData, useToday } from '@/db/hooks';
import { AffordabilitySim } from './AffordabilitySim';
import { CompoundInterestSim } from './CompoundInterestSim';
import { EmergencyFundSim } from './EmergencyFundSim';
import { PayOrInvestSim } from './PayOrInvestSim';
import { SIMULATOR_TABS, parseTab, type SimulatorTab } from './simulator-utils';
import { TimeToGoalSim } from './TimeToGoalSim';

/** Simuladores financeiros (aba atual em `?aba=`, para links diretos do agente). */
export default function SimulatorsPage() {
  const data = useFinanceData();
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get('aba'));
  const current = SIMULATOR_TABS.find((t) => t.value === tab) ?? SIMULATOR_TABS[0];

  function select(next: SimulatorTab) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('aba', next);
        return p;
      },
      { replace: true },
    );
  }

  return (
    <div>
      <PageHeader
        title="Simuladores"
        subtitle="Faça as contas antes de decidir. Tudo é calculado no seu dispositivo."
      />
      <div className="-mx-4 mb-5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <SegmentedControl
          aria-label="Simuladores"
          options={SIMULATOR_TABS}
          value={tab}
          onChange={select}
          className="whitespace-nowrap"
        />
      </div>

      {!data ? (
        <Spinner />
      ) : (
        <div role="tabpanel" aria-label={current.label}>
          {tab === 'juros' && <CompoundInterestSim hideValues={data.settings.hideValues} />}
          {tab === 'tempo' && <TimeToGoalSim today={today} />}
          {tab === 'comprar' && <AffordabilitySim data={data} today={today} />}
          {tab === 'reserva' && <EmergencyFundSim data={data} today={today} />}
          {tab === 'quitar' && <PayOrInvestSim debts={data.debts} payments={data.debtPayments} />}
        </div>
      )}
    </div>
  );
}
