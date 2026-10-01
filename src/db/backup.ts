/**
 * Backup, restauração e exportação dos dados — tudo LOCAL.
 * O arquivo de backup é gerado no próprio navegador (Blob) e baixado pelo usuário; nada é enviado pela rede.
 */
import { formatDateBR, isISODate, isMonthKey, nowTimestamp, todayISO } from '@/domain/dates';
import { COLOR_PALETTE, buildDefaultSettings } from '@/domain/defaults';
import type { Account, Category, Cents, ISODate, Settings, Transaction } from '@/domain/types';
import { DATA_TABLES, db, type DataTableName } from './db';
import { ensureInitialized } from './repo';

/* ------------------------------------------------------------------ */
/* Formato do arquivo                                                  */
/* ------------------------------------------------------------------ */

export interface BackupFile {
  app: 'patrimonius';
  version: 1;
  /** Momento da exportação (ISO 8601 completo). */
  exportedAt: string;
  data: Record<DataTableName, unknown[]>;
}

export type BackupValidation = { ok: true; backup: BackupFile } | { ok: false; error: string };

export type ImportMode = 'replace' | 'merge';

/** Nome de cada tabela em pt-BR (mensagens de erro e resumo da importação). */
export const TABLE_LABELS: Record<DataTableName, string> = {
  accounts: 'contas',
  categories: 'categorias',
  transactions: 'lançamentos',
  recurring: 'recorrências',
  budgets: 'orçamentos',
  goals: 'metas',
  goalContributions: 'aportes em metas',
  debts: 'dívidas',
  debtPayments: 'pagamentos de dívidas',
  assets: 'bens',
  assetValuations: 'avaliações de bens',
  settings: 'configurações',
  chat: 'conversa com o agente',
};

/* ------------------------------------------------------------------ */
/* Exportação                                                          */
/* ------------------------------------------------------------------ */

/** Lê todas as tabelas em uma única transação de leitura (instantâneo consistente). */
export async function exportBackup(): Promise<BackupFile> {
  const data = {} as Record<DataTableName, unknown[]>;
  await db.transaction('r', db.tables, async () => {
    for (const name of DATA_TABLES) {
      data[name] = await db.table(name).toArray();
    }
  });
  return { app: 'patrimonius', version: 1, exportedAt: nowTimestamp(), data };
}

/** 'patrimonius-backup-2026-10-01.json' */
export function backupFileName(today: ISODate = todayISO()): string {
  return `patrimonius-backup-${today}.json`;
}

/** Inicia o download de um Blob gerado localmente. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Dá tempo ao navegador de iniciar o download antes de liberar a URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Exporta e baixa o backup em JSON. Retorna o nome do arquivo gerado. */
export async function downloadBackup(today: ISODate = todayISO()): Promise<string> {
  const backup = await exportBackup();
  const filename = backupFileName(today);
  downloadBlob(filename, new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  return filename;
}

/* ------------------------------------------------------------------ */
/* Validação                                                           */
/* ------------------------------------------------------------------ */

type Rec = Record<string, unknown>;
/** Retorna a mensagem do problema encontrado no registro ou null se estiver ok. */
type RecordCheck = (r: Rec) => string | null;

const ENUMS = {
  accountType: ['corrente', 'poupanca', 'carteira', 'investimento', 'cartao_credito', 'outro'],
  categoryKind: ['despesa', 'receita'],
  budgetGroup: ['necessidades', 'desejos', 'objetivos'],
  transactionType: ['despesa', 'receita', 'transferencia'],
  transactionStatus: ['pago', 'pendente'],
  recurringType: ['despesa', 'receita'],
  frequency: ['semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral', 'semestral', 'anual'],
  priority: ['alta', 'media', 'baixa'],
  goalStatus: ['ativa', 'concluida', 'pausada'],
  debtType: ['cartao', 'emprestimo', 'financiamento', 'cheque_especial', 'pessoal', 'outro'],
  debtStatus: ['ativa', 'quitada'],
  assetType: ['imovel', 'veiculo', 'investimento', 'previdencia', 'participacao', 'bem_pessoal', 'outro'],
  theme: ['system', 'light', 'dark'],
  chatRole: ['user', 'agent'],
} as const;

function isRecord(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/** Composição de verificações: devolve o primeiro problema encontrado. */
function all(...checks: RecordCheck[]): RecordCheck {
  return (r) => {
    for (const check of checks) {
      const problem = check(r);
      if (problem) return problem;
    }
    return null;
  };
}

function str(field: string): RecordCheck {
  return (r) => (typeof r[field] === 'string' ? null : `campo "${field}" deve ser texto`);
}

function nonEmptyStr(field: string): RecordCheck {
  return (r) => (typeof r[field] === 'string' && r[field] !== '' ? null : `campo "${field}" ausente`);
}

function nullableStr(field: string): RecordCheck {
  return (r) => (r[field] === null || typeof r[field] === 'string' ? null : `campo "${field}" inválido`);
}

function int(field: string, opts: { min?: number } = {}): RecordCheck {
  return (r) => {
    const v = r[field];
    if (!isInt(v)) return `campo "${field}" deve ser um valor inteiro em centavos`;
    if (opts.min !== undefined && v < opts.min) return `campo "${field}" deve ser maior ou igual a ${opts.min}`;
    return null;
  };
}

function nullableInt(field: string): RecordCheck {
  return (r) => (r[field] === null || isInt(r[field]) ? null : `campo "${field}" deve ser inteiro ou vazio`);
}

function finiteNumber(field: string): RecordCheck {
  return (r) => {
    const v = r[field];
    return typeof v === 'number' && Number.isFinite(v) ? null : `campo "${field}" deve ser numérico`;
  };
}

function date(field: string): RecordCheck {
  return (r) => (isISODate(r[field]) ? null : `data inválida em "${field}" (use AAAA-MM-DD)`);
}

function nullableDate(field: string): RecordCheck {
  return (r) => (r[field] === null || isISODate(r[field]) ? null : `data inválida em "${field}" (use AAAA-MM-DD)`);
}

/** Campo opcional (ausente em backups antigos): ausente, null ou data válida. */
function optionalDate(field: string): RecordCheck {
  return (r) =>
    r[field] === undefined || r[field] === null || isISODate(r[field])
      ? null
      : `data inválida em "${field}" (use AAAA-MM-DD)`;
}

function oneOf(field: string, values: readonly string[], nullable = false): RecordCheck {
  return (r) => {
    const v = r[field];
    if (nullable && v === null) return null;
    return typeof v === 'string' && values.includes(v) ? null : `valor inválido em "${field}"`;
  };
}

function bool(field: string): RecordCheck {
  return (r) => (typeof r[field] === 'boolean' ? null : `campo "${field}" deve ser verdadeiro/falso`);
}

const transactionCheck: RecordCheck = all(
  oneOf('type', ENUMS.transactionType),
  int('amount', { min: 1 }),
  date('date'),
  str('description'),
  nonEmptyStr('accountId'),
  nullableStr('categoryId'),
  nullableStr('toAccountId'),
  oneOf('status', ENUMS.transactionStatus),
  (r) =>
    Array.isArray(r.tags) && r.tags.every((t) => typeof t === 'string') ? null : 'campo "tags" deve ser uma lista',
  (r) =>
    r.type === 'transferencia' && (typeof r.toAccountId !== 'string' || r.toAccountId === '')
      ? 'transferência sem conta de destino'
      : null,
  (r) => {
    const inst = r.installment;
    if (inst === null || inst === undefined) return null;
    if (!isRecord(inst) || typeof inst.groupId !== 'string' || !isInt(inst.number) || !isInt(inst.total)) {
      return 'dados de parcelamento inválidos';
    }
    return null;
  },
);

/** Validação básica por tabela (campos essenciais para o app funcionar). */
const TABLE_CHECKS: Record<DataTableName, RecordCheck> = {
  accounts: all(str('name'), oneOf('type', ENUMS.accountType), int('initialBalance'), nullableInt('creditLimit')),
  categories: all(str('name'), oneOf('kind', ENUMS.categoryKind), oneOf('group', ENUMS.budgetGroup, true)),
  transactions: transactionCheck,
  recurring: all(
    oneOf('type', ENUMS.recurringType),
    int('amount', { min: 1 }),
    str('description'),
    nonEmptyStr('categoryId'),
    nonEmptyStr('accountId'),
    oneOf('frequency', ENUMS.frequency),
    date('startDate'),
    date('nextDate'),
    nullableDate('endDate'),
  ),
  budgets: all(
    nonEmptyStr('categoryId'),
    int('amount', { min: 0 }),
    (r) => (r.month === null || isMonthKey(r.month) ? null : 'mês inválido em "month" (use AAAA-MM)'),
  ),
  goals: all(
    str('name'),
    int('targetAmount', { min: 0 }),
    nullableDate('targetDate'),
    oneOf('priority', ENUMS.priority),
    oneOf('status', ENUMS.goalStatus),
    nullableStr('accountId'),
  ),
  goalContributions: all(nonEmptyStr('goalId'), int('amount'), date('date'), nullableStr('transactionId')),
  debts: all(
    str('name'),
    oneOf('type', ENUMS.debtType),
    int('balance', { min: 0 }),
    date('balanceDate'),
    finiteNumber('interestRate'),
    int('minimumPayment', { min: 0 }),
    oneOf('status', ENUMS.debtStatus),
  ),
  debtPayments: all(nonEmptyStr('debtId'), int('amount', { min: 1 }), date('date'), nullableStr('transactionId')),
  assets: all(
    str('name'),
    oneOf('type', ENUMS.assetType),
    int('value', { min: 0 }),
    bool('archived'),
    optionalDate('archivedAt'),
  ),
  assetValuations: all(nonEmptyStr('assetId'), int('value', { min: 0 }), date('date')),
  settings: all(
    (r) => (r.id === 'settings' ? null : 'registro de configurações deve ter id "settings"'),
    (r) => (r.theme === undefined ? null : oneOf('theme', ENUMS.theme)(r)),
    (r) => (r.onboardingDone === undefined ? null : bool('onboardingDone')(r)),
  ),
  chat: all(oneOf('role', ENUMS.chatRole), str('text')),
};

/**
 * Valida um JSON (já convertido em objeto) como backup do Patrimonius.
 * Verifica identificação/versão, presença de todas as tabelas como listas e campos essenciais de cada registro
 * (id em texto, valores inteiros em centavos, datas AAAA-MM-DD válidas e tipos enumerados).
 * Mensagens de erro em pt-BR, prontas para exibir ao usuário.
 */
export function validateBackup(json: unknown): BackupValidation {
  if (!isRecord(json)) return { ok: false, error: 'O arquivo não contém um backup válido.' };
  if (json.app !== 'patrimonius') {
    return { ok: false, error: 'Este arquivo não é um backup do Patrimonius.' };
  }
  if (json.version !== 1) {
    return {
      ok: false,
      error: `Versão de backup não suportada (${String(json.version)}). Atualize o app e tente novamente.`,
    };
  }
  if (!isRecord(json.data)) return { ok: false, error: 'O backup não contém a seção de dados.' };
  const source = json.data;
  const data = {} as Record<DataTableName, unknown[]>;

  for (const name of DATA_TABLES) {
    const rows = source[name];
    const label = TABLE_LABELS[name];
    if (!Array.isArray(rows)) {
      return { ok: false, error: `O backup não contém a lista de ${label}.` };
    }
    const seen = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const row: unknown = rows[i];
      const where = `Registro ${i + 1} de ${label}`;
      if (!isRecord(row)) return { ok: false, error: `${where} não é um objeto.` };
      if (typeof row.id !== 'string' || row.id === '') {
        return { ok: false, error: `${where} está sem identificador (id).` };
      }
      if (seen.has(row.id)) return { ok: false, error: `${where} tem o identificador repetido "${row.id}".` };
      seen.add(row.id);
      const problem = TABLE_CHECKS[name](row);
      if (problem) return { ok: false, error: `${where} é inválido: ${problem}.` };
    }
    if (name === 'settings' && rows.length > 1) {
      return { ok: false, error: 'O backup contém mais de um registro de configurações.' };
    }
    data[name] = rows;
  }

  const exportedAt = typeof json.exportedAt === 'string' ? json.exportedAt : '';
  return { ok: true, backup: { app: 'patrimonius', version: 1, exportedAt, data } };
}

/** Faz o parse do texto de um arquivo e valida como backup. */
export function parseBackupText(text: string): BackupValidation {
  let json: unknown;
  try {
    // Remove BOM eventual (arquivos salvos por alguns editores).
    json = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return { ok: false, error: 'O arquivo não é um JSON válido. Escolha o arquivo .json gerado pelo Patrimonius.' };
  }
  return validateBackup(json);
}

/** Quantidade de registros por tabela (para mostrar um resumo antes de importar). */
export function backupCounts(backup: BackupFile): Record<DataTableName, number> {
  const counts = {} as Record<DataTableName, number>;
  for (const name of DATA_TABLES) counts[name] = backup.data[name].length;
  return counts;
}

/* ------------------------------------------------------------------ */
/* Importação / limpeza                                                */
/* ------------------------------------------------------------------ */

/**
 * Completa campos que possam faltar em backups de versões antigas e troca pelo padrão os que vierem com tipo errado
 * (ex.: `userName: null` num backup editado à mão derrubava a tela de Configurações).
 */
function normalizeSettings(rows: unknown[]): unknown[] {
  return rows.map((row) => {
    const defaults: Settings = buildDefaultSettings(nowTimestamp());
    const merged: Rec = { ...defaults, ...(row as Rec), id: 'settings' };
    for (const [field, valid] of SETTINGS_FIELDS) {
      if (!valid(merged[field])) merged[field] = defaults[field];
    }
    return merged;
  });
}

/** [campo, valor aceito?, valor padrão]: campos que o app usa mas a validação não exige (ícones, cores, notas...). */
type FieldDefault = readonly [field: string, valid: (v: unknown) => boolean, fallback: (row: Rec, now: string) => unknown];

const isText = (v: unknown) => typeof v === 'string';
const isBoolean = (v: unknown) => typeof v === 'boolean';
const isNullableInt = (v: unknown) => v === null || isInt(v);
const isNullableText = (v: unknown) => v === null || typeof v === 'string';
const isNullableDate = (v: unknown) => v === null || isISODate(v);
const isPresent = (v: unknown) => v !== undefined;
const isTextList = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isNumberAtLeastZero = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const always = (value: unknown) => (): unknown => value;

/** Campos das configurações e o tipo aceito (o resto volta ao padrão em normalizeSettings). */
const SETTINGS_FIELDS: readonly (readonly [keyof Settings, (v: unknown) => boolean])[] = [
  ['userName', isText],
  ['agentName', isText],
  ['emergencyFundTargetMonths', isNumberAtLeastZero],
  ['savingsRateTarget', isNumberAtLeastZero],
  ['monthlyIncomeEstimate', isNullableInt],
  ['theme', (v) => typeof v === 'string' && (ENUMS.theme as readonly string[]).includes(v)],
  ['onboardingDone', isBoolean],
  ['hideValues', isBoolean],
  ['dismissedInsights', isRecord],
  ['createdAt', isText],
  ['updatedAt', isText],
];
const stamp = (_row: Rec, now: string) => now;
const FALLBACK_COLOR = COLOR_PALETTE[0];

const ENTITY_STAMPS: readonly FieldDefault[] = [
  ['createdAt', isText, stamp],
  ['updatedAt', isText, stamp],
];
const CREATED_STAMP: readonly FieldDefault[] = [['createdAt', isText, stamp]];

/** Padrões por tabela (mesmo papel de normalizeSettings para as demais tabelas). */
const TABLE_DEFAULTS: Partial<Record<DataTableName, readonly FieldDefault[]>> = {
  accounts: [
    ['icon', isText, always('')],
    ['color', isText, always(FALLBACK_COLOR)],
    ['archived', isBoolean, always(false)],
    ['includeInNetWorth', isBoolean, always(true)],
    ['closingDay', isNullableInt, always(null)],
    ['dueDay', isNullableInt, always(null)],
    ...ENTITY_STAMPS,
  ],
  categories: [
    ['icon', isText, always('')],
    ['color', isText, always(FALLBACK_COLOR)],
    ['keywords', isTextList, () => []],
    ['archived', isBoolean, always(false)],
    ...ENTITY_STAMPS,
  ],
  transactions: [
    ['notes', isText, always('')],
    ['recurringId', isNullableText, always(null)],
    ['installment', isPresent, always(null)],
    ...ENTITY_STAMPS,
  ],
  recurring: [
    // Sem a informação, não gera lançamentos sozinha (o usuário liga no formulário se quiser).
    ['autoGenerate', isBoolean, always(false)],
    ['active', isBoolean, always(true)],
    ...ENTITY_STAMPS,
  ],
  budgets: ENTITY_STAMPS,
  goals: [
    ['icon', isText, always('')],
    ['color', isText, always(FALLBACK_COLOR)],
    ['notes', isText, always('')],
    ...ENTITY_STAMPS,
  ],
  goalContributions: [['note', isText, always('')], ...CREATED_STAMP],
  debts: [
    ['creditor', isText, always('')],
    ['originalAmount', isInt, (row) => row.balance],
    ['dueDay', isNullableInt, always(null)],
    ['remainingInstallments', isNullableInt, always(null)],
    ['notes', isText, always('')],
    ...ENTITY_STAMPS,
  ],
  debtPayments: [['note', isText, always('')], ...CREATED_STAMP],
  assets: [
    ['acquisitionValue', isNullableInt, always(null)],
    ['acquisitionDate', isNullableDate, always(null)],
    ['notes', isText, always('')],
    ...ENTITY_STAMPS,
  ],
  assetValuations: CREATED_STAMP,
  chat: [['payload', isPresent, always(null)], ...CREATED_STAMP],
};

/**
 * Completa/corrige campos que o app usa e a validação não exige (ex.: backup editado à mão sem o ícone de uma
 * categoria, que derrubaria os textos do agente). Registros completos são devolvidos sem alteração.
 */
function normalizeRows(name: DataTableName, rows: unknown[], now: string): unknown[] {
  if (name === 'settings') return normalizeSettings(rows);
  const defaults = TABLE_DEFAULTS[name];
  if (!defaults) return rows;
  return rows.map((row) => {
    const r = row as Rec;
    let fixed: Rec | null = null;
    for (const [field, valid, fallback] of defaults) {
      if (valid(r[field])) continue;
      fixed ??= { ...r };
      fixed[field] = fallback(r, now);
    }
    return fixed ?? r;
  });
}

/** Mapa id removido -> id que ficou: um registro por chave; `better(a, b)` = `a` deve ficar no lugar de `b`. */
function duplicatesByKey<T extends { id: string }>(
  rows: T[],
  key: (row: T) => string,
  better: (a: T, b: T) => boolean,
): Map<string, string> {
  const winners = new Map<string, T>();
  const losers: [id: string, key: string][] = [];
  for (const row of rows) {
    const k = key(row);
    const current = winners.get(k);
    if (!current) winners.set(k, row);
    else if (better(row, current)) {
      losers.push([current.id, k]);
      winners.set(k, row);
    } else losers.push([row.id, k]);
  }
  return new Map(losers.map(([id, k]) => [id, winners.get(k)?.id ?? id]));
}

/**
 * Mesclar: une registros EQUIVALENTES com ids diferentes (ex.: backups de dois aparelhos que partiram do mesmo
 * arquivo) — a mesma ocorrência de recorrência (regra + data), gerada com um id em cada aparelho, e o mesmo
 * orçamento (categoria + mês). Fica um só: na ocorrência, o pago antes do pendente; depois o editado por último;
 * no empate, o do arquivo. Aportes/pagamentos que apontavam para um lançamento removido passam a apontar para o que
 * ficou. Roda dentro da transação da importação.
 */
async function unifyEquivalentRecords(fileIds: Set<string>): Promise<void> {
  const newer = (a: { id: string; updatedAt: string }, b: { id: string; updatedAt: string }) =>
    a.updatedAt !== b.updatedAt ? a.updatedAt > b.updatedAt : fileIds.has(a.id) && !fileIds.has(b.id);

  const generated = await db.transactions.filter((t) => t.recurringId !== null).toArray();
  const txRemap = duplicatesByKey(
    generated,
    (t) => `${t.recurringId}|${t.date}`,
    (a, b) => (a.status !== b.status ? a.status === 'pago' : newer(a, b)),
  );
  if (txRemap.size > 0) {
    await db.transactions.bulkDelete([...txRemap.keys()]);
    const relink = (link: { transactionId: string | null }) => {
      if (link.transactionId !== null) link.transactionId = txRemap.get(link.transactionId) ?? link.transactionId;
    };
    const points = (link: { transactionId: string | null }) =>
      link.transactionId !== null && txRemap.has(link.transactionId);
    await db.goalContributions.filter(points).modify(relink);
    await db.debtPayments.filter(points).modify(relink);
  }

  const budgetRemap = duplicatesByKey(
    await db.budgets.toArray(),
    (b) => `${b.categoryId}|${b.month ?? 'padrão'}`,
    newer,
  );
  if (budgetRemap.size > 0) await db.budgets.bulkDelete([...budgetRemap.keys()]);
}

/**
 * Importa um backup já validado.
 * - 'replace': apaga TODAS as tabelas e grava o conteúdo do backup (uma única transação: tudo ou nada);
 * - 'merge': grava por cima dos dados atuais (registros com o mesmo id são substituídos; os demais são mantidos) e
 *   une registros equivalentes com ids diferentes (mesma ocorrência de recorrência, mesmo orçamento).
 * Campos não essenciais ausentes recebem valores padrão. Ao final garante categorias padrão e configurações.
 * Retorna o total de registros gravados.
 */
export async function importBackup(backup: BackupFile, mode: ImportMode): Promise<number> {
  let total = 0;
  const now = nowTimestamp();
  await db.transaction('rw', db.tables, async () => {
    if (mode === 'replace') {
      await Promise.all(db.tables.map((t) => t.clear()));
    }
    for (const name of DATA_TABLES) {
      const rows = normalizeRows(name, backup.data[name], now);
      if (rows.length === 0) continue;
      await db.table(name).bulkPut(rows);
      total += rows.length;
    }
    if (mode === 'merge') {
      const fileIds = new Set(
        [...backup.data.transactions, ...backup.data.budgets].map((row) => String((row as Rec).id)),
      );
      await unifyEquivalentRecords(fileIds);
    }
  });
  await ensureInitialized();
  return total;
}

/** Apaga TODOS os dados do dispositivo e recria categorias e configurações padrão. */
export async function resetAllData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
  await ensureInitialized();
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

const CSV_SEPARATOR = ';';
const CSV_NEWLINE = '\r\n';
const BOM = '\uFEFF';

export const CSV_HEADER = [
  'Data',
  'Descrição',
  'Tipo',
  'Categoria',
  'Conta',
  'Conta de destino',
  'Valor',
  'Status',
  'Parcela',
  'Tags',
  'Observações',
] as const;

const CSV_TYPE_LABELS: Record<Transaction['type'], string> = {
  despesa: 'Despesa',
  receita: 'Receita',
  transferencia: 'Transferência',
};

/** Escapa um campo: aspas duplicadas e campo entre aspas quando contém separador, aspas ou quebra de linha. */
export function csvField(value: string): string {
  if (/[";\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Início que as planilhas interpretam como fórmula (=, +, -, @) ou que o Excel descarta (tabulação, CR). */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Campo de TEXTO livre (descrição, nomes, tags, observações): neutraliza fórmulas prefixando um apóstrofo — Excel e
 * LibreOffice avaliam '=...', '+...', '-...' e '@...' mesmo entre aspas (ex.: '- ajuste' viraria #NOME?) — e então
 * escapa como csvField. Não use em colunas numéricas (Valor).
 */
export function csvText(value: string): string {
  return csvField(FORMULA_START.test(value) ? `'${value}` : value);
}

/** Centavos em decimal brasileiro sem separador de milhar: -123456 => '-1234,56'. */
export function csvDecimal(cents: Cents): string {
  const abs = Math.abs(Math.trunc(cents));
  const reais = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return `${cents < 0 ? '-' : ''}${reais},${rest}`;
}

/**
 * Converte lançamentos em CSV para planilhas brasileiras (Excel/LibreOffice/Google Planilhas):
 * separador ';', vírgula decimal, datas DD/MM/AAAA, cabeçalho em pt-BR, BOM UTF-8 e quebras de linha CRLF.
 * Valor com sinal: despesas negativas, receitas positivas, transferências positivas (a coluna Tipo identifica).
 * Parcela como '2 de 10'; textos que começam com =, +, - ou @ recebem um apóstrofo (não viram fórmula).
 * Ordenado por data (mais antigo primeiro), depois descrição.
 */
export function transactionsToCSV(transactions: Transaction[], categories: Category[], accounts: Account[]): string {
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const sorted = [...transactions].sort(
    (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      a.description.localeCompare(b.description, 'pt-BR') ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const lines = [CSV_HEADER.join(CSV_SEPARATOR)];
  for (const tx of sorted) {
    const category =
      tx.type === 'transferencia' || tx.categoryId === null
        ? ''
        : (categoryName.get(tx.categoryId) ?? 'Sem categoria');
    const signed = tx.type === 'despesa' ? -tx.amount : tx.amount;
    const cells = [
      csvField(formatDateBR(tx.date)),
      csvText(tx.description),
      csvField(CSV_TYPE_LABELS[tx.type] ?? tx.type),
      csvText(category),
      csvText(accountName.get(tx.accountId) ?? '(conta removida)'),
      csvText(tx.toAccountId ? (accountName.get(tx.toAccountId) ?? '(conta removida)') : ''),
      csvField(csvDecimal(signed)),
      csvField(tx.status === 'pago' ? 'Pago' : 'Pendente'),
      // '1 de 12' (e não '1/12', que o Excel em pt-BR converte na data 01/dez).
      csvField(tx.installment ? `${tx.installment.number} de ${tx.installment.total}` : ''),
      csvText(tx.tags.join(', ')),
      csvText(tx.notes),
    ];
    lines.push(cells.join(CSV_SEPARATOR));
  }
  return BOM + lines.join(CSV_NEWLINE) + CSV_NEWLINE;
}

/** Baixa um CSV gerado localmente. */
export function downloadCSV(filename: string, csv: string): void {
  downloadBlob(filename, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}
