-- Usuário-raiz do bootstrap (seed): nunca pode ser desativado ou excluído
-- (ver UsersService.update/remove). audit_logs.userId já era ON DELETE
-- SET NULL desde a migração inicial (Prisma default para relação opcional)
-- — só tornado explícito no schema.prisma, sem alteração de DDL aqui.
ALTER TABLE "users" ADD COLUMN "isRootAdmin" BOOLEAN NOT NULL DEFAULT false;
