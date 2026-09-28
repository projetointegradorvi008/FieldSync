'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts/toast-context';
import { NavBar } from '@/components/nav-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { extractApiErrorMessage, getFriendlyErrorMessage } from '@/lib/error-message';

interface SurveyRow {
  id: string;
  title: string;
  description: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  currentVersion: number;
  createdAt: string;
  createdBy: { id: string; name: string };
  _count: { responses: number };
}

type SortOption = 'newest' | 'oldest' | 'name';

const MANAGER_ROLES = ['ADMINISTRADOR', 'GESTOR'];

const STATUS_BADGE_VARIANT: Record<SurveyRow['status'], 'default' | 'secondary' | 'outline'> = {
  DRAFT: 'outline',
  PUBLISHED: 'default',
  ARCHIVED: 'secondary',
};

const STATUS_LABEL: Record<SurveyRow['status'], string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicada',
  ARCHIVED: 'Arquivada',
};

// Lista de pesquisas com filtros, criação e arquivamento. PESQUISADOR só
// visualiza (isManager=false esconde ações de gestão); a construção do
// formulário e a publicação de versão ficam na página de detalhe.
export default function SurveysPage() {
  const { user, apiFetch } = useAuth();
  const { toast } = useToast();
  const isManager = !!user && MANAGER_ROLES.includes(user.role);

  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('newest');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadSurveys() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);

      const response = await apiFetch(`/surveys?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(extractApiErrorMessage(data, 'Não foi possível carregar as pesquisas.'));
      setSurveys(data.data);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Não foi possível carregar as pesquisas.'));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca inicial ao montar e ao trocar filtros
    loadSurveys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await apiFetch('/surveys', {
        method: 'POST',
        body: JSON.stringify({ title, description: description || undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(extractApiErrorMessage(data, 'Não foi possível criar a pesquisa.'));
      setTitle('');
      setDescription('');
      toast.success('Pesquisa criada.');
      await loadSurveys();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Não foi possível criar a pesquisa.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDuplicate(id: string) {
    try {
      const response = await apiFetch(`/surveys/${id}/duplicate`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(extractApiErrorMessage(data, 'Não foi possível duplicar a pesquisa.'));
      toast.success('Pesquisa duplicada.');
      await loadSurveys();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Não foi possível duplicar a pesquisa.'));
    }
  }

  async function handleArchive(id: string, title: string) {
    // Ação destrutiva — confirmação obrigatória: uma pesquisa arquivada
    // não pode mais receber respostas nem ser editada.
    if (!window.confirm(`Arquivar "${title}"? Não será mais possível editá-la ou coletar respostas.`)) {
      return;
    }
    try {
      const response = await apiFetch(`/surveys/${id}/archive`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(extractApiErrorMessage(data, 'Não foi possível arquivar a pesquisa.'));
      toast.success('Pesquisa arquivada.');
      await loadSurveys();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Não foi possível arquivar a pesquisa.'));
    }
  }

  async function handleUnarchive(id: string, title: string) {
    if (!window.confirm(`Desarquivar "${title}"? A pesquisa voltará a ficar disponível para edição/coleta.`)) {
      return;
    }
    try {
      const response = await apiFetch(`/surveys/${id}/unarchive`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(extractApiErrorMessage(data, 'Não foi possível desarquivar a pesquisa.'));
      toast.success('Pesquisa desarquivada.');
      await loadSurveys();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Não foi possível desarquivar a pesquisa.'));
    }
  }

  async function handleDelete(id: string, title: string) {
    // Excluir é permanente — o backend também bloqueia pesquisas publicadas
    // ou com respostas, mas a confirmação aqui já deixa claro que não há volta.
    if (!window.confirm(`Excluir "${title}" permanentemente? Essa ação não pode ser desfeita.`)) {
      return;
    }
    try {
      const response = await apiFetch(`/surveys/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(extractApiErrorMessage(data, 'Não foi possível excluir a pesquisa.'));
      }
      toast.success('Pesquisa excluída.');
      await loadSurveys();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Não foi possível excluir a pesquisa.'));
    }
  }

  const sortedSurveys = [...surveys].sort((a, b) => {
    if (sortOption === 'name') return a.title.localeCompare(b.title, 'pt-BR');
    const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return sortOption === 'oldest' ? diff : -diff;
  });

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="flex flex-1 flex-col gap-6 p-8">
        <h1 className="text-2xl font-semibold">Pesquisas</h1>

        {isManager && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nova pesquisa</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid grid-cols-1 gap-4 sm:grid-cols-3" onSubmit={handleCreate}>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="title">Título</Label>
                  <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={isSubmitting} className="w-full">
                    {isSubmitting ? 'Criando...' : 'Criar pesquisa'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-6">
            <div className="flex flex-1 min-w-40 flex-col gap-1.5">
              <Label htmlFor="search">Buscar por título</Label>
              <Input
                id="search"
                placeholder="Ex: satisfação"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="DRAFT">Rascunho</option>
                <option value="PUBLISHED">Publicada</option>
                <option value="ARCHIVED">Arquivada</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sort">Ordenar por</Label>
              <select
                id="sort"
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
              >
                <option value="newest">Mais recentes</option>
                <option value="oldest">Mais antigas</option>
                <option value="name">Nome (A-Z)</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : sortedSurveys.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma pesquisa encontrada.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedSurveys.map((survey) => (
              <Card key={survey.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">
                      <Link href={`/surveys/${survey.id}`} className="hover:underline">
                        {survey.title}
                      </Link>
                    </CardTitle>
                    <Badge variant={STATUS_BADGE_VARIANT[survey.status]}>
                      {STATUS_LABEL[survey.status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {survey.description && (
                    <p className="text-sm text-muted-foreground">{survey.description}</p>
                  )}
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span>Versão atual: {survey.currentVersion}</span>
                    <span>Respostas: {survey._count.responses}</span>
                  </div>
                  {isManager && (
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/surveys/${survey.id}`}>
                        <Button variant="outline" size="sm">
                          Detalhes
                        </Button>
                      </Link>
                      <Button variant="outline" size="sm" onClick={() => handleDuplicate(survey.id)}>
                        Duplicar
                      </Button>
                      {survey.status !== 'ARCHIVED' && (
                        <Button variant="destructive" size="sm" onClick={() => handleArchive(survey.id, survey.title)}>
                          Arquivar
                        </Button>
                      )}
                      {survey.status === 'ARCHIVED' && (
                        <Button variant="outline" size="sm" onClick={() => handleUnarchive(survey.id, survey.title)}>
                          Desarquivar
                        </Button>
                      )}
                      {survey.status !== 'PUBLISHED' && (
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(survey.id, survey.title)}>
                          Excluir
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
