import { useEffect } from 'react';
import { useSettings } from '@/db/hooks';

/**
 * Modo "ocultar valores": aplica a classe .hide-values no <html>, para que valem também os valores renderizados fora
 * do AppShell (modais, confirmações e notificações são portais no <body>).
 */
export function HideValuesController() {
  const hidden = useSettings()?.hideValues ?? false;
  useEffect(() => {
    document.documentElement.classList.toggle('hide-values', hidden);
    return () => document.documentElement.classList.remove('hide-values');
  }, [hidden]);
  return null;
}
