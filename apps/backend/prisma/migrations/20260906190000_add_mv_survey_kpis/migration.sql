-- View materializada para KPIs do Dashboard (2.10).
-- Colunas em snake_case por convenção da própria spec; os campos de origem
-- em `responses` são camelCase (Prisma não usa @map em Response) — daí os
-- aliases explícitos abaixo. `syncedAt` faz o papel de "created_at" aqui,
-- já que Response não tem uma coluna de criação separada da de sincronização.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_survey_kpis AS
SELECT
  "surveyId"                                            AS survey_id,
  COUNT(*)                                               AS total_responses,
  COUNT(*) FILTER (WHERE status = 'SYNCED')              AS synced,
  COUNT(*) FILTER (WHERE status = 'CONFLICT')            AS conflicts,
  COUNT(*) FILTER (WHERE status = 'ERROR')               AS errors,
  MAX("syncedAt")                                        AS last_response_at
FROM responses
GROUP BY "surveyId";

-- Necessário para permitir REFRESH MATERIALIZED VIEW CONCURRENTLY (QueueService).
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_survey_kpis_survey_id
  ON mv_survey_kpis(survey_id);
