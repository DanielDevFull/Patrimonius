import { Link } from 'react-router';
import { EmptyState } from '@/components/ui';

export function NotFound() {
  return (
    <EmptyState
      icon="🧭"
      title="Página não encontrada"
      description="O endereço acessado não existe."
      action={
        <Link to="/" className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-400">
          Voltar ao painel
        </Link>
      }
    />
  );
}
