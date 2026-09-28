'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';

// Barra de navegação superior, presente em toda página autenticada. Os links
// de Usuários/Sessões só aparecem para os perfis com permissão — isso é só
// UX; a autorização real é sempre aplicada de novo no Backend. A gestão de
// conflitos não tem mais rota/aba própria — vive dentro do Painel
// Operacional de cada pesquisa (/surveys/[id]/responses).
const USER_MANAGEMENT_ROLES = ['ADMINISTRADOR', 'GESTOR', 'SUPERVISOR'];
// VISUALIZADOR só enxerga dados (Dashboard/Analytics/Painel/mapa) — a aba de
// Sessões (gestão de dispositivos logados) fica bloqueada para esse perfil.
const SESSIONS_BLOCKED_ROLES = ['VISUALIZADOR'];

export function NavBar() {
  const { user, logout } = useAuth();

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-3">
      <div className="flex flex-wrap items-center gap-8">
        <span className="flex items-center gap-2 font-semibold">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-primary">
            <path
              d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M9.2 8.6a3.2 3.2 0 0 1 5.4-1.3M14.8 10.4a3.2 3.2 0 0 1-5.4 1.3"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          FieldSync
        </span>
        <nav className="flex flex-wrap items-center gap-5 text-sm font-medium text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground">
            Painel
          </Link>
          <Link href="/surveys" className="hover:text-foreground">
            Pesquisas
          </Link>
          {user && USER_MANAGEMENT_ROLES.includes(user.role) && (
            <Link href="/users" className="hover:text-foreground">
              Usuários
            </Link>
          )}
          {user && !SESSIONS_BLOCKED_ROLES.includes(user.role) && (
            <Link href="/sessions" className="hover:text-foreground">
              Sessões
            </Link>
          )}
        </nav>
      </div>
      <div className="flex items-center gap-3 text-sm">
        {user && (
          <span className="flex items-center gap-2 text-muted-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
              {user.name
                .split(' ')
                .slice(0, 2)
                .map((part) => part[0])
                .join('')
                .toUpperCase()}
            </span>
            {user.name} · {user.role}
          </span>
        )}
        <Button variant="outline" size="sm" onClick={() => logout()}>
          Sair
        </Button>
      </div>
    </header>
  );
}
