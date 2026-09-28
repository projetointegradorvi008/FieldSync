-- Cabeçalho da pesquisa: perguntas respondidas UMA VEZ por pesquisador
-- (não por resposta) — ver comentário do model SurveyHeaderAnswer no
-- schema.prisma. Indexado por externalId (não por questionId) porque
-- republicar a pesquisa gera Question rows novas a cada versão.

ALTER TABLE "questions" ADD COLUMN "isHeader" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "survey_header_answers" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "surveyId" UUID NOT NULL,
    "researcherId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "survey_header_answers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "survey_header_answers_surveyId_researcherId_externalId_key"
  ON "survey_header_answers"("surveyId", "researcherId", "externalId");

CREATE INDEX "survey_header_answers_surveyId_researcherId_idx"
  ON "survey_header_answers"("surveyId", "researcherId");

ALTER TABLE "survey_header_answers" ADD CONSTRAINT "survey_header_answers_surveyId_fkey"
  FOREIGN KEY ("surveyId") REFERENCES "surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CASCADE (não RESTRICT): cabeçalho é dado de contexto de trabalho do
-- próprio pesquisador, não dado de pesquisa coletado — excluir a conta não
-- deve ficar bloqueado por isso (ver UsersService.remove).
ALTER TABLE "survey_header_answers" ADD CONSTRAINT "survey_header_answers_researcherId_fkey"
  FOREIGN KEY ("researcherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
