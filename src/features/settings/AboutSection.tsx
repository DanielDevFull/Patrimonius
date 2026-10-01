import { Info, Monitor, Smartphone, Tablet, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, Card, CardHeader } from '@/components/ui';
import { APP_VERSION } from './preferences';

function InstallStep({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 text-slate-400" aria-hidden>
        {icon}
      </span>
      <div>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{title}</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">{children}</p>
      </div>
    </li>
  );
}

/** Versão, privacidade e como instalar como app (PWA). */
export function AboutSection({ agentName }: { agentName: string }) {
  return (
    <Card id="sobre" className="scroll-mt-20">
      <CardHeader
        icon={<Info size={20} />}
        title="Sobre"
        actions={<Badge tone="brand">Versão {APP_VERSION}</Badge>}
      />
      <div className="space-y-5">
        <div className="flex gap-3 rounded-xl bg-emerald-50 p-3 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
          <WifiOff size={20} className="mt-0.5 shrink-0" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold">100% offline: seus dados nunca saem deste dispositivo.</p>
            <p className="mt-0.5 text-emerald-800 dark:text-emerald-300">
              Sem cadastro, sem conexão com bancos e sem servidores. O {agentName || 'agente'} faz todas as análises aqui
              mesmo, no seu aparelho. Como nada fica na nuvem, exporte backups de vez em quando.
            </p>
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Instale como app</h3>
          <ul className="space-y-3">
            <InstallStep icon={<Smartphone size={18} />} title="Android (Chrome)">
              Toque no menu ⋮ e escolha “Instalar app” ou “Adicionar à tela inicial”.
            </InstallStep>
            <InstallStep icon={<Tablet size={18} />} title="iPhone e iPad (Safari)">
              Toque em Compartilhar (quadrado com seta) e depois em “Adicionar à Tela de Início”.
            </InstallStep>
            <InstallStep icon={<Monitor size={18} />} title="Computador (Chrome ou Edge)">
              Clique no ícone de instalar na barra de endereço ou, no menu, em “Instalar Patrimonius”.
            </InstallStep>
          </ul>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Instalado, o Patrimonius abre em tela cheia e funciona mesmo sem internet.
          </p>
        </div>
      </div>
    </Card>
  );
}
