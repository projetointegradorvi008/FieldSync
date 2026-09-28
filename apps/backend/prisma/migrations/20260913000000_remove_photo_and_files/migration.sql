-- Remove completamente a captura/armazenamento de fotos do produto: o tipo
-- de pergunta PHOTO deixa de existir e a tabela de arquivos (usada só para
-- guardar as fotos enviadas) é apagada. GPS/localização não é afetado — só
-- fotos.

-- Dev data cleanup: perguntas PHOTO já publicadas (e respectivas options,
-- que nem se aplicam a esse tipo, e answers, que também não se aplicam —
-- fotos nunca viravam Answer) precisam sumir antes de remover o valor do
-- enum, senão a conversão abaixo falha com uma linha que não cabe no novo
-- tipo.
DELETE FROM "question_options" WHERE "questionId" IN (SELECT id FROM "questions" WHERE "type" = 'PHOTO');
DELETE FROM "answers" WHERE "questionId" IN (SELECT id FROM "questions" WHERE "type" = 'PHOTO');
DELETE FROM "questions" WHERE "type" = 'PHOTO';

-- Postgres não suporta remover um valor de enum diretamente — recria o tipo
-- sem PHOTO e migra a coluna.
ALTER TYPE "QuestionType" RENAME TO "QuestionType_old";
CREATE TYPE "QuestionType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DATE', 'TIME', 'GPS');
ALTER TABLE "questions" ALTER COLUMN "type" TYPE "QuestionType" USING ("type"::text::"QuestionType");
DROP TYPE "QuestionType_old";

-- Tabela de arquivos — não é mais usada por nenhuma feature.
DROP TABLE IF EXISTS "files";
DROP TYPE IF EXISTS "FileStatus";
