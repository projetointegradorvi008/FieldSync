import { getDatabase } from '../../database';
import { generateUuid } from '../../utils/uuid';

// Cabeçalhos salvos explicitamente pelo pesquisador (botão "Salvar
// cabeçalho") — ver saved_headers no schema. Existem para reaproveitar um
// cabeçalho já digitado (ex: mesmo ponto de coleta) em coletas futuras da
// mesma pesquisa, sem depender do rascunho de uma resposta específica.
export interface SavedHeader {
  id: string;
  surveyId: string;
  label: string;
  answers: Record<string, unknown>;
  savedAt: string;
}

interface SavedHeaderRow {
  id: string;
  survey_id: string;
  label: string;
  answers_json: string;
  saved_at: string;
}

function fromRow(row: SavedHeaderRow): SavedHeader {
  return {
    id: row.id,
    surveyId: row.survey_id,
    label: row.label,
    answers: JSON.parse(row.answers_json),
    savedAt: row.saved_at,
  };
}

export async function listSavedHeaders(surveyId: string): Promise<SavedHeader[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SavedHeaderRow>(
    'SELECT * FROM saved_headers WHERE survey_id = ? ORDER BY saved_at DESC',
    [surveyId],
  );
  return rows.map(fromRow);
}

export async function saveHeader(
  surveyId: string,
  label: string,
  answers: Record<string, unknown>,
): Promise<SavedHeader> {
  const db = await getDatabase();
  const id = generateUuid();
  const savedAt = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO saved_headers (id, survey_id, label, answers_json, saved_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, surveyId, label, JSON.stringify(answers), savedAt],
  );
  return { id, surveyId, label, answers, savedAt };
}

export async function deleteSavedHeader(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM saved_headers WHERE id = ?', [id]);
}
