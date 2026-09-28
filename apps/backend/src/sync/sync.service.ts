import { Injectable } from '@nestjs/common';
import { Device, Prisma, UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/jwt-payload';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { SyncRequestDto, SyncResponseItemDto } from './dto/sync-request.dto';

const MAX_CLOCK_SKEW_FUTURE_MS = 24 * 60 * 60 * 1000; // C4 — ver spec

export interface SyncItemResult {
  id: string;
  status: 'SYNCED' | 'ALREADY_SYNCED' | 'CONFLICT' | 'ERROR';
  reason?: string;
  conflictId?: string;
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async sync(requester: JwtPayload, dto: SyncRequestDto) {
    const device = await this.resolveDevice(requester, dto.deviceId);

    const results: SyncItemResult[] = [];
    for (const item of dto.responses) {
      results.push(await this.syncOne(requester, device, dto.deviceId, item));
    }

    return { results };
  }

  private async resolveDevice(
    requester: JwtPayload,
    deviceIdentifier: string,
  ): Promise<Device> {
    const existing = await this.prisma.device.findUnique({
      where: { deviceIdentifier },
    });
    if (existing) {
      // Reatribui o device ao usuário atual — cobre tanto o device "órfão"
      // (dono anterior excluído, ver UsersService.remove) quanto o caso de
      // reuso físico do aparelho por outro pesquisador.
      return this.prisma.device.update({
        where: { id: existing.id },
        data: { userId: requester.sub, lastSeenAt: new Date() },
      });
    }

    return this.prisma.device.create({
      data: {
        organizationId: requester.organizationId,
        userId: requester.sub,
        deviceIdentifier,
        lastSeenAt: new Date(),
      },
    });
  }

  private async syncOne(
    requester: JwtPayload,
    device: Device,
    deviceIdentifier: string,
    item: SyncResponseItemDto,
  ): Promise<SyncItemResult> {
    const existing = await this.prisma.response.findUnique({
      where: { id: item.id },
      select: { id: true },
    });
    if (existing) {
      return { id: item.id, status: 'ALREADY_SYNCED' };
    }

    const collectedAt = new Date(item.collectedAt);
    const now = new Date();
    // C4 — relógio do dispositivo não é confiável: rejeita datas muito no
    // futuro (>24h) sem gerar ConflictRecord (é erro de dado, não disputa).
    if (collectedAt.getTime() - now.getTime() > MAX_CLOCK_SKEW_FUTURE_MS) {
      return { id: item.id, status: 'ERROR', reason: 'INVALID_TIMESTAMP' };
    }

    const surveyVersion = await this.prisma.surveyVersion.findUnique({
      where: { id: item.surveyVersionId },
      include: { questions: true },
    });
    if (!surveyVersion) {
      return {
        id: item.id,
        status: 'ERROR',
        reason: 'SURVEY_VERSION_NOT_FOUND',
      };
    }
    if (collectedAt.getTime() < surveyVersion.publishedAt.getTime()) {
      return { id: item.id, status: 'ERROR', reason: 'INVALID_TIMESTAMP' };
    }

    if (requester.role === UserRole.PESQUISADOR) {
      // Sem exigência de atribuição — qualquer PESQUISADOR pode sincronizar
      // respostas de qualquer pesquisa da própria organização (ver
      // SurveysService.findAll). A checagem de organizationId aqui evita que
      // isso vire uma brecha entre organizações.
      const survey = await this.prisma.survey.findFirst({
        where: {
          id: surveyVersion.surveyId,
          organizationId: requester.organizationId,
        },
        select: { id: true },
      });
      if (!survey) {
        return { id: item.id, status: 'ERROR', reason: 'PERMISSION_DENIED' };
      }
    }

    for (const question of surveyVersion.questions) {
      if (!question.isRequired) continue;

      // GPS é satisfeito pela captura de localização (campo `location` do
      // item, não `answers`) — só evitamos rejeitar por engano uma pergunta
      // que nunca teria uma entrada em `answers`.
      if (question.type === 'GPS') {
        if (!item.location) {
          return {
            id: item.id,
            status: 'ERROR',
            reason: `MISSING_REQUIRED_ANSWER:${question.externalId}`,
          };
        }
        continue;
      }

      const value = item.answers[question.externalId];
      const isEmpty =
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0);
      if (isEmpty) {
        return {
          id: item.id,
          status: 'ERROR',
          reason: `MISSING_REQUIRED_ANSWER:${question.externalId}`,
        };
      }
    }

    const questionByExternalId = new Map(
      surveyVersion.questions.map((q) => [q.externalId, q]),
    );

    // C2 — detecção de conflito: localização NÃO é critério (uma pesquisa
    // pode legitimamente coletar várias respostas no mesmo ponto fixo), nem
    // respondentId (campo externo opcional, nem sempre corresponde a uma
    // pergunta real da pesquisa). Só é conflito quando duas respostas da
    // mesma pesquisa têm o MESMO collectedAt (data e hora da coleta — base
    // principal, é o dado mais preciso e confiável do dispositivo) E todas
    // as respostas (Answer) idênticas — se tudo bate, é seguro assumir
    // duplicidade de dados (reenvio, duplo toque etc).
    const sameInstantCandidates = await this.prisma.response.findMany({
      where: { surveyId: surveyVersion.surveyId, collectedAt },
      include: { answers: { select: { questionId: true, value: true } } },
      orderBy: { collectedAt: 'asc' },
    });
    const conflictWith =
      sameInstantCandidates.find((candidate) =>
        hasIdenticalAnswers(
          candidate.answers,
          item.answers,
          questionByExternalId,
        ),
      ) ?? null;

    const responseStatus = conflictWith ? 'CONFLICT' : 'SYNCED';

    const conflictRecordId = await this.prisma.$transaction(async (tx) => {
      await tx.response.create({
        data: {
          id: item.id,
          surveyId: surveyVersion.surveyId,
          surveyVersionId: surveyVersion.id,
          researcherId: requester.sub,
          deviceId: device.id,
          respondentId: item.respondentId,
          status: responseStatus,
          locationHash: item.locationHash,
          collectedAt,
        },
      });

      const answerRows = Object.entries(item.answers)
        .filter(([externalId]) => questionByExternalId.has(externalId))
        .map(([externalId, value]) => ({
          responseId: item.id,
          questionId: questionByExternalId.get(externalId)!.id,
          value: (value ?? null) as Prisma.InputJsonValue,
        }));
      if (answerRows.length > 0) {
        await tx.answer.createMany({ data: answerRows });
      }

      if (item.location) {
        await tx.location.create({
          data: {
            responseId: item.id,
            latitude: item.location.latitude,
            longitude: item.location.longitude,
            accuracy: item.location.accuracy,
            capturedAt: collectedAt,
          },
        });
        // O campo PostGIS `coordinates` não é gravável via Prisma Client
        // diretamente (Unsupported type) — populado por SQL bruto.
        await tx.$executeRaw`UPDATE locations SET coordinates = ST_SetSRID(ST_MakePoint(${item.location.longitude}, ${item.location.latitude}), 4326) WHERE "responseId" = ${item.id}::uuid`;
      }

      await tx.syncRecord.create({
        data: {
          responseId: item.id,
          surveyId: surveyVersion.surveyId,
          deviceId: deviceIdentifier,
          status: responseStatus,
        },
      });

      if (conflictWith) {
        const conflict = await tx.conflictRecord.create({
          data: { responseId: item.id, conflictWithId: conflictWith.id },
        });
        return conflict.id;
      }
      return null;
    });

    if (conflictRecordId) {
      // Enfileirado via pg-boss (2.8) — "notificar o gestor" é, por
      // especificação, o próprio painel exibir os conflitos pendentes
      // (GET /conflicts); não há canal de email/push no MVP.
      await this.queue.notifyConflictDetected(
        conflictRecordId,
        surveyVersion.surveyId,
      );
      return {
        id: item.id,
        status: 'CONFLICT',
        conflictId: conflictRecordId,
      };
    }

    return { id: item.id, status: 'SYNCED' };
  }

  // GET /api/v1/sync/status — consulta o status de respostas já enviadas
  // pelo UUID gerado no device. PESQUISADOR só vê as próprias; demais
  // perfis (GESTOR/ADMINISTRADOR) veem qualquer uma da própria organização.
  async getStatus(requester: JwtPayload, ids: string[]) {
    const responses = await this.prisma.response.findMany({
      where: {
        id: { in: ids },
        ...(requester.role === UserRole.PESQUISADOR
          ? { researcherId: requester.sub }
          : { survey: { organizationId: requester.organizationId } }),
      },
      select: { id: true, status: true },
    });
    const byId = new Map(responses.map((r) => [r.id, r.status]));

    return {
      results: ids.map((id) => ({
        id,
        status: byId.get(id) ?? 'NOT_FOUND',
      })),
    };
  }
}

// Normaliza um valor de resposta para comparação — arrays (MULTIPLE_CHOICE)
// são ordenados para que a ordem de seleção não afete a igualdade.
function normalizeAnswerValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify([...value].sort());
  return JSON.stringify(value ?? null);
}

// Ver C2 acima: duas respostas só são conflito se TODAS as Answer baterem —
// mesmo conjunto de perguntas respondidas, com o mesmo valor cada uma.
function hasIdenticalAnswers(
  existingAnswers: { questionId: string; value: unknown }[],
  incomingAnswers: Record<string, unknown>,
  questionByExternalId: Map<string, { id: string }>,
): boolean {
  const incomingByQuestionId = new Map<string, unknown>();
  for (const [externalId, value] of Object.entries(incomingAnswers)) {
    const question = questionByExternalId.get(externalId);
    if (question) incomingByQuestionId.set(question.id, value);
  }

  if (existingAnswers.length !== incomingByQuestionId.size) return false;

  return existingAnswers.every(
    (answer) =>
      incomingByQuestionId.has(answer.questionId) &&
      normalizeAnswerValue(incomingByQuestionId.get(answer.questionId)) ===
        normalizeAnswerValue(answer.value),
  );
}
