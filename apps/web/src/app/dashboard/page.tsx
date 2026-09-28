'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts/toast-context';
import { NavBar } from '@/components/nav-bar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LocationPoint } from '@/components/analytics/survey-map';
import { extractApiErrorMessage, getFriendlyErrorMessage } from '@/lib/error-message';

const SurveyMap = dynamic(
  () => import('@/components/analytics/survey-map').then((mod) => mod.SurveyMap),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground">Carregando mapa...</p> },
);

interface SurveyRow {
  id: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  _count: { responses: number };
}

interface Indicators {
  totalSurveys: number;
  published: number;
  draft: number;
  archived: number;
  totalResponses: number;
}

type ChartStyle = 'bar' | 'pie';
type TopN = 3 | 5 | 10;

const PIE_COLORS = [
  'oklch(0.48 0.16 255)',
  'oklch(0.55 0.13 155)',
  'oklch(0.55 0.14 300)',
  'oklch(0.55 0.19 25)',
  'oklch(0.64 0.15 70)',
  '#db2777',
  '#0f766e',
];

function computeIndicators(surveys: SurveyRow[]): Indicators {
  let totalResponses = 0;
  let published = 0;
  let draft = 0;
  let archived = 0;

  for (const survey of surveys) {
    totalResponses += survey._count.responses;
    if (survey.status === 'PUBLISHED') published += 1;
    else if (survey.status === 'DRAFT') draft += 1;
    else archived += 1;
  }

  return {
    totalSurveys: surveys.length,
    published,
    draft,
    archived,
    totalResponses,
  };
}

// Nomes curtos demais no eixo X ficam ilegíveis — trunca com reticências e
// deixa o nome completo no tooltip (via Tooltip do recharts, que já usa o
// dado original de `payload`).
function truncateLabel(label: string, maxLength = 18): string {
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label;
}

function ChartStyleToggle({ value, onChange }: { value: ChartStyle; onChange: (style: ChartStyle) => void }) {
  return (
    <div className="flex gap-1">
      <Button variant={value === 'bar' ? 'secondary' : 'ghost'} size="sm" onClick={() => onChange('bar')}>
        Barras
      </Button>
      <Button variant={value === 'pie' ? 'secondary' : 'ghost'} size="sm" onClick={() => onChange('pie')}>
        Pizza
      </Button>
    </div>
  );
}

// Painel inicial após o login: área própria para os indicadores e gráficos
// gerais das pesquisas (contagens agregadas), separada da listagem/gestão de
// pesquisas em si (que fica em /surveys). Indicadores por pesquisa
// individual (KPIs "ao vivo", gráficos por período/pesquisador) continuam em
// /surveys/[id]/dashboard e /surveys/[id]/analytics.
export default function DashboardPage() {
  const { user, isLoading: isAuthLoading, apiFetch } = useAuth();
  const { toast } = useToast();
  const [surveys, setSurveys] = useState<SurveyRow[] | null>(null);
  const [locations, setLocations] = useState<LocationPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [statusChartStyle, setStatusChartStyle] = useState<ChartStyle>('bar');
  const [responsesChartStyle, setResponsesChartStyle] = useState<ChartStyle>('bar');
  const [topN, setTopN] = useState<TopN>(5);

  useEffect(() => {
    if (isAuthLoading || !user) return;

    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const [surveysRes, locationsRes] = await Promise.all([
          apiFetch('/surveys?limit=100'),
          apiFetch('/analytics/surveys/locations'),
        ]);
        const data = await surveysRes.json();
        if (!surveysRes.ok) throw new Error(extractApiErrorMessage(data, 'Falha ao carregar indicadores.'));
        if (!cancelled) setSurveys(data.data);

        if (locationsRes.ok) {
          const locationsData = await locationsRes.json();
          if (!cancelled) setLocations(locationsData.data);
        }
      } catch (err) {
        if (!cancelled) toast.error(getFriendlyErrorMessage(err, 'Falha ao carregar indicadores.'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, user, apiFetch]);

  const indicators = surveys ? computeIndicators(surveys) : null;

  const statusData = indicators
    ? [
        { status: 'Rascunho', total: indicators.draft },
        { status: 'Publicada', total: indicators.published },
        { status: 'Arquivada', total: indicators.archived },
      ]
    : [];

  const responsesBySurvey = surveys
    ? [...surveys]
        .sort((a, b) => b._count.responses - a._count.responses)
        .slice(0, topN)
        .map((s) => ({ title: s.title, label: truncateLabel(s.title), total: s._count.responses }))
    : [];

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="flex flex-1 flex-col gap-6 p-8">
        <div>
          <h1 className="text-2xl font-semibold">Painel</h1>
          {!isAuthLoading && (
            <p className="text-sm text-muted-foreground">
              Bem-vindo(a), {user?.name ?? '...'}. Perfil: {user?.role ?? '...'}.
            </p>
          )}
        </div>

        {isLoading || isAuthLoading ? (
          <p className="text-muted-foreground">Carregando indicadores...</p>
        ) : indicators ? (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xs font-normal text-muted-foreground">Total de pesquisas</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">{indicators.totalSurveys}</CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-xs font-normal text-muted-foreground">Publicadas</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">{indicators.published}</CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-xs font-normal text-muted-foreground">Rascunhos</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">{indicators.draft}</CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-xs font-normal text-muted-foreground">Arquivadas</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">{indicators.archived}</CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-xs font-normal text-muted-foreground">Total de respostas</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">{indicators.totalResponses}</CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Pesquisas por status</CardTitle>
                  <ChartStyleToggle value={statusChartStyle} onChange={setStatusChartStyle} />
                </CardHeader>
                <CardContent>
                  {indicators.totalSurveys === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma pesquisa cadastrada ainda.</p>
                  ) : (
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        {statusChartStyle === 'bar' ? (
                          <BarChart data={statusData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="status" fontSize={11} />
                            <YAxis fontSize={11} allowDecimals={false} />
                            <Tooltip />
                            <Bar dataKey="total" name="Pesquisas" fill="oklch(0.48 0.16 255)" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        ) : (
                          <PieChart>
                            <Tooltip />
                            <Pie
                              data={statusData}
                              dataKey="total"
                              nameKey="status"
                              cx="50%"
                              cy="50%"
                              outerRadius={90}
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PieLabelRenderProps do recharts não tipa os campos do dado original
                              label={(entry: any) => `${entry.status}: ${entry.total}`}
                            >
                              {statusData.map((entry, index) => (
                                <Cell key={entry.status} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                          </PieChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Respostas por pesquisa (top {topN})</CardTitle>
                  <div className="flex items-center gap-3">
                    <select
                      className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm"
                      value={topN}
                      onChange={(e) => setTopN(Number(e.target.value) as TopN)}
                    >
                      <option value={3}>Top 3</option>
                      <option value={5}>Top 5</option>
                      <option value={10}>Top 10</option>
                    </select>
                    <ChartStyleToggle value={responsesChartStyle} onChange={setResponsesChartStyle} />
                  </div>
                </CardHeader>
                <CardContent>
                  {responsesBySurvey.every((s) => s.total === 0) ? (
                    <p className="text-sm text-muted-foreground">Nenhuma resposta coletada ainda.</p>
                  ) : (
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        {responsesChartStyle === 'bar' ? (
                          <BarChart data={responsesBySurvey}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" fontSize={11} interval={0} angle={-20} textAnchor="end" height={50} />
                            <YAxis fontSize={11} allowDecimals={false} />
                            <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.title ?? ''} />
                            <Bar dataKey="total" name="Respostas" fill="oklch(0.55 0.13 155)" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        ) : (
                          <PieChart>
                            <Tooltip />
                            <Pie
                              data={responsesBySurvey}
                              dataKey="total"
                              nameKey="label"
                              cx="50%"
                              cy="50%"
                              outerRadius={90}
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PieLabelRenderProps do recharts não tipa os campos do dado original
                              label={(entry: any) => `${entry.label}: ${entry.total}`}
                            >
                              {responsesBySurvey.map((entry, index) => (
                                <Cell key={entry.title} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                          </PieChart>
                        )}
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
          </>
        ) : null}

        <p className="text-sm text-muted-foreground">
          Para ver detalhes, filtrar ou gerenciar pesquisas individuais, acesse{' '}
          <Link href="/surveys" className="underline hover:text-foreground">
            Pesquisas
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
