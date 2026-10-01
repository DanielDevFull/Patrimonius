import { useId, useState, type FormEvent } from 'react';
import {
  Button,
  ColorSwatches,
  Field,
  Input,
  Modal,
  MoneyInput,
  Select,
  Switch,
  useToast,
} from '@/components/ui';
import { addAccount, updateAccount } from '@/db/repo';
import { ACCOUNT_TYPE_ICONS, COLOR_PALETTE } from '@/domain/defaults';
import { ACCOUNT_TYPE_LABELS, type Account, type AccountType, type Cents } from '@/domain/types';
import { parseDay, validateAccountForm, type AccountFormField } from './account-utils';

const TYPE_ORDER: AccountType[] = [
  'corrente',
  'poupanca',
  'carteira',
  'investimento',
  'cartao_credito',
  'outro',
];
const EMOJI_SUGGESTIONS = ['🏦', '🐷', '👛', '📈', '💳', '💼', '💰', '🪙', '🏧', '💵', '🟣', '🟠'];
const DEFAULT_ICONS = new Set<string>(Object.values(ACCOUNT_TYPE_ICONS));

export interface AccountFormModalProps {
  /** Conta em edição (null = nova). */
  account: Account | null;
  accounts: Account[];
  onClose: () => void;
  onSaved?: (account: Account) => void;
}

/** Criação/edição de conta. Montado somente quando aberto (o estado é recriado a cada abertura). */
export function AccountFormModal({ account, accounts, onClose, onSaved }: AccountFormModalProps) {
  const toast = useToast();
  const ids = {
    form: useId(),
    name: useId(),
    type: useId(),
    balance: useId(),
    icon: useId(),
    limit: useId(),
    closing: useId(),
    due: useId(),
  };
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'corrente');
  const [initialBalance, setInitialBalance] = useState<Cents | null>(account ? account.initialBalance : null);
  const [color, setColor] = useState(account?.color ?? COLOR_PALETTE[0]);
  const [icon, setIcon] = useState(account?.icon ?? ACCOUNT_TYPE_ICONS.corrente);
  const [includeInNetWorth, setIncludeInNetWorth] = useState(account?.includeInNetWorth ?? true);
  const [creditLimit, setCreditLimit] = useState<Cents | null>(account?.creditLimit ?? null);
  const [closingDay, setClosingDay] = useState(account?.closingDay ? String(account.closingDay) : '');
  const [dueDay, setDueDay] = useState(account?.dueDay ? String(account.dueDay) : '');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const isCard = type === 'cartao_credito';
  const errors = validateAccountForm({ name, isCard, closingDay, dueDay }, accounts, account?.id ?? null);
  const show = (f: AccountFormField) => (submitted ? errors[f] : undefined);
  const colors = COLOR_PALETTE.includes(color) ? COLOR_PALETTE : [...COLOR_PALETTE, color];

  function changeType(next: AccountType) {
    setType(next);
    // Troca o emoji padrão junto com o tipo, a menos que o usuário tenha escolhido outro.
    if (!icon.trim() || DEFAULT_ICONS.has(icon)) setIcon(ACCOUNT_TYPE_ICONS[next]);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) {
      const first = errors.name ? ids.name : errors.closingDay ? ids.closing : ids.due;
      document.getElementById(first)?.focus();
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim().replace(/\s+/g, ' '),
      type,
      initialBalance: initialBalance ?? 0,
      color,
      icon: icon.trim() || ACCOUNT_TYPE_ICONS[type],
      includeInNetWorth,
      creditLimit: isCard ? creditLimit : null,
      closingDay: isCard ? parseDay(closingDay) : null,
      dueDay: isCard ? parseDay(dueDay) : null,
    };
    try {
      if (account) {
        await updateAccount(account.id, payload);
        onSaved?.({ ...account, ...payload });
        toast('Conta atualizada.');
      } else {
        const created = await addAccount({ ...payload, archived: false });
        onSaved?.(created);
        toast('Conta criada.');
      }
      onClose();
    } catch {
      toast('Não foi possível salvar a conta.', 'error');
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={account ? 'Editar conta' : 'Nova conta'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={ids.form} loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <form id={ids.form} onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Nome" htmlFor={ids.name} error={show('name')}>
          <Input
            id={ids.name}
            value={name}
            maxLength={40}
            placeholder="Ex.: Nubank, Itaú, Carteira"
            aria-invalid={!!show('name')}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label="Tipo" htmlFor={ids.type}>
          <Select id={ids.type} value={type} onChange={(e) => changeType(e.target.value as AccountType)}>
            {TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Saldo inicial"
          htmlFor={ids.balance}
          hint={
            <>
              {isCard
                ? 'Informe a fatura em aberto como valor NEGATIVO (ex.: -350,00). Um valor positivo significa crédito no cartão.'
                : 'Quanto havia na conta quando você começou a usar o Patrimonius. Pode ser negativo (ex.: cheque especial).'}
              {account && (
                <span className="mt-1 block">
                  Alterar o saldo inicial muda todo o histórico. Para acertar só o saldo de hoje, use “Ajustar
                  saldo”.
                </span>
              )}
            </>
          }
        >
          <MoneyInput id={ids.balance} value={initialBalance} onChange={setInitialBalance} allowNegative />
        </Field>

        {isCard && (
          <div className="grid gap-4 rounded-xl border border-slate-200 p-3 sm:grid-cols-3 dark:border-slate-800">
            <Field label="Limite" htmlFor={ids.limit} className="sm:col-span-3">
              <MoneyInput id={ids.limit} value={creditLimit} onChange={setCreditLimit} />
            </Field>
            <Field label="Dia de fechamento" htmlFor={ids.closing} error={show('closingDay')}>
              <Input
                id={ids.closing}
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={closingDay}
                aria-invalid={!!show('closingDay')}
                onChange={(e) => setClosingDay(e.target.value)}
              />
            </Field>
            <Field label="Dia de vencimento" htmlFor={ids.due} error={show('dueDay')}>
              <Input
                id={ids.due}
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={dueDay}
                aria-invalid={!!show('dueDay')}
                onChange={(e) => setDueDay(e.target.value)}
              />
            </Field>
          </div>
        )}

        <Field label="Emoji" htmlFor={ids.icon}>
          <div className="flex items-center gap-3">
            <Input
              id={ids.icon}
              value={icon}
              maxLength={8}
              className="w-20 text-center"
              onChange={(e) => setIcon(e.target.value)}
            />
            <span
              aria-hidden
              className="flex size-10 items-center justify-center rounded-xl text-xl"
              style={{ backgroundColor: `${color}26` }}
            >
              {icon}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Sugestões de emoji">
            {EMOJI_SUGGESTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Usar ${emoji}`}
                aria-pressed={icon === emoji}
                onClick={() => setIcon(emoji)}
                className="flex size-9 items-center justify-center rounded-lg text-lg hover:bg-slate-100 aria-pressed:bg-brand-100 dark:hover:bg-slate-800 dark:aria-pressed:bg-brand-950"
              >
                {emoji}
              </button>
            ))}
          </div>
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Cor</span>
          <ColorSwatches value={color} onChange={setColor} colors={colors} />
        </div>

        <Switch
          checked={includeInNetWorth}
          onChange={setIncludeInNetWorth}
          label="Incluir no patrimônio"
          description="Desative para contas que não são suas (ex.: conta conjunta que você só administra)."
        />
      </form>
    </Modal>
  );
}
