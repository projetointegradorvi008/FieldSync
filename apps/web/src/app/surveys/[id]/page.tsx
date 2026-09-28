'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts/toast-context';
import { NavBar } from '@/components/nav-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SurveyBuilder } from '@/components/survey-builder/survey-builder';
import { SectionDraft, schemaToSections, sectionsToSchema } from '@/components/survey-builder/types';
import { extractApiErrorMessage, getFriendlyErrorMessage } from '@/lib/error-message';

interface SurveyDetail {
  id: string;
  title: string;
  description: string | null;
  type: string | null;
  questionStyle: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  currentVersion: number;
  startsAt: string | null;
  endsAt: string | null;
  createdBy: { id: string; name: string };
  totalResponses: number;
  conflictResponses: number;
}

interface SurveyVersionRow {
  id: string;
  version: number;
  publishedAt: string;
  publishedBy: string;
  responseCount: number;
  isActive: boolean;
}

const MANAGER_ROLES = ['ADMINISTRADOR', 'GESTOR'];

const STATUS_LABEL: Record<SurveyDetail['status'], string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicada',
  ARCHIVED: 'Arquivada',
};

// Detalhe de uma pesquisa: metadados/pesquisadores editáveis (só em DRAFT),
// o construtor de formulário (SurveyBuilder) e a publicação de novas
// versões, mais o histórico de versões já publicadas.
export default function SurveyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user, apiFetch } = useAuth();
  const { toast } = useToast();
  const isManager = !!user && MANAGER_ROLES.includes(user.role);

  const [survey, setSurvey] = useState<SurveyDetail | null>(null);
  const [versions, setVersions] = useState<SurveyVersionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSavingMeta, setIsSavingMeta] = useState(false);

  const [initialSections, setInitialSections] = useState<SectionDraft[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);

  const [isMutatingVersion, setIsMutatingVersion] = useState<number | null>(null);

  async function loadAll() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [surveyResponse, versionsResponse] = await Promise.all([
        apiFetch(`/surveys/${id}`),
        apiFetch(`/surveys/${id}/versions`),
      ]);
      const surveyData = await surveyResponse.json();
      if (!surveyResponse.ok) throw new Error(extractApiErrorMessage(surveyData, 'Não foi possível carregar a pesquisa.'));
      const versionsData = await versionsResponse.json();
      if (!versionsResponse.ok) throw new Error(extractApiErrorMessage(versionsData, 'Não foi possível carregar as versões.'));

      setSurvey(surveyData);
      setVersions(versionsData);
      setTitle(surveyData.title);
      setDescription(surveyData.description ?? '');

      if (surveyData.currentVersion > 0) {
        const versionResponse = await apiFetch(
          `/surveys/${id}/versions/${surveyData.currentVersion}`,
        );
        const versionData = await versionResponse.json();
        setInitialSections(versionResponse.ok ? schemaToSections(versionData) : []);
      } else {
        setInitialSections([]);
      }
    } catch (err) {
      const message = getFriendlyErrorMessage(err, 'Não foi possível carregar a pesquisa.');
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca inicial ao montar
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSaveMeta(event: React.FormEvent) {
    event.preventDefault();
    setIsSavingMeta(true);
    try {
      // Título e descrição são editáveis em qualquer status (ver
      // SurveysService.update) — só datas exigem DRAFT.
      const response = await apiFetch(`/surveys/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          description: description || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(extractApiErrorMessage(data, 'Não foi possível salvar as alterações.'));
      toast.success('Alterações salvas.');
      await loadAll();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Não foi possível salvar as alterações.'));
    } finally {
      setIsSavingMeta(false);
    }
  }

  async function handleActivateVersion(version: number) {
    setIsMutatingVersion(version);
    try {
      const response = await apiFetch(`/surveys/${id}/versions/${version}/activate`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(extractApiErrorMessage(data, 'Não foi possível ativar esta versão.'));
      toast.success(`Versão ${version} ativada — é essa que o Mobile passa a usar.`);
      await loadAll();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Não foi possível ativar esta versão.'));
    } finally {
      setIsMutatingVersion(null);
    }
  }

  async function handleDeleteVersion(version: number) {
    if (!window.confirm(`Excluir a versão ${version}? Essa ação não pode ser desfeita.`)) return;
    setIsMutatingVersion(version);
    try {
      const response = await apiFetch(`/surveys/${id}/versions/${version}`, {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(extractApiErrorMessage(data, 'Não foi possível excluir esta versão.'));
      toast.success(`Versão ${version} excluída.`);
      await loadAll();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Não foi possível excluir esta versão.'));
    } finally {
      setIsMutatingVersion(null);
    }
  }

  async function handlePublish(schema: ReturnType<typeof sectionsToSchema>) {
    setIsPublishing(true);
    try {
      const response = await apiFetch(`/surveys/${id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ schema }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(extractApiErrorMessage(data, 'Não foi possível publicar a pesquisa.'));
      toast.success(`Pesquisa publicada — versão ${data.version}.`);
      await loadAll();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Não foi possível publicar a pesquisa.'));
    } finally {
      setIsPublishing(false);
    }
  }

  if (isLoading || !survey) {
    return (
      <div className="flex flex-1 flex-col">
        <NavBar />
        <main className="flex flex-1 flex-col gap-2 p-8">
          {loadError ? (
            <p className="text-sm text-destructive">Não foi possível carregar esta pesquisa.</p>
          ) : (
            <p className="text-muted-foreground">Carregando...</p>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="flex flex-1 flex-col gap-6 p-8">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/surveys" className="text-sm text-muted-foreground hover:underline">
              ← Pesquisas
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">{survey.title}</h1>
              <Badge>{STATUS_LABEL[survey.status]}</Badge>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Indicadores</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-6 text-sm">
            <span>Versão atual: {survey.currentVersion}</span>
            <span>Total de respostas: {survey.totalResponses}</span>
            <span>Respostas em conflito: {survey.conflictResponses}</span>
            <span>Criada por: {survey.createdBy.name}</span>
            <Link href={`/surveys/${survey.id}/dashboard`}>
              <Button variant="outline" size="sm">
                Dashboard
              </Button>
            </Link>
            <Link href={`/surveys/${survey.id}/analytics`}>
              <Button variant="outline" size="sm">
                Analytics
              </Button>
            </Link>
            <Link href={`/surveys/${survey.id}/responses`}>
              <Button variant="outline" size="sm">
                Painel operacional
              </Button>
            </Link>
          </CardContent>
        </Card>

        {isManager && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Metadados</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleSaveMeta}>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="title">Título</Label>
                  <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="description">Descrição</Label>
                  <Input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={isSavingMeta}>
                    {isSavingMeta ? 'Salvando...' : 'Salvar alterações'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}


        {isManager && survey.status !== 'ARCHIVED' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Construtor de pesquisa</CardTitle>
            </CardHeader>
            <CardContent>
              <SurveyBuilder
                key={`builder-${survey.currentVersion}`}
                initialSections={initialSections}
                isPublishing={isPublishing}
                onPublish={handlePublish}
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Versões publicadas</CardTitle>
          </CardHeader>
          <CardContent>
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma versão publicada ainda.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {versions.map((version) => (
                  <li
                    key={version.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                  >
                    <div className="flex flex-col">
                      <span className="flex items-center gap-2">
                        Versão {version.version}
                        {version.isActive && <Badge>Ativa</Badge>}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        publicada em {new Date(version.publishedAt).toLocaleString('pt-BR')} ·{' '}
                        {version.responseCount} resposta(s) coletada(s)
                      </span>
                    </div>
                    {isManager && (
                      <div className="flex items-center gap-2">
                        {!version.isActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isMutatingVersion === version.version}
                            onClick={() => handleActivateVersion(version.version)}
                          >
                            {isMutatingVersion === version.version ? 'Ativando...' : 'Ativar no Mobile'}
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={
                            version.isActive ||
                            version.responseCount > 0 ||
                            isMutatingVersion === version.version
                          }
                          title={
                            version.isActive
                              ? 'Ative outra versão antes de excluir esta.'
                              : version.responseCount > 0
                                ? 'Só é possível excluir versões sem respostas coletadas.'
                                : undefined
                          }
                          onClick={() => handleDeleteVersion(version.version)}
                        >
                          {isMutatingVersion === version.version ? 'Excluindo...' : 'Excluir'}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
