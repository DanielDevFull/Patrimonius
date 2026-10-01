import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/components/ui';

/** Link com aparência de botão secundário pequeno (navegação, não ação). */
export function LinkButton({
  to,
  children,
  icon,
  variant = 'secondary',
  className,
}: {
  to: string;
  children: ReactNode;
  icon?: ReactNode;
  variant?: 'secondary' | 'primary';
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors',
        variant === 'primary'
          ? 'bg-brand-700 text-white shadow-sm hover:bg-brand-800'
          : 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600 dark:hover:bg-slate-700',
        className,
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

/** "Ver todos →" no canto do cabeçalho do card. */
export function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline dark:text-brand-400 dark:hover:text-brand-300"
    >
      {children}
      <ArrowRight size={14} aria-hidden />
    </Link>
  );
}
