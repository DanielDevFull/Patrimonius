/** Nomes do erro e das causas internas (o Dexie embrulha o erro do IndexedDB em `inner`). */
function errorNames(error: unknown): string[] {
  const names: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const { name, inner } = current as { name?: unknown; inner?: unknown };
    if (typeof name === 'string') names.push(name);
    current = inner;
  }
  return names;
}

/** Aviso exibido quando a geração das recorrências do mês falha (o app abre mesmo assim). */
export const RECURRING_FAILED_MESSAGE =
  'Não foi possível gerar as recorrências do mês (armazenamento cheio?). Exporte um backup em Configurações e libere espaço no aparelho.';

/**
 * Mensagem em pt-BR para a falha ao abrir o banco local, sem o texto técnico do navegador/Dexie (em inglês e, no
 * Dexie, com um link externo).
 */
export function describeStartupError(error: unknown): string {
  const names = errorNames(error);
  if (names.includes('QuotaExceededError')) {
    return 'O armazenamento do navegador está cheio. Libere espaço no aparelho (ou apague dados de outros sites) e recarregue a página.';
  }
  if (names.includes('VersionError')) {
    return 'Seus dados foram salvos por uma versão mais nova do Patrimonius. Recarregue a página para atualizar o app.';
  }
  if (names.some((n) => ['MissingAPIError', 'InvalidStateError', 'SecurityError', 'InvalidAccessError'].includes(n))) {
    return 'Este navegador não permite o armazenamento local (IndexedDB) — comum em janelas anônimas/privadas ou com o armazenamento de sites bloqueado. Abra o Patrimonius numa janela normal ou permita o armazenamento de dados deste site.';
  }
  return 'Ocorreu um erro inesperado ao abrir o banco de dados local. Recarregue a página; se continuar, verifique se o navegador permite armazenamento local (IndexedDB).';
}
