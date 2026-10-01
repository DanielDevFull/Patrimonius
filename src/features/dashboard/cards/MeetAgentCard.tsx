import { Bot, MessageCircle } from 'lucide-react';
import { ROUTES } from '@/app/navigation';
import { Card, CardHeader } from '@/components/ui';
import { LinkButton } from './shared';

const EXAMPLES = ['gastei 45 no mercado', 'quanto gastei com restaurantes este mês?', 'posso gastar 300 em um tênis?'];

/** Apresentação do agente no primeiro uso. */
export function MeetAgentCard({ agentName, className }: { agentName: string; className?: string }) {
  return (
    <Card className={className}>
      <section aria-labelledby="dashboard-meet-agent-title">
        <CardHeader
          icon={<Bot size={18} aria-hidden />}
          title={<span id="dashboard-meet-agent-title">Conheça o {agentName}</span>}
          subtitle="Seu assistente financeiro, que roda só no seu aparelho"
        />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Escreva do seu jeito e o {agentName} registra lançamentos, responde dúvidas e dá recomendações. Experimente:
        </p>
        <ul className="mt-2 space-y-1">
          {EXAMPLES.map((ex) => (
            <li
              key={ex}
              className="rounded-lg bg-slate-50 px-3 py-1.5 text-sm italic text-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
            >
              “{ex}”
            </li>
          ))}
        </ul>
        <LinkButton to={ROUTES.assistant} icon={<MessageCircle size={16} aria-hidden />} className="mt-3">
          Conversar com o {agentName}
        </LinkButton>
      </section>
    </Card>
  );
}
