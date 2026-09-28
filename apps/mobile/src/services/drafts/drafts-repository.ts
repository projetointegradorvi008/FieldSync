import { getDatabase } from '../../database';
import { generateUuid } from '../../utils/uuid';

// Rascunhos de formulário em andamento, persistidos na tabela `drafts` do
// SQLite local — para não perder uma coleta se o app fechar no meio.
export interface Draft {
  id: string;
  surveyId: string;
  surveyVersionId: string;
  answers: Record<string, unknown>;
  startedAt: string;
  updatedAt: string;
}

interface DraftRow {
  id: string;
  survey_id: string;
  survey_version_id: string;
  answers_json: string;
  started_at: string;
  updated_at: string;
}

function fromRow(row: DraftRow): Draft {
  return {
    id: row.id,
    surveyId: row.survey_id,
    surveyVersionId: row.survey_version_id,
    answers: JSON.parse(row.answers_json),
    startedAt: row.started_at,
    updatedAt: row.updated_at,
  };
}

// Um rascunho por combinação (survey_id, survey_version_id) — reabrir a
// mesma pesquisa na mesma versão restaura as respostas já preenchidas. Se o
// gestor publicar uma nova versão, uma nova versão implica um rascunho novo
// (evita misturar respostas de schemas diferentes — ver Contrato C3).
export async function getOrCreateDraft(surveyId: string, surveyVersionId: string): Promise<Draft> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<DraftRow>(
    'SELECT * FROM drafts WHERE survey_id = ? AND survey_version_id = ?',
    [surveyId, surveyVersionId],
  );
  if (existing) return fromRow(existing);

  const id = generateUuid();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO drafts (id, survey_id, survey_version_id, answers_json, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, surveyId, surveyVersionId, '{}', now, now],
  );
  return { id, surveyId, surveyVersionId, answers: {}, startedAt: now, updatedAt: now };
}

export async function saveDraftAnswers(
  draftId: string,
  answers: Record<string, unknown>,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE drafts SET answers_json = ?, updated_at = ? WHERE id = ?', [
    JSON.stringify(answers),
    new Date().toISOString(),
    draftId,
  ]);
}

export async function deleteDraft(draftId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM drafts WHERE id = ?', [draftId]);
}
