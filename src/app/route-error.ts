/**
 * Falha ao carregar um pedaço (chunk) do app sob demanda. Acontece numa aba antiga depois de uma atualização do
 * PWA: os arquivos com o hash anterior foram removidos do cache/servidor.
 */
const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i;

export function isChunkLoadError(error: unknown): boolean {
  if (error instanceof Error) return CHUNK_ERROR.test(error.message);
  return typeof error === 'string' && CHUNK_ERROR.test(error);
}

/** Chave (sessionStorage) com o momento da última recarga automática. */
export const CHUNK_RELOAD_KEY = 'patrimonius:chunk-reload';
/** Intervalo mínimo entre recargas automáticas (evita recarregar em laço quando o arquivo continua faltando). */
const RELOAD_GUARD_MS = 60_000;

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Se o erro é de carregamento de chunk, recarrega a página UMA vez (a recarga busca a versão nova do app).
 * Sem sessionStorage disponível não recarrega (não há como impedir um laço). Retorna true se recarregou.
 */
export function reloadOnceForChunkError(
  error: unknown,
  reload: () => void = () => window.location.reload(),
  storage: Storage | null = sessionStore(),
  now: number = Date.now(),
): boolean {
  if (!isChunkLoadError(error) || !storage) return false;
  try {
    const last = Number(storage.getItem(CHUNK_RELOAD_KEY));
    if (Number.isFinite(last) && last > 0 && now - last < RELOAD_GUARD_MS) return false;
    storage.setItem(CHUNK_RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}
