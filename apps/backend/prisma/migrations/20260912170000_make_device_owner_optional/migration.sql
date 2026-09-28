-- Permite excluir um pesquisador mesmo que ele já tenha usado dispositivos
-- para coletar respostas (ver UsersService.remove): antes, o device.deleteMany
-- prévio à exclusão do usuário falhava com FK violation em
-- responses_deviceId_fkey, pois Response.deviceId é obrigatório e não pode
-- ser apagado em cascata. Agora o device permanece, só perde o dono — mesmo
-- padrão já usado em audit_logs.userId e responses.researcherId.
ALTER TABLE "devices" ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "devices" DROP CONSTRAINT "devices_userId_fkey";
ALTER TABLE "devices" ADD CONSTRAINT "devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
