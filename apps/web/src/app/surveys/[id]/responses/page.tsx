'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts/toast-context';
import { NavBar } from '@/components/nav-bar';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { extractApiErrorMessage, getFriendlyErrorMessage } from '@/lib/error-message';

interface ResponseRow {
  id: string;
  respondentId: string | null;
  status: 'SYNCED' | 'CONFLICT' | 'ERROR';
  collectedAt: string;
  syncedAt: string;
  researcher: { id: string; name: string } | null;
}

interface Counters {
  total: number;
  synced: number;
  conflict: number;
  error: number;
}

interface SurveyInfo {
  title: string;
}

interface ResearcherOption {
  id: string;
  name: string;
}

interface ConflictRow {
  id: string;
  detectedAt: string;
  response: {
    id: string;
    collectedAt: string;
    researcher: { name: string } | null;
  };
  conflictWith: { id: string; collectedAt: string; researcher: { name: string } | null };
}

const STATUS_BADGE_VARIANT: Record<ResponseRow['status'], 'success' | 'conflict' | 'destructive'> = {
  SYNCED: 'success',
  CONFLICT: 'conflict',
  ERROR: 'destructive',
};

const STATUS_LABEL: Record<ResponseRow['status'], string> = {
  SYNCED: 'Sincronizada',
  CONFLICT: 'Em conflito',
  ERROR: 'Com erro',
};

const CONFLICTS_ROLES = ['ADMINISTRADOR', 'GESTOR'];

// Painel operacional de uma pesquisa: tabela paginada e filtrável das
// respostas já sincronizadas, além da gestão de conflitos pendentes (antes
// numa aba própria "Conflitos" na navegação superior, movida para cá). O
// Analytics completo (mapa, gráficos, export) fica em /surveys/[id]/analytics.
export default function SurveyResponsesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user, apiFetch } = useAuth();
  const { toast } = useToast();
  const isManager = !!user && CONFLICTS_ROLES.includes(user.role);

  const [survey, setSurvey] = useState<SurveyInfo | null>(null);
  const [researcherOptions, setResearcherOptions] = useState<ResearcherOption[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [counters, setCounters] = useState<Counters | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState('');
  const [researcherFilter, setResearcherFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');

  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [conflictsPage, setConflictsPage] = useState(1);
  const [conflictsTotalPages, setConflictsTotalPages] = useState(1);
  const [isLoadingConflicts, setIsLoadingConflicts] = useState(true);

  async function load() {
    setIsLoading(true);
    try {
      if (!survey) {
        const surveyResponse = await apiFetch(`/surveys/${id}`);
        const surveyData = await surveyResponse.json();
        if (!surveyResponse.ok) throw new Error(extractApiErrorMessage(surveyData, 'Falha ao carregar pesquisa.'));
        setSurvey(surveyData);
      }

      const params = new URLSearchParams({ page: String(page) });
      if (statusFilter) params.set('status', statusFilter);
      if (researcherFilter) params.set('researcherId', researcherFilter);
      if (fromFilter) params.set('from', new Date(fromFilter).toISOString());
      if (toFilter) params.set('to', new Date(toFilter).toISOString());

      const response = await apiFetch(`/surveys/${id}/responses?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(extractApiErrorMessage(data, 'Falha ao carregar respostas.'));

      setResponses(data.data);
      setCounters(data.counters);
      setTotalPages(data.meta.totalPages);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Falha ao carregar respostas.'));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca inicial ao montar e ao trocar filtros/página
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, page, statusFilter, researcherFilter, fromFilter, toFilter]);

  useEffect(() => {
    if (!isManager) return;
    // Opções do filtro "Pesquisador" — como não existe mais atribuição por
    // pesquisa, lista todo pesquisador ativo da organização (não só quem já
    // coletou respostas aqui).
    (async () => {
      try {
        const response = await apiFetch('/users?role=PESQUISADOR&limit=100');
        const data = await response.json();
        if (response.ok) setResearcherOptions(data.data);
      } catch {
        // Filtro é conveniência, não crítico — falha aqui não deve travar a página.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager]);

  async function loadConflicts() {
    setIsLoadingConflicts(true);
    try {
      const params = new URLSearchParams({ page: String(conflictsPage), surveyId: id });
      const response = await apiFetch(`/conflicts?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(extractApiErrorMessage(data, 'Falha ao carregar conflitos.'));
      setConflicts(data.data);
      setConflictsTotalPages(data.meta.totalPages);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Falha ao carregar conflitos.'));
    } finally {
      setIsLoadingConflicts(false);
    }
  }

  useEffect(() => {
    if (!isManager) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca inicial ao montar e ao trocar página
    loadConflicts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, conflictsPage, isManager]);

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="flex flex-1 flex-col gap-6 p-8">
        <div>
          <Link href={`/surveys/${id}`} className="text-sm text-muted-foreground hover:underline">
            ← {survey?.title ?? 'Pesquisa'}
          </Link>
          <h1 className="text-2xl font-semibold">Painel operacional</h1>
        </div>

        {counters && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-normal text-muted-foreground">Total sincronizado</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{counters.total}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-normal text-muted-foreground">Sincronizadas</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{counters.synced}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-normal text-muted-foreground">Em conflito</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{counters.conflict}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-normal text-muted-foreground">Com erro</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{counters.error}</CardContent>
            </Card>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Contadores de respostas ainda pendentes ou com erro no dispositivo (antes de sincronizar) só existem
          localmente no celular do pesquisador — o Backend só enxerga o que já chegou. O Dashboard com KPIs
          e o Analytics completo constroem em cima desta visão básica.
        </p>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                  value={statusFilter}
                  onChange={(e) => {
                    setPage(1);
                    setStatusFilter(e.target.value);
                  }}
                >
                  <option value="">Todos</option>
                  <option value="SYNCED">Sincronizada</option>
                  <option value="CONFLICT">Em conflito</option>
                  <option value="ERROR">Com erro</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="researcher">Pesquisador</Label>
                <select
                  id="researcher"
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                  value={researcherFilter}
                  onChange={(e) => {
                    setPage(1);
                    setResearcherFilter(e.target.value);
                  }}
                >
                  <option value="">Todos</option>
                  {researcherOptions.map((researcher) => (
                    <option key={researcher.id} value={researcher.id}>
                      {researcher.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="from">De</Label>
                <input
                  id="from"
                  type="date"
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                  value={fromFilter}
                  onChange={(e) => {
                    setPage(1);
                    setFromFilter(e.target.value);
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="to">Até</Label>
                <input
                  id="to"
                  type="date"
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                  value={toFilter}
                  onChange={(e) => {
                    setPage(1);
                    setToFilter(e.target.value);
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Respostas</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Carregando...</p>
            ) : responses.length === 0 ? (
              <p className="text-muted-foreground">Nenhuma resposta encontrada para os filtros atuais.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4">Pesquisador</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Coletado em</th>
                      <th className="py-2 pr-4">Sincronizado em</th>
                      {isManager && <th className="py-2 pr-4" />}
                    </tr>
                  </thead>
                  <tbody>
                    {responses.map((response) => (
                      <tr key={response.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">{response.researcher?.name ?? 'Removido'}</td>
                        <td className="py-2 pr-4">
                          <Badge variant={STATUS_BADGE_VARIANT[response.status]}>
                            {STATUS_LABEL[response.status]}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4">{new Date(response.collectedAt).toLocaleString('pt-BR')}</td>
                        <td className="py-2 pr-4">{new Date(response.syncedAt).toLocaleString('pt-BR')}</td>
                        {isManager && (
                          <td className="py-2 pr-4">
                            <Link
                              href={`/surveys/${id}/analytics/responses/${response.id}`}
                              className="text-sm text-muted-foreground hover:underline"
                            >
                              Ver detalhe
                            </Link>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-4 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <span className="text-xs text-muted-foreground">
                  Página {page} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Próxima
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {isManager && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conflitos</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingConflicts ? (
                <p className="text-muted-foreground">Carregando...</p>
              ) : conflicts.length === 0 ? (
                <p className="text-muted-foreground">Nenhum conflito pendente de revisão.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4">Pesquisadores</th>
                        <th className="py-2 pr-4">Detectado em</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4" />
                      </tr>
                    </thead>
                    <tbody>
                      {conflicts.map((conflict) => (
                        <tr key={conflict.id} className="border-b last:border-0">
                          <td className="py-2 pr-4">
                            {conflict.response.researcher?.name ?? 'Removido'} ×{' '}
                            {conflict.conflictWith.researcher?.name ?? 'Removido'}
                          </td>
                          <td className="py-2 pr-4">
                            {new Date(conflict.detectedAt).toLocaleString('pt-BR')}
                          </td>
                          <td className="py-2 pr-4">
                            <Badge variant="warning">Pendente</Badge>
                          </td>
                          <td className="py-2 pr-4">
                            <Link href={`/conflicts/${conflict.id}`}>
                              <Button variant="outline" size="sm">
                                Comparar e resolver
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {conflictsTotalPages > 1 && (
                <div className="mt-4 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={conflictsPage <= 1}
                    onClick={() => setConflictsPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Página {conflictsPage} de {conflictsTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={conflictsPage >= conflictsTotalPages}
                    onClick={() => setConflictsPage((p) => Math.min(conflictsTotalPages, p + 1))}
                  >
                    Próxima
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
