-- Metadados adicionais da pesquisa, editáveis apenas pelo Gestor/Administrador
-- no cabeçalho "Metadados" da Web: "type" (categoria livre, ex: "Censo") e
-- "questionStyle" (estilo predominante das perguntas, ex: "Likert"). Ambos
-- são propagados para o schema publicado (SurveyVersion.schema) consumido
-- pelo Mobile — ver SurveysService.publish.

ALTER TABLE "surveys" ADD COLUMN "type" TEXT;
ALTER TABLE "surveys" ADD COLUMN "questionStyle" TEXT;
