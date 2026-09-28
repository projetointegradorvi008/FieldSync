'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { extractApiErrorMessage, getFriendlyErrorMessage } from '@/lib/error-message';

const POLL_INTERVAL_MS = 30_000;
const MAX_SNAPSHOTS = 20;

interface Kpis {
  surveyId: string;
  totalResponses: number;
  synced: number;
  conflicts: number;
  errors: number;
  activeResearchers: number;
  completionRate: number;
  lastResponseAt: string | null;
  updatedAt: string | null;
}

interface Snapshot {
  time: string;
  total: number;
  synced: number;
  conflicts: number;
}

// Dashboard "ao vivo" de uma pesquisa: consulta os KPIs (via view
// materializada) a cada 30s, além de um botão para atualizar na hora sem
// esperar o próximo ciclo. A série temporal do gráfico é formada pelas
// próprias leituras desta sessão do navegador — não é histórico real (isso é
// o Analytics completo, by-period). A gestão de conflitos em si vive no
// Painel Operacional (/surveys/[id]/responses), não duplicada aqui.
export default function SurveyDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { apiFetch } = useAuth();
  const { toast } = useToast();

  const [surveyTitle, setSurveyTitle] = useState<string | null>(null);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const surveyLoaded = useRef(false);

  async function poll() {
    try {
      if (!surveyLoaded.current) {
        const surveyResponse = await apiFetch(`/surveys/${id}`);
        const surveyData = await surveyResponse.json();
        if (surveyResponse.ok) setSurveyTitle(surveyData.title);
        surveyLoaded.current = true;
      }

      const kpisResponse = await apiFetch(`/analytics/surveys/${id}/kpis`);
      const kpisData = await kpisResponse.json();
      if (!kpisResponse.ok) throw new Error(extractApiErrorMessage(kpisData, 'Falha ao carregar KPIs.'));

      setKpis(kpisData.data);

      setSnapshots((prev) => {
        const next = [
          ...prev,
          {
            time: new Date().toLocaleTimeString('pt-BR'),
            total: kpisData.data.totalResponses,
            synced: kpisData.data.synced,
            conflicts: kpisData.data.conflicts,
          },
        ];
        return next.slice(-MAX_SNAPSHOTS);
      });
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Falha ao carregar o Dashboard.'));
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- primeira busca ao montar
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleManualRefresh() {
    setIsRefreshing(true);
    try {
      await poll();
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="flex flex-1 flex-col gap-6 p-8">
        <div>
          <Link href={`/surveys/${id}`} className="text-sm text-muted-foreground hover:underline">
            ← {surveyTitle ?? 'Pesquisa'}
          </Link>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
        </div>

        {kpis && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-normal text-muted-foreground">Total de respostas</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{kpis.totalResponses}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-normal text-muted-foreground">Sincronizadas</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{kpis.synced}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-normal text-muted-foreground">Em conflito</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{kpis.conflicts}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-normal text-muted-foreground">Com erro</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{kpis.errors}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-normal text-muted-foreground">Pesquisadores ativos</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{kpis.activeResearchers}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-normal text-muted-foreground">Taxa de conclusão</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {(kpis.completionRate * 100).toFixed(0)}%
              </CardContent>
            </Card>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          KPIs consultados ao vivo (instantâneos, mesma fonte do Analytics e do painel operacional), reconsultados a
          cada 30s.
        </p>
        {kpis?.lastResponseAt && (
          <p className="text-xs text-muted-foreground">
            Última resposta recebida em: {new Date(kpis.lastResponseAt).toLocaleString('pt-BR')}
          </p>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Série temporal (sessão atual)</CardTitle>
            <Button variant="outline" size="sm" disabled={isRefreshing} onClick={handleManualRefresh}>
              {isRefreshing ? 'Atualizando...' : 'Atualizar agora'}
            </Button>
          </CardHeader>
          <CardContent>
            {snapshots.length < 2 ? (
              <p className="text-sm text-muted-foreground">
                Aguardando mais leituras para desenhar o gráfico...
              </p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={snapshots}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" fontSize={11} />
                    <YAxis fontSize={11} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="total" name="Total" stroke="oklch(0.48 0.16 255)" dot={false} />
                    <Line type="monotone" dataKey="synced" name="Sincronizadas" stroke="#15803d" dot={false} />
                    <Line type="monotone" dataKey="conflicts" name="Conflitos" stroke="#7c3aed" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
