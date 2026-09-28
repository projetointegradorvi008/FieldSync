'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts/toast-context';
import { NavBar } from '@/components/nav-bar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { extractApiErrorMessage, getFriendlyErrorMessage } from '@/lib/error-message';

interface ResponseDetail {
  id: string;
  status: string;
  collectedAt: string;
  syncedAt: string;
  researcher: { id: string; name: string } | null;
  survey: { id: string; title: string };
  locationHash: string | null;
  location: { latitude: number; longitude: number; accuracy: number | null } | null;
  answers: { value: unknown; question: { externalId: string; label: string } }[];
}

interface ConflictDetail {
  id: string;
  status: 'PENDING' | 'RESOLVED';
  resolution: 'KEEP_FIRST' | 'KEEP_SECOND' | 'DISCARD_BOTH' | null;
  resolvedById: string | null;
  resolvedAt: string | null;
  detectedAt: string;
  response: ResponseDetail;
  conflictWith: ResponseDetail;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function ResponseCard({ title, response }: { title: string; response: ResponseDetail }) {
  return (
    <Card className="flex-1">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <span>
            <span className="text-muted-foreground">Pesquisador: </span>
            {response.researcher?.name ?? 'Pesquisador removido'}
          </span>
          <span>
            <span className="text-muted-foreground">Coletado em: </span>
            {new Date(response.collectedAt).toLocaleString('pt-BR')}
          </span>
          {response.location && (
            <span>
              <span className="text-muted-foreground">Localização: </span>
              {response.location.latitude.toFixed(5)}, {response.location.longitude.toFixed(5)}
              {response.location.accuracy != null && ` (±${response.location.accuracy}m)`}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1 border-t pt-3">
          {response.answers.map((answer) => (
            <div key={answer.question.externalId} className="flex justify-between gap-4">
              <span className="text-muted-foreground">{answer.question.label}</span>
              <span className="text-right">{formatValue(answer.value)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Tela de resolução de um conflito: mostra as duas respostas em disputa
// lado a lado (ResponseCard) e permite escolher qual manter, ou descartar
// ambas (com confirmação, por ser irreversível pela interface).
export default function ConflictDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { apiFetch } = useAuth();
  const { toast } = useToast();

  const [conflict, setConflict] = useState<ConflictDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResolving, setIsResolving] = useState(false);

  async function load() {
    setIsLoading(true);
    try {
      const response = await apiFetch(`/conflicts/${id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(extractApiErrorMessage(data, 'Falha ao carregar conflito.'));
      setConflict(data);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Falha ao carregar conflito.'));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca inicial ao montar
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function resolve(action: 'KEEP_FIRST' | 'KEEP_SECOND' | 'DISCARD_BOTH') {
    if (action === 'DISCARD_BOTH' && !window.confirm('Descartar as duas respostas? Esta decisão fica registrada e não pode ser desfeita pela interface.')) {
      return;
    }
    setIsResolving(true);
    try {
      const response = await apiFetch(`/conflicts/${id}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(extractApiErrorMessage(data, 'Falha ao resolver conflito.'));
      toast.success('Conflito resolvido.');
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Falha ao resolver conflito.'));
    } finally {
      setIsResolving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="flex flex-1 flex-col gap-6 p-8">
        <div>
          <Link
            href={conflict ? `/surveys/${conflict.response.survey.id}/dashboard` : '/conflicts'}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {conflict ? conflict.response.survey.title : 'Conflitos'}
          </Link>
          <h1 className="text-2xl font-semibold">Detalhe do conflito</h1>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : conflict ? (
          <>
            <div className="flex items-center gap-3">
              <Badge variant={conflict.status === 'PENDING' ? 'warning' : 'success'}>
                {conflict.status === 'PENDING' ? 'Pendente' : 'Resolvido'}
              </Badge>
              {conflict.status === 'RESOLVED' && (
                <span className="text-sm text-muted-foreground">
                  Resolução: {conflict.resolution} em{' '}
                  {conflict.resolvedAt && new Date(conflict.resolvedAt).toLocaleString('pt-BR')}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-4 lg:flex-row">
              <ResponseCard title="Resposta 1 (já sincronizada)" response={conflict.conflictWith} />
              <ResponseCard title="Resposta 2 (em conflito)" response={conflict.response} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resolução</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                  As duas respostas permanecem no banco para consulta futura, mesmo depois de resolvido — a
                  resolução apenas registra a decisão do gestor de forma auditável.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isResolving || conflict.status === 'RESOLVED'}
                    onClick={() => resolve('KEEP_FIRST')}
                  >
                    Manter Resposta 1
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isResolving || conflict.status === 'RESOLVED'}
                    onClick={() => resolve('KEEP_SECOND')}
                  >
                    Manter Resposta 2
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isResolving || conflict.status === 'RESOLVED'}
                    onClick={() => resolve('DISCARD_BOTH')}
                  >
                    Descartar ambas
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <p className="text-muted-foreground">Conflito não encontrado.</p>
        )}
      </main>
    </div>
  );
}
