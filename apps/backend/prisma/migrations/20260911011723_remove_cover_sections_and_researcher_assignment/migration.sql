-- Remove atribuição de pesquisador por pesquisa (não usada mais — todo
-- PESQUISADOR da organização enxerga qualquer pesquisa PUBLISHED) e o campo
-- coverSections (o antigo card "Cabeçalho" de blocos só-texto é substituído
-- por uma seção real de perguntas, marcada como cabeçalho no schema
-- versionado da pesquisa — ver survey-schema.validator.ts).

-- DropForeignKey
ALTER TABLE "_SurveyResearchers" DROP CONSTRAINT "_SurveyResearchers_A_fkey";

-- DropForeignKey
ALTER TABLE "_SurveyResearchers" DROP CONSTRAINT "_SurveyResearchers_B_fkey";

-- DropTable
DROP TABLE "_SurveyResearchers";

-- AlterTable
ALTER TABLE "surveys" DROP COLUMN "coverSections";
