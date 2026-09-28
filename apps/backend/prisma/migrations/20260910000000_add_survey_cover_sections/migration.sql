-- Capa/introdução da pesquisa: lista ordenada de blocos { id, title,
-- description } editados na Web (card "Cabeçalho" em /surveys/:id), exibida
-- no topo do formulário — conteúdo informativo, sem input do pesquisador.
-- Não confundir com as "perguntas de cabeçalho" (Question.header), que
-- continuam guardadas em SurveyHeaderAnswer e não são afetadas por esta
-- coluna.

ALTER TABLE "surveys" ADD COLUMN "coverSections" JSONB NOT NULL DEFAULT '[]';
