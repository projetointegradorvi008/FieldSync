-- Denormaliza section.isHeader em Question — permite ao Detalhe da Resposta
-- separar "Cabeçalho" das perguntas de campo sem reparsear o schema JSON.
ALTER TABLE "questions" ADD COLUMN "isHeader" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: versões já publicadas antes desta coluna existir guardam a seção
-- isHeader dentro do JSONB `schema` — sem isto, respostas já coletadas
-- perderiam a separação Cabeçalho/Respostas no Detalhe da Resposta.
UPDATE "questions" q
SET "isHeader" = true
FROM "survey_versions" sv,
     jsonb_array_elements(sv."schema" -> 'sections') AS section
WHERE q."surveyVersionId" = sv."id"
  AND (section ->> 'isHeader')::boolean IS TRUE
  AND q."sectionId" = section ->> 'id';
