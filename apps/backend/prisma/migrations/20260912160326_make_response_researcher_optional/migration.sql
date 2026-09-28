-- Permite excluir um pesquisador mesmo com respostas já coletadas por ele
-- (ver UsersService.remove): a pesquisa e as respostas permanecem intactas,
-- só perdem a referência ao autor. Mesmo padrão já usado em
-- audit_logs.userId (ON DELETE SET NULL).
ALTER TABLE "responses" ALTER COLUMN "researcherId" DROP NOT NULL;

ALTER TABLE "responses" DROP CONSTRAINT "responses_researcherId_fkey";
ALTER TABLE "responses" ADD CONSTRAINT "responses_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
