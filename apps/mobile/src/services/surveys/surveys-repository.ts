import { getDatabase } from '../../database';
import { apiFetch } from '../api/client';
import { SurveySchema } from './schema-types';

export interface LocalSurvey {
  id: string;
  title: string;
  description: string | null;
  status: string;
  currentVersion: number;
  startsAt: string | null;
  endsAt: string | null;
  downloadedAt: string;
  hasCachedVersion: boolean;
}

interface RemoteSurvey {
  id: string;
  title: string;
  description: string | null;
  status: string;
  currentVersion: number;
  startsAt: string | null;
  endsAt: string | null;
}

interface SurveyRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  current_version: number;
  starts_at: string | null;
  ends_at: string | null;
  downloaded_at: string;
}

// Baixa a lista de pesquisas atribuídas (o Backend já restringe PESQUISADOR a
// PUBLISHED + atribuídas — ver 2.4 na spec) e, para toda pesquisa cuja versão
// atual ainda não está em cache local, baixa e grava o schema completo do
// Contrato C1 no SQLite junto com o survey_version_id — crítico para o
// Contrato C3 (validação por versão de formulário na sincronização).
export async function syncSurveys(): Promise<LocalSurvey[]> {
  const db = await getDatabase();
  const response = await apiFetch('/surveys?limit=100');
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? 'Falha ao baixar pesquisas.');
  }

  const remoteSurveys: RemoteSurvey[] = data.data;
  const downloadedAt = new Date().toISOString();

  // O Backend só retorna PUBLISHED + atribuídas para PESQUISADOR — uma
  // pesquisa que caiu fora dessa lista (arquivada, desatribuída etc.) some
  // da resposta sem aviso explícito. Sem isto, o upsert abaixo nunca reage
  // a quem *saiu* da lista, e a pesquisa antiga fica presa como "Publicada"
  // no cache local para sempre. Marcamos como ARCHIVED localmente (não
  // apagamos a linha, para não perder a referência usada por
  // survey_versions/responses já coletadas) — listLocalSurveys() só mostra
  // PUBLISHED, então isso já basta para sumir de "Ver pesquisas".
  const remoteIds = remoteSurveys.map((survey) => survey.id);
  if (remoteIds.length > 0) {
    await db.runAsync(
      `UPDATE surveys SET status = 'ARCHIVED' WHERE id NOT IN (${remoteIds.map(() => '?').join(',')})`,
      remoteIds,
    );
  } else {
    await db.runAsync(`UPDATE surveys SET status = 'ARCHIVED'`);
  }

  for (const survey of remoteSurveys) {
    await db.runAsync(
      `INSERT INTO surveys (id, title, description, status, current_version, starts_at, ends_at, downloaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         description = excluded.description,
         status = excluded.status,
         current_version = excluded.current_version,
         starts_at = excluded.starts_at,
         ends_at = excluded.ends_at,
         downloaded_at = excluded.downloaded_at`,
      [
        survey.id,
        survey.title,
        survey.description,
        survey.status,
        survey.currentVersion,
        survey.startsAt,
        survey.endsAt,
        downloadedAt,
      ],
    );

    if (survey.currentVersion > 0) {
      await downloadVersionIfMissing(survey.id, survey.currentVersion, downloadedAt);
    }
  }

  return listLocalSurveys();
}

async function downloadVersionIfMissing(
  surveyId: string,
  version: number,
  downloadedAt: string,
): Promise<void> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM survey_versions WHERE survey_id = ? AND version = ?',
    [surveyId, version],
  );
  if (existing) return;

  const versionResponse = await apiFetch(`/surveys/${surveyId}/versions/${version}`);
  const versionData = await versionResponse.json();
  if (!versionResponse.ok) return;

  await db.runAsync(
    `INSERT INTO survey_versions (id, survey_id, version, schema_json, downloaded_at)
     VALUES (?, ?, ?, ?, ?)`,
    [versionData.versionId, surveyId, version, JSON.stringify(versionData), downloadedAt],
  );
}

// Lê o schema completo (Contrato C1) já em cache no SQLite para a versão
// atual de uma pesquisa — usado pelo FormRenderer, funciona 100% offline.
export async function getCachedSchema(
  surveyId: string,
  version: number,
): Promise<SurveySchema | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ schema_json: string }>(
    'SELECT schema_json FROM survey_versions WHERE survey_id = ? AND version = ?',
    [surveyId, version],
  );
  return row ? (JSON.parse(row.schema_json) as SurveySchema) : null;
}

// Mesma leitura, mas por survey_version_id (chave usada em `responses`) —
// usado na tela de detalhe de uma coleta já finalizada.
export async function getCachedSchemaByVersionId(
  surveyVersionId: string,
): Promise<SurveySchema | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ schema_json: string }>(
    'SELECT schema_json FROM survey_versions WHERE id = ?',
    [surveyVersionId],
  );
  return row ? (JSON.parse(row.schema_json) as SurveySchema) : null;
}

// Só pesquisas PUBLISHED — mesmo antes de rodar syncSurveys() de novo nesta
// sessão, o cache local não deve mostrar uma pesquisa arquivada/desatribuída
// (ver comentário sobre o UPDATE ... ARCHIVED em syncSurveys()).
export async function listLocalSurveys(): Promise<LocalSurvey[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SurveyRow>(
    "SELECT * FROM surveys WHERE status = 'PUBLISHED' ORDER BY title ASC",
  );

  const surveys: LocalSurvey[] = [];
  for (const row of rows) {
    const cached =
      row.current_version > 0
        ? await db.getFirstAsync<{ id: string }>(
            'SELECT id FROM survey_versions WHERE survey_id = ? AND version = ?',
            [row.id, row.current_version],
          )
        : null;

    surveys.push({
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      currentVersion: row.current_version,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      downloadedAt: row.downloaded_at,
      hasCachedVersion: !!cached,
    });
  }
  return surveys;
}
