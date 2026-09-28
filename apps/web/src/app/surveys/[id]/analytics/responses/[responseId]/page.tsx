'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts/toast-context';
import { NavBar } from '@/components/nav-bar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { extractApiErrorMessage, getFriendlyErrorMessage } from '@/lib/error-message';

type QuestionType =
  | 'TEXT'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'SINGLE_CHOICE'
  | 'MULTIPLE_CHOICE'
  | 'DATE'
  | 'TIME'
  | 'GPS';

interface ResponseDetail {
  id: string;
  respondentId: string | null;
  status: 'SYNCED' | 'CONFLICT' | 'ERROR';
  collectedAt: string;
  syncedAt: string;
  researcher: { id: string; name: string } | null;
  location: { latitude: number; longitude: number; accuracy: number | null } | null;
  answers: {
    value: unknown;
    question: { externalId: string; label: string; type: QuestionType; isHeader: boolean };
  }[];
}

const STATUS_BADGE_VARIANT: Record<ResponseDetail['status'], 'success' | 'conflict' | 'destructive'> = {
  SYNCED: 'success',
  CONFLICT: 'conflict',
  ERROR: 'destructive',
};

const STATUS_LABEL: Record<ResponseDetail['status'], string> = {
  SYNCED: 'Sincronizada',
  CONFLICT: 'Em conflito',
  ERROR: 'Com erro',
};

function formatValue(value: unknown, type: QuestionType): string {
  if (value === null || value === undefined) return '—';
  if (type === 'BOOLEAN') return value === true || value === 'true' ? 'Sim' : 'Não';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Detalhe completo de uma resposta específica: todas as respostas por
// pergunta e localização.
export default function ResponseDetailPage({
  params,
}: {
  params: Promise<{ id: string; responseId: string }>;
}) {
  const { id, responseId } = use(params);
  const { apiFetch } = useAuth();
  const { toast } = useToast();

  const [response, setResponse] = useState<ResponseDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const res = await apiFetch(`/analytics/surveys/${id}/responses/${responseId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(extractApiErrorMessage(data, 'Falha ao carregar resposta.'));
        setResponse(data.data);
      } catch (err) {
        toast.error(getFriendlyErrorMessage(err, 'Falha ao carregar resposta.'));
      } finally {
        setIsLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, responseId]);

  const headerAnswers = response?.answers.filter((a) => a.question.isHeader) ?? [];
  const fieldAnswers = response?.answers.filter((a) => !a.question.isHeader) ?? [];

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="flex flex-1 flex-col gap-6 p-8">
        <div>
          <Link href={`/surveys/${id}/analytics`} className="text-sm text-muted-foreground hover:underline">
            ← Analytics
          </Link>
          <h1 className="text-2xl font-semibold">Detalhe da resposta</h1>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : response ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resumo</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-6 text-sm">
                <span>
                  <Badge variant={STATUS_BADGE_VARIANT[response.status]}>
                    {STATUS_LABEL[response.status]}
                  </Badge>
                </span>
                <span>Pesquisador: {response.researcher?.name ?? 'Removido'}</span>
                <span>Coletado em: {new Date(response.collectedAt).toLocaleString('pt-BR')}</span>
                <span>Sincronizado em: {new Date(response.syncedAt).toLocaleString('pt-BR')}</span>
                {response.respondentId && <span>Entrevistado: {response.respondentId}</span>}
                {response.location && (
                  <span>
                    Localização: {response.location.latitude.toFixed(5)}, {response.location.longitude.toFixed(5)}
                    {response.location.accuracy != null && ` (±${response.location.accuracy}m)`}
                  </span>
                )}
              </CardContent>
            </Card>

            {headerAnswers.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Cabeçalho</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {headerAnswers.map((answer) => (
                    <div key={answer.question.externalId} className="flex justify-between gap-4 border-b pb-2 text-sm last:border-0">
                      <span className="text-muted-foreground">{answer.question.label}</span>
                      <span className="text-right">{formatValue(answer.value, answer.question.type)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Respostas</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {fieldAnswers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma resposta de campo.</p>
                ) : (
                  fieldAnswers.map((answer) => (
                    <div key={answer.question.externalId} className="flex justify-between gap-4 border-b pb-2 text-sm last:border-0">
                      <span className="text-muted-foreground">{answer.question.label}</span>
                      <span className="text-right">{formatValue(answer.value, answer.question.type)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <p className="text-muted-foreground">Resposta não encontrada.</p>
        )}
      </main>
    </div>
  );
}
