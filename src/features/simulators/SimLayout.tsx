import type { ReactNode } from 'react';
import { Card, CardHeader } from '@/components/ui';

/** Cartão padrão de um simulador. */
export function SimCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      {children}
    </Card>
  );
}

/** Mensagem quando os campos ainda não permitem calcular. */
export function SimEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="mt-5 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
      {children}
    </p>
  );
}
