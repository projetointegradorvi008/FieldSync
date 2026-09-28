-- Remove a funcionalidade de "pergunta de cabeçalho" (respondida uma vez,
-- vale para toda a pesquisa) — ver comentário removido do model Survey em
-- schema.prisma. Reverte a migração 20260909010000_add_survey_header_answers.

ALTER TABLE "survey_header_answers" DROP CONSTRAINT "survey_header_answers_surveyId_fkey";
ALTER TABLE "survey_header_answers" DROP CONSTRAINT "survey_header_answers_researcherId_fkey";

DROP TABLE "survey_header_answers";

ALTER TABLE "questions" DROP COLUMN "isHeader";
