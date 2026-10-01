import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/**
 * Cartão base. `min-w-0`: dentro de grid/flex o cartão pode encolher até a largura disponível; sem isso, textos
 * com `truncate`/`whitespace-nowrap` alargam a coluna além da tela no celular (rolagem horizontal).
 */
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Botões/links à direita. */
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, actions, icon, className }: CardHeaderProps) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-2">
        {icon && <div className="mt-0.5 text-brand-700 dark:text-brand-400">{icon}</div>}
        <div className="min-w-0">
          {/* Até 2 linhas (não corta "Próximos compromissos" ao lado das ações); o texto completo fica no title. */}
          <h2
            title={typeof title === 'string' ? title : undefined}
            className="line-clamp-2 text-base font-semibold wrap-break-word text-slate-900 dark:text-slate-100"
          >
            {title}
          </h2>
          {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
