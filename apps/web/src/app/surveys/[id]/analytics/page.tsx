'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts/toast-context';
import { NavBar } from '@/components/nav-bar';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LocationPoint } from '@/components/analytics/survey-map';
import { extractApiErrorMessage, getFriendlyErrorMessage } from '@/lib/error-message';

const SurveyMap = dynamic(
  () => import('@/components/analytics/survey-map').then((mod) => mod.SurveyMap),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground">Carregando mapa...</p> },
);

interface ResponseRow {
  id: string;
  respondentId: string | null;
  status: 'SYNCED' | 'CONFLICT' | 'ERROR';
  collectedAt: string;
  syncedAt: string;
  researcher: { id: string; name: string } | null;
}

interface ByResearcherRow {
  researcherId: string;
  researcherName: string;
  total: number;
  synced: number;
  conflicts: number;
  errors: number;
}

interface ByPeriodRow {
  period: string;
  total: number;
  synced: number;
  conflicts: number;
  errors: number;
}

interface SurveyInfo {
  title: string;
}

interface ResearcherOption {
  id: string;
  name: string;
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

// Página de Analytics completa: filtros, tabela paginada,
// gráficos (por pesquisador e por período) e o mapa de coletas, mais
// exportação CSV/JSON via download de Blob. SurveyMap é importado
// dinamicamente sem SSR porque bibliotecas de mapa (Leaflet) dependem do
// navegador.
export default function SurveyAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { apiFetch } = useAuth();
  const { toast } = useToast();

  const [survey, setSurvey] = useState<SurveyInfo | null>(null);
  const [researcherOptions, setResearcherOptions] = useState<ResearcherOption[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [byResearcher, setByResearcher] = useState<ByResearcherRow[]>([]);
  const [byPeriod, setByPeriod] = useState<ByPeriodRow[]>([]);
  const [locations, setLocations] = useState<LocationPoint[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const [statusFilter, setStatusFilter] = useState('');
  const [researcherFilter, setResearcherFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  async function load() {
    setIsLoading(true);
    try {
      if (!survey) {
        const surveyResponse = await apiFetch(`/surveys/${id}`);
        const surveyData = await surveyResponse.json();
        if (surveyResponse.ok) setSurvey(surveyData);
      }

      const commonParams = new URLSearchParams();
      if (researcherFilter) commonParams.set('researcherId', researcherFilter);
      if (fromFilter) commonParams.set('from', new Date(fromFilter).toISOString());
      if (toFilter) commonParams.set('to', new Date(toFilter).toISOString());

      const responsesParams = new URLSearchParams(commonParams);
      responsesParams.set('page', String(page));
      if (statusFilter) responsesParams.set('status', statusFilter);

      const periodParams = new URLSearchParams(commonParams);
      periodParams.set('groupBy', groupBy);

      const [responsesRes, byResearcherRes, byPeriodRes, locationsRes] = await Promise.all([
        apiFetch(`/analytics/surveys/${id}/responses?${responsesParams.toString()}`),
        apiFetch(`/analytics/surveys/${id}/by-researcher?${commonParams.toString()}`),
        apiFetch(`/analytics/surveys/${id}/by-period?${periodParams.toString()}`),
        apiFetch(`/analytics/surveys/${id}/locations?${commonParams.toString()}`),
      ]);

      const responsesData = await responsesRes.json();
      if (!responsesRes.ok) throw new Error(extractApiErrorMessage(responsesData, 'Falha ao carregar respostas.'));
      setResponses(responsesData.data);
      setTotalPages(responsesData.meta.totalPages);

      const byResearcherData = await byResearcherRes.json();
      if (byResearcherRes.ok) setByResearcher(byResearcherData.data);

      const byPeriodData = await byPeriodRes.json();
      if (byPeriodRes.ok) setByPeriod(byPeriodData.data);

      const locationsData = await locationsRes.json();
      if (locationsRes.ok) setLocations(locationsData.data);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Falha ao carregar analytics.'));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca inicial ao montar e ao trocar filtros/página
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, page, statusFilter, researcherFilter, fromFilter, toFilter, groupBy]);

  useEffect(() => {
    // Opções do filtro "Pesquisador" — sem atribuição por pesquisa, lista
    // todo pesquisador ativo da organização.
    (async () => {
      try {
        const response = await apiFetch('/users?role=PESQUISADOR&limit=100');
        const data = await response.json();
        if (response.ok) setResearcherOptions(data.data);
      } catch {
        // Filtro é conveniência, não crítico.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleExport(format: 'csv' | 'json') {
    setIsExporting(true);
    try {
      const params = new URLSearchParams({ format });
      if (researcherFilter) params.set('researcherId', researcherFilter);
      if (fromFilter) params.set('from', new Date(fromFilter).toISOString());
      if (toFilter) params.set('to', new Date(toFilter).toISOString());

      const response = await apiFetch(`/analytics/surveys/${id}/export?${params.toString()}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(extractApiErrorMessage(data, 'Falha ao exportar.'));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `survey-${id}-export.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Falha ao exportar.'));
    } finally {
      setIsExporting(false);
    }
  }

  const periodLabels = byPeriod.map((p) => ({
    ...p,
    label: new Date(p.period).toLocaleDateString('pt-BR'),
  }));

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="flex flex-1 flex-col gap-6 p-8">
        <div className="flex items-center justify-between">
          <div>
            <Link href={`/surveys/${id}`} className="text-sm text-muted-foreground hover:underline">
              ← {survey?.title ?? 'Pesquisa'}
            </Link>
            <h1 className="text-2xl font-semibold">Analytics</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={isExporting} onClick={() => handleExport('csv')}>
              Exportar CSV
            </Button>
            <Button variant="outline" size="sm" disabled={isExporting} onClick={() => handleExport('json')}>
              Exportar JSON
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          A exportação nunca inclui o nome do entrevistado (dado pessoal, LGPD).
        </p>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="groupBy">Agrupar série por</Label>
                <select
                  id="groupBy"
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as 'day' | 'week' | 'month')}
                >
                  <option value="day">Dia</option>
                  <option value="week">Semana</option>
                  <option value="month">Mês</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Respostas por pesquisador</CardTitle>
            </CardHeader>
            <CardContent>
              {byResearcher.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados para os filtros atuais.</p>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byResearcher}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="researcherName" fontSize={11} />
                      <YAxis fontSize={11} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="synced" name="Sincronizadas" fill="#15803d" stackId="a" />
                      <Bar dataKey="conflicts" name="Conflitos" fill="#7c3aed" stackId="a" />
                      <Bar dataKey="errors" name="Erros" fill="#c0392b" stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Respostas por período</CardTitle>
            </CardHeader>
            <CardContent>
              {periodLabels.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados para os filtros atuais.</p>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={periodLabels}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" fontSize={11} />
                      <YAxis fontSize={11} allowDecimals={false} />
                      <Tooltip />
                      <Line type="monotone" dataKey="total" name="Total" stroke="oklch(0.48 0.16 255)" dot={false} />
                      <Line type="monotone" dataKey="synced" name="Sincronizadas" stroke="#15803d" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mapa de coletas</CardTitle>
          </CardHeader>
          <CardContent>
            <SurveyMap points={locations} />
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
                      <th className="py-2 pr-4" />
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
                        <td className="py-2 pr-4">
                          <Link
                            href={`/surveys/${id}/analytics/responses/${response.id}`}
                            className="text-sm text-muted-foreground hover:underline"
                          >
                            Ver detalhe
                          </Link>
                        </td>
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
      </main>
    </div>
  );
}
