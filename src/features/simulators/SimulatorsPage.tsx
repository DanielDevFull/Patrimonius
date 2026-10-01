import { useSearchParams } from 'react-router';
import { PageHeader, SegmentedControl, segmentPanelId, segmentTabId, Spinner } from '@/components/ui';
import { useFinanceData, useToday } from '@/db/hooks';
import { AffordabilitySim } from './AffordabilitySim';
import { CompoundInterestSim } from './CompoundInterestSim';
import { EmergencyFundSim } from './EmergencyFundSim';
import { PayOrInvestSim } from './PayOrInvestSim';
import { SIMULATOR_TABS, parseTab, type SimulatorTab } from './simulator-utils';
import { TimeToGoalSim } from './TimeToGoalSim';

/** Prefixo dos ids das abas/painel (aria-controls e aria-labelledby). */
const SIMULATOR_TABS_ID = 'simuladores';

/** Simuladores financeiros (aba atual em `?aba=`, para links diretos do agente). */
export default function SimulatorsPage() {
  const data = useFinanceData();
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get('aba'));

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
          idPrefix={SIMULATOR_TABS_ID}
          options={SIMULATOR_TABS}
          value={tab}
          onChange={select}
          className="whitespace-nowrap"
        />
      </div>

      {!data ? (
        <Spinner />
      ) : (
        <div
          role="tabpanel"
          id={segmentPanelId(SIMULATOR_TABS_ID, tab)}
          aria-labelledby={segmentTabId(SIMULATOR_TABS_ID, tab)}
        >
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
