import { getDatabase } from '../../database';
import { generateUuid } from '../../utils/uuid';
import { computeLocationHash } from '../location/location';

interface FinalizeResponseInput {
  surveyId: string;
  surveyVersionId: string;
  researcherId: string;
  deviceId: string;
  answers: Record<string, unknown>;
  location: { latitude: number; longitude: number; accuracy: number | null } | null;
}

// Salva a resposta completa no SQLite com status PENDING ao finalizar —
// UUID gerado no device, timestamp da coleta (não da sincronização).
export async function finalizeResponse(input: FinalizeResponseInput): Promise<string> {
  const db = await getDatabase();
  const responseId = generateUuid();
  const now = new Date().toISOString();
  const locationHash = input.location
    ? computeLocationHash(input.location.latitude, input.location.longitude)
    : null;

  await db.runAsync(
    `INSERT INTO responses (
       id, survey_id, survey_version_id, researcher_id, device_id,
       answers_json, location_hash, latitude, longitude, accuracy,
       collected_at, status, sync_attempts
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0)`,
    [
      responseId,
      input.surveyId,
      input.surveyVersionId,
      input.researcherId,
      input.deviceId,
      JSON.stringify(input.answers),
      locationHash,
      input.location?.latitude ?? null,
      input.location?.longitude ?? null,
      input.location?.accuracy ?? null,
      now,
    ],
  );

  return responseId;
}

export interface LocalResponse {
  id: string;
  surveyId: string;
  surveyTitle: string;
  status: string;
  collectedAt: string;
  syncedAt: string | null;
  lastError: string | null;
}

interface ResponseRow {
  id: string;
  survey_id: string;
  survey_title: string | null;
  status: string;
  collected_at: string;
  synced_at: string | null;
  last_error: string | null;
}

// LEFT JOIN com `surveys` só para exibir o título nas telas (ex: "Minhas
// coletas" agrupada por pesquisa) — uma pesquisa pode ter sido removida do
// cache local sem apagar as respostas já coletadas, daí o `??` de fallback.
export async function listLocalResponses(): Promise<LocalResponse[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ResponseRow>(
    `SELECT r.id, r.survey_id, s.title as survey_title, r.status, r.collected_at, r.synced_at, r.last_error
     FROM responses r
     LEFT JOIN surveys s ON s.id = r.survey_id
     ORDER BY r.collected_at DESC`,
  );
  return rows.map((row) => ({
    id: row.id,
    surveyId: row.survey_id,
    surveyTitle: row.survey_title ?? 'Pesquisa removida',
    status: row.status,
    collectedAt: row.collected_at,
    syncedAt: row.synced_at,
    lastError: row.last_error,
  }));
}

export interface LocalResponseDetail extends LocalResponse {
  surveyVersionId: string;
  respondentId: string | null;
  answers: Record<string, unknown>;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  syncAttempts: number;
}

interface ResponseDetailRow extends ResponseRow {
  survey_version_id: string;
  respondent_id: string | null;
  answers_json: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  sync_attempts: number;
}

// Tela de detalhe de uma coleta local já finalizada — funciona 100% offline,
// lê só o SQLite (a resposta pode nem ter sido sincronizada ainda).
export async function getLocalResponseDetail(id: string): Promise<LocalResponseDetail | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ResponseDetailRow>(
    `SELECT r.id, r.survey_id, s.title as survey_title, r.survey_version_id, r.respondent_id,
            r.status, r.answers_json, r.latitude, r.longitude, r.accuracy, r.collected_at,
            r.synced_at, r.sync_attempts, r.last_error
     FROM responses r
     LEFT JOIN surveys s ON s.id = r.survey_id
     WHERE r.id = ?`,
    [id],
  );
  if (!row) return null;

  return {
    id: row.id,
    surveyId: row.survey_id,
    surveyTitle: row.survey_title ?? 'Pesquisa removida',
    surveyVersionId: row.survey_version_id,
    respondentId: row.respondent_id,
    status: row.status,
    answers: JSON.parse(row.answers_json),
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy,
    collectedAt: row.collected_at,
    syncedAt: row.synced_at,
    syncAttempts: row.sync_attempts,
    lastError: row.last_error,
  };
}
