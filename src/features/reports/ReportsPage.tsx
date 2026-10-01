import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  Button,
  PageHeader,
  SegmentedControl,
  segmentPanelId,
  segmentTabId,
  Spinner,
  useToast,
} from '@/components/ui';
import { downloadCSV, transactionsToCSV } from '@/db/backup';
import { useFinanceData, useToday } from '@/db/hooks';
import { formatMonthLong, monthKey } from '@/domain/dates';
import { plural } from '@/domain/text';
import type { MonthKey } from '@/domain/types';
import { csvFileName, parsePeriod, PERIOD_OPTIONS, periodMonths, periodTransactions } from './report-utils';
import { CashflowTab } from './tabs/CashflowTab';
import { CategoriesTab } from './tabs/CategoriesTab';
import { ClosingTab } from './tabs/ClosingTab';
import { CompareTab } from './tabs/CompareTab';
import { RuleTab } from './tabs/RuleTab';

type ReportTab = 'fechamento' | 'categorias' | 'fluxo' | '503020' | 'comparativo';

const TABS: { value: ReportTab; label: string }[] = [
  { value: 'fechamento', label: 'Fechamento do mês' },
  { value: 'categorias', label: 'Categorias' },
  { value: 'fluxo', label: 'Fluxo de caixa' },
  { value: '503020', label: '50/30/20' },
  { value: 'comparativo', label: 'Comparativo' },
];

/** Prefixo dos ids das abas/painel (aria-controls e aria-labelledby). */
const REPORT_TABS_ID = 'relatorios';

function parseTab(value: string | null): ReportTab {
  return TABS.some((t) => t.value === value) ? (value as ReportTab) : 'fechamento';
}

export default function ReportsPage() {
  const data = useFinanceData();
  const today = useToday();
  const toast = useToast();
  const currentMonth = monthKey(today);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('aba'));
  const [period, setPeriod] = useState(() => parsePeriod(searchParams.get('periodo')));
  const [month, setMonth] = useState<MonthKey>(currentMonth);
  const months = useMemo(() => periodMonths(currentMonth, period), [currentMonth, period]);

  if (!data) return <Spinner />;

  function changeTab(next: ReportTab) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set('aba', next);
        return params;
      },
      { replace: true },
    );
  }

  function exportCSV() {
    if (!data) return;
    const txs = periodTransactions(data.transactions, months);
    if (txs.length === 0) {
      toast('Não há lançamentos no período selecionado.', 'info');
      return;
    }
    try {
      downloadCSV(csvFileName(months), transactionsToCSV(txs, data.categories, data.accounts));
      toast(`CSV exportado com ${plural(txs.length, 'lançamento', 'lançamentos')}.`, 'success');
    } catch {
      toast('Não foi possível gerar o arquivo CSV.', 'error');
    }
  }

  const monthProps = { data, month, maxMonth: currentMonth, onMonthChange: setMonth };

  return (
    <div>
      <PageHeader
        title="Relatórios"
        subtitle="Análises do seu dinheiro, calculadas aqui no seu dispositivo."
        actions={
          <Button variant="secondary" icon={<Download size={16} aria-hidden />} onClick={exportCSV}>
            Exportar CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <SegmentedControl
          mode="radio"
          options={PERIOD_OPTIONS}
          value={String(period) as `${typeof period}`}
          onChange={(v) => setPeriod(parsePeriod(v))}
          aria-label="Período"
        />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          De {formatMonthLong(months[0])} a {formatMonthLong(months[months.length - 1])}
        </p>
      </div>

      <div className="-mx-4 mb-5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <SegmentedControl
          options={TABS}
          value={tab}
          onChange={changeTab}
          aria-label="Relatórios"
          idPrefix={REPORT_TABS_ID}
          className="*:shrink-0 *:whitespace-nowrap"
        />
      </div>

      <div
        role="tabpanel"
        id={segmentPanelId(REPORT_TABS_ID, tab)}
        aria-labelledby={segmentTabId(REPORT_TABS_ID, tab)}
      >
        {tab === 'fechamento' && <ClosingTab {...monthProps} today={today} />}
        {tab === 'categorias' && <CategoriesTab data={data} months={months} />}
        {tab === 'fluxo' && <CashflowTab data={data} months={months} />}
        {tab === '503020' && <RuleTab {...monthProps} />}
        {tab === 'comparativo' && <CompareTab {...monthProps} />}
      </div>
    </div>
  );
}
