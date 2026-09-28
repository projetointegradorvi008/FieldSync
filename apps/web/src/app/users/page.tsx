'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts/toast-context';
import { NavBar } from '@/components/nav-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { extractApiErrorMessage, getFriendlyErrorMessage } from '@/lib/error-message';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  isRootAdmin: boolean;
}

// Espelha auth/role-hierarchy.ts no Backend — quanto menor, maior o
// privilégio. Usado só para reforço visual (esconder/desabilitar botões e
// filtrar o seletor de perfil); a regra que realmente vale é sempre a do
// Backend.
const ROLE_LEVEL: Record<string, number> = {
  ROOT: 0,
  ADMINISTRADOR: 1,
  GESTOR: 2,
  SUPERVISOR: 3,
  PESQUISADOR: 4,
  VISUALIZADOR: 4,
};

const ALL_ROLES = ['ADMINISTRADOR', 'GESTOR', 'SUPERVISOR', 'PESQUISADOR', 'VISUALIZADOR'];

// CRUD de usuários da organização. A regra de hierarquia de perfis (quem
// pode criar/desativar/excluir quem) é aplicada pelo Backend — esta página
// só mostra o formulário e a tabela, e trata os erros que voltarem da API.
// O usuário-raiz (isRootAdmin) nunca pode ser desativado nem excluído — as
// ações ficam desabilitadas na tabela como reforço visual da regra do
// Backend (que é quem realmente impede, mesmo se alguém pular a UI).
export default function UsersPage() {
  const { user: currentUser, apiFetch } = useAuth();
  const myLevel = currentUser ? (ROLE_LEVEL[currentUser.role] ?? 99) : 99;
  // Só é possível criar/desativar/excluir um perfil hierarquicamente ABAIXO
  // do próprio (nível estritamente maior) — ex: SUPERVISOR só enxerga
  // Pesquisador e Visualizador aqui, nunca Gestor/Administrador/outro
  // Supervisor.
  const assignableRoles = ALL_ROLES.filter((r) => ROLE_LEVEL[r] > myLevel);
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('PESQUISADOR');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadUsers() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('search', search);
      const response = await apiFetch(`/users?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(extractApiErrorMessage(data, 'Falha ao carregar usuários.'));
      setUsers(data.data);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Falha ao carregar usuários.'));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca inicial ao montar e ao digitar na busca
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(extractApiErrorMessage(data, 'Falha ao criar usuário.'));
      setName('');
      setEmail('');
      setPassword('');
      setRole('PESQUISADOR');
      toast.success('Usuário criado.');
      await loadUsers();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Falha ao criar usuário.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleActive(userRow: UserRow) {
    // Ação destrutiva: desativar bloqueia o login do usuário
    // imediatamente (e derruba qualquer sessão já aberta dele).
    if (
      userRow.isActive &&
      !window.confirm(`Desativar "${userRow.name}"? A pessoa não poderá mais entrar no sistema, e sessões abertas dela serão encerradas.`)
    ) {
      return;
    }
    try {
      const response = await apiFetch(`/users/${userRow.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !userRow.isActive }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(extractApiErrorMessage(data, 'Falha ao atualizar usuário.'));
      toast.success(userRow.isActive ? 'Usuário desativado.' : 'Usuário ativado.');
      await loadUsers();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Falha ao atualizar usuário.'));
    }
  }

  async function handleDelete(userRow: UserRow) {
    const message = userRow.role === 'PESQUISADOR'
      ? `Excluir "${userRow.name}" permanentemente? As pesquisas e respostas já coletadas por ele são mantidas. Esta ação não pode ser desfeita.`
      : `Excluir "${userRow.name}" permanentemente? Esta ação não pode ser desfeita.`;
    if (!window.confirm(message)) {
      return;
    }
    try {
      const response = await apiFetch(`/users/${userRow.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(extractApiErrorMessage(data, 'Falha ao excluir usuário.'));
      }
      toast.success('Usuário excluído.');
      await loadUsers();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Falha ao excluir usuário.'));
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="flex flex-1 flex-col gap-6 p-8">
        <h1 className="text-2xl font-semibold">Gestão de Usuários</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo usuário</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5" onSubmit={handleCreate}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="nome@exemplo.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Senha</Label>
                <PasswordInput
                  id="password"
                  minLength={8}
                  placeholder="Mínimo de 8 caracteres"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="role">Perfil</Label>
                <select
                  id="role"
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  {assignableRoles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={isSubmitting} className="w-full">
                  {isSubmitting ? 'Criando...' : 'Criar usuário'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usuários da organização</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5 sm:max-w-xs">
              <Label htmlFor="search">Buscar por nome</Label>
              <Input
                id="search"
                placeholder="Digite para filtrar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {isLoading ? (
              <p className="text-muted-foreground">Carregando...</p>
            ) : users.length === 0 ? (
              <p className="text-muted-foreground">Nenhum usuário encontrado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4">Nome</th>
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 pr-4">Perfil</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((userRow) => (
                      <tr key={userRow.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">
                          {userRow.name}
                          {userRow.isRootAdmin && (
                            <Badge variant="outline" className="ml-2">
                              Protegido
                            </Badge>
                          )}
                        </td>
                        <td className="py-2 pr-4">{userRow.email}</td>
                        <td className="py-2 pr-4">{userRow.role}</td>
                        <td className="py-2 pr-4">
                          <Badge variant={userRow.isActive ? 'success' : 'secondary'}>
                            {userRow.isActive ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4">
                          {!userRow.isRootAdmin && ROLE_LEVEL[userRow.role] > myLevel && (
                            <div className="flex flex-wrap gap-2">
                              <Button variant="outline" size="sm" onClick={() => toggleActive(userRow)}>
                                {userRow.isActive ? 'Desativar' : 'Ativar'}
                              </Button>
                              <Button variant="destructive" size="sm" onClick={() => handleDelete(userRow)}>
                                Excluir
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
