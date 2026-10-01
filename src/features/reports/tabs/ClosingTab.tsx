import { Bot } from 'lucide-react';
import { useMemo } from 'react';
import { monthlyReport } from '@/agent';
import { Card, MonthPicker } from '@/components/ui';
import type { FinanceData, ISODate, MonthKey } from '@/domain/types';
import { MoneyText } from '../../dashboard/MoneyText';
import { AgentCards } from '../AgentCards';

export interface ClosingTabProps {
  data: FinanceData;
  today: ISODate;
  month: MonthKey;
  maxMonth: MonthKey;
  onMonthChange: (month: MonthKey) => void;
}

/** "Fechamento do mês": relatório narrativo escrito pelo agente + cards. */
export function ClosingTab({ data, today, month, maxMonth, onMonthChange }: ClosingTabProps) {
  const report = useMemo(() => monthlyReport(data, month, today), [data, month, today]);
  const agent = data.settings.agentName?.trim() || 'Pat';
  return (
    <div className="space-y-4">
      <MonthPicker value={month} onChange={onMonthChange} max={maxMonth} />
      <Card>
        <article aria-labelledby="closing-title">
          <div className="mb-3 flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-400">
              <Bot size={20} aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id="closing-title" className="text-lg font-semibold text-slate-900 dark:text-white">
                {report.title}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Escrito pelo {agent} com base nos seus lançamentos</p>
            </div>
          </div>
          <div className="space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            {report.paragraphs.map((p, i) => (
              <p key={i}>
                <MoneyText text={p} />
              </p>
            ))}
          </div>
        </article>
      </Card>
      {report.cards.length > 0 && <AgentCards cards={report.cards} />}
    </div>
  );
}
