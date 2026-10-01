import { SendHorizontal } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button, cn, controlClass } from '@/components/ui';
import { MAX_MESSAGE_LENGTH } from './chat-utils';

export interface ComposerProps {
  agentName: string;
  /** Bloqueia o envio (ex.: enquanto o agente responde). Digitar continua permitido. */
  sendDisabled?: boolean;
  onSend: (text: string) => void;
}

/** Altura máxima do campo antes de rolar (px). */
const MAX_HEIGHT = 144;

/** Campo de mensagem: Enter envia, Shift+Enter quebra a linha. Cresce conforme o texto. */
export function Composer({ agentName, sendDisabled, onSend }: ComposerProps) {
  const id = useId();
  const hintId = useId();
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = text.trim().length > 0 && !sendDisabled;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    if (el.scrollHeight > 0) el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [text]);

  function submit() {
    if (!canSend) return;
    onSend(text);
    setText('');
    ref.current?.focus();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex items-end gap-2">
      <label htmlFor={id} className="sr-only">
        Mensagem para o {agentName}
      </label>
      <textarea
        ref={ref}
        id={id}
        rows={1}
        value={text}
        maxLength={MAX_MESSAGE_LENGTH}
        enterKeyHint="send"
        autoComplete="off"
        aria-describedby={hintId}
        placeholder={`Fale com o ${agentName}…`}
        className={cn(controlClass, 'min-h-11 resize-none overflow-y-auto py-2.5 leading-5')}
        style={{ maxHeight: MAX_HEIGHT }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <span id={hintId} className="sr-only">
        Enter envia; Shift+Enter quebra a linha.
      </span>
      <Button
        type="submit"
        aria-label="Enviar mensagem"
        title="Enviar mensagem"
        disabled={!canSend}
        className="size-11 shrink-0 px-0"
        icon={<SendHorizontal size={18} aria-hidden />}
      />
    </form>
  );
}
