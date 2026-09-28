import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/jwt-payload';
import { ListConflictsQueryDto } from './dto/list-conflicts-query.dto';
import { ResolveConflictDto } from './dto/resolve-conflict.dto';

const RESPONSE_SUMMARY_SELECT = {
  id: true,
  respondentId: true,
  status: true,
  collectedAt: true,
  syncedAt: true,
  researcher: { select: { id: true, name: true } },
  survey: { select: { id: true, title: true } },
} as const;

// GET /conflicts, GET /conflicts/:id e PATCH /conflicts/:id/resolve —
// resolução de conflitos de sincronização (C2). Restrito a GESTOR/ADMINISTRADOR no controller (é o painel
// do gestor que "recebe a notificação" — não há canal de email/push no MVP,
// ver QueueService).
@Injectable()
export class ConflictsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(requester: JwtPayload, query: ListConflictsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where = {
      status: 'PENDING' as const,
      response: {
        survey: { organizationId: requester.organizationId },
        ...(query.surveyId ? { surveyId: query.surveyId } : {}),
      },
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.conflictRecord.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { detectedAt: 'desc' },
        select: {
          id: true,
          status: true,
          detectedAt: true,
          response: { select: RESPONSE_SUMMARY_SELECT },
          conflictWith: { select: RESPONSE_SUMMARY_SELECT },
        },
      }),
      this.prisma.conflictRecord.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getOne(requester: JwtPayload, id: string) {
    const conflict = await this.findConflictOrThrow(requester, id);

    const [response, conflictWith] = await Promise.all([
      this.getResponseDetail(conflict.responseId),
      this.getResponseDetail(conflict.conflictWithId),
    ]);

    return {
      id: conflict.id,
      status: conflict.status,
      resolution: conflict.resolution,
      resolvedById: conflict.resolvedById,
      resolvedAt: conflict.resolvedAt,
      detectedAt: conflict.detectedAt,
      response,
      conflictWith,
    };
  }

  async resolve(requester: JwtPayload, id: string, dto: ResolveConflictDto) {
    const conflict = await this.findConflictOrThrow(requester, id);

    // Não apagamos nem alteramos os dois registros em disputa: a página de
    // detalhe do conflito precisa continuar comparando-os lado a lado mesmo
    // depois de resolvido, e a KPI "conflicts" do endpoint de Analytics
    // conta pelo ResponseStatus literal, não pelo estado de resolução.
    // "Resolver" aqui significa apenas registrar a decisão do gestor de
    // forma auditável.
    return this.prisma.conflictRecord.update({
      where: { id: conflict.id },
      data: {
        status: 'RESOLVED',
        resolution: dto.action,
        resolvedById: requester.sub,
        resolvedAt: new Date(),
      },
    });
  }

  private async findConflictOrThrow(requester: JwtPayload, id: string) {
    const conflict = await this.prisma.conflictRecord.findFirst({
      where: {
        id,
        response: { survey: { organizationId: requester.organizationId } },
      },
    });
    if (!conflict) {
      throw new NotFoundException({
        code: 'CONFLICT_NOT_FOUND',
        message: 'Conflito não encontrado.',
      });
    }
    return conflict;
  }

  private async getResponseDetail(responseId: string) {
    return this.prisma.response.findUniqueOrThrow({
      where: { id: responseId },
      select: {
        ...RESPONSE_SUMMARY_SELECT,
        locationHash: true,
        location: {
          select: { latitude: true, longitude: true, accuracy: true },
        },
        answers: {
          select: {
            value: true,
            question: { select: { externalId: true, label: true } },
          },
        },
      },
    });
  }
}
