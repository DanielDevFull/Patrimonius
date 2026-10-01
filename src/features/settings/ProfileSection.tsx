import { User } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button, Card, CardHeader, Field, Input, useToast } from '@/components/ui';
import { updateSettings } from '@/db/repo';
import type { Settings } from '@/domain/types';

/** Perfil: como o app te chama e o nome do agente financeiro. */
export function ProfileSection({ settings }: { settings: Settings }) {
  const toast = useToast();
  const ids = { name: useId(), agent: useId() };
  const [userName, setUserName] = useState(settings.userName);
  const [agentName, setAgentName] = useState(settings.agentName);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const agentError = agentName.trim() ? null : 'Dê um nome ao seu agente financeiro.';
  const dirty = userName.trim() !== settings.userName || agentName.trim() !== settings.agentName;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (agentError) return;
    setSaving(true);
    try {
      await updateSettings({ userName: userName.trim(), agentName: agentName.trim() });
      toast('Perfil salvo.');
    } catch {
      toast('Não foi possível salvar o perfil.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card id="perfil" className="scroll-mt-20">
      <CardHeader icon={<User size={20} />} title="Perfil" subtitle="Como o app e o agente falam com você." />
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Seu nome" htmlFor={ids.name} hint="Opcional. Usado nas saudações.">
          <Input
            id={ids.name}
            value={userName}
            maxLength={60}
            autoComplete="given-name"
            placeholder="Como podemos te chamar?"
            onChange={(e) => setUserName(e.target.value)}
          />
        </Field>
        <Field
          label="Nome do agente"
          htmlFor={ids.agent}
          hint="Seu assistente financeiro local."
          error={submitted ? agentError : null}
        >
          <Input
            id={ids.agent}
            value={agentName}
            maxLength={30}
            placeholder="Pat"
            aria-invalid={submitted && !!agentError}
            onChange={(e) => setAgentName(e.target.value)}
          />
        </Field>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" loading={saving} disabled={!dirty}>
            Salvar perfil
          </Button>
        </div>
      </form>
    </Card>
  );
}
