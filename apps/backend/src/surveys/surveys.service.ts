import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, Survey, SurveyStatus, UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/jwt-payload';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { ListSurveyResponsesQueryDto } from './dto/list-survey-responses-query.dto';
import { ListSurveysQueryDto } from './dto/list-surveys-query.dto';
import { PublishSurveyDto } from './dto/publish-survey.dto';
import { UpdateSurveyDto } from './dto/update-survey.dto';
import { CHOICE_TYPES, validateSurveySchema } from './survey-schema.validator';

// Formato de pesquisa retornado por list/create/update/archive/duplicate —
// inclui contadores (_count.responses) para a listagem não precisar de uma
// segunda consulta por pesquisa.
const SURVEY_LIST_SELECT = {
  id: true,
  title: true,
  description: true,
  type: true,
  questionStyle: true,
  status: true,
  currentVersion: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  _count: { select: { responses: true } },
} as const;

@Injectable()
export class SurveysService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(requester: JwtPayload, query: ListSurveysQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const isResearcher = requester.role === UserRole.PESQUISADOR;

    const where = {
      organizationId: requester.organizationId,
      // PESQUISADOR enxerga toda pesquisa PUBLISHED da organização — não
      // existe mais atribuição de pesquisador por pesquisa (decisão de
      // produto: a coleta de campo não depende de atribuição manual).
      ...(isResearcher
        ? { status: SurveyStatus.PUBLISHED }
        : query.status
          ? { status: query.status }
          : {}),
      ...(query.search
        ? { title: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.survey.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: SURVEY_LIST_SELECT,
      }),
      this.prisma.survey.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(requester: JwtPayload, id: string) {
    const isResearcher = requester.role === UserRole.PESQUISADOR;
    const where = {
      id,
      organizationId: requester.organizationId,
      // Ver comentário equivalente em findAll.
      ...(isResearcher ? { status: SurveyStatus.PUBLISHED } : {}),
    };

    const [survey, totalResponses, conflictResponses] =
      await this.prisma.$transaction([
        this.prisma.survey.findFirst({ where, select: SURVEY_LIST_SELECT }),
        this.prisma.response.count({ where: { surveyId: id } }),
        this.prisma.response.count({
          where: { surveyId: id, status: 'CONFLICT' },
        }),
      ]);

    if (!survey) {
      throw new NotFoundException({
        code: 'SURVEY_NOT_FOUND',
        message: 'Pesquisa não encontrada.',
      });
    }

    return { ...survey, totalResponses, conflictResponses };
  }

  async create(requester: JwtPayload, dto: CreateSurveyDto) {
    return this.prisma.survey.create({
      data: {
        organizationId: requester.organizationId,
        createdById: requester.sub,
        title: dto.title,
        description: dto.description,
        type: dto.type,
        questionStyle: dto.questionStyle,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
      select: SURVEY_LIST_SELECT,
    });
  }

  async update(requester: JwtPayload, id: string, dto: UpdateSurveyDto) {
    const survey = await this.findSurveyOrThrow(requester, id);

    // Título, descrição, tipo e estilo de perguntas são só rótulos/conteúdo
    // informativo de categorização — editá-los numa pesquisa já publicada não
    // afeta o schema coletado, então é permitido em qualquer status. Datas
    // continuam restritas a DRAFT, pois mudam o que já foi ou está sendo
    // coletado.
    const hasNonTitleChanges =
      dto.startsAt !== undefined || dto.endsAt !== undefined;

    if (survey.status !== SurveyStatus.DRAFT && hasNonTitleChanges) {
      throw new UnprocessableEntityException({
        code: 'SURVEY_NOT_DRAFT',
        message:
          'Fora do rascunho (DRAFT), apenas o título pode ser editado — os demais campos exigem status DRAFT.',
      });
    }

    return this.prisma.survey.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.questionStyle !== undefined
          ? { questionStyle: dto.questionStyle }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.startsAt !== undefined
          ? { startsAt: new Date(dto.startsAt) }
          : {}),
        ...(dto.endsAt !== undefined ? { endsAt: new Date(dto.endsAt) } : {}),
      },
      select: SURVEY_LIST_SELECT,
    });
  }

  async publish(requester: JwtPayload, id: string, dto: PublishSurveyDto) {
    const survey = await this.findSurveyOrThrow(requester, id);

    if (survey.status === SurveyStatus.ARCHIVED) {
      throw new UnprocessableEntityException({
        code: 'SURVEY_ARCHIVED',
        message: 'Não é possível publicar uma pesquisa arquivada.',
      });
    }

    const validated = validateSurveySchema(dto.schema);
    const version = survey.currentVersion + 1;
    const versionId = randomUUID();

    const fullSchema = {
      surveyId: survey.id,
      versionId,
      version,
      title: validated.title ?? survey.title,
      // Metadados da pesquisa (não do schema de perguntas em si) — sem isso o
      // Mobile só recebia o título, e o cabeçalho da tela de coleta ficava
      // sem descrição/tipo/estilo mesmo quando a pesquisa os tinha.
      description: survey.description ?? undefined,
      type: survey.type ?? undefined,
      questionStyle: survey.questionStyle ?? undefined,
      // A seção marcada isHeader (ver survey-schema.validator.ts) já vem
      // ordenada primeiro em validated.sections — o Mobile a usa como
      // "cabeçalho" respondido uma vez por sessão de coleta.
      sections: validated.sections,
    };

    // Desnormaliza Question/QuestionOption a partir do schema JSON validado —
    // permite consultas relacionais (analytics) sem reparsear o
    // JSONB. O Mobile continua consumindo o `schema` completo (Contrato C1).
    const questionsData = validated.sections.flatMap((section) =>
      section.questions.map((question) => ({
        externalId: question.id,
        type: question.type,
        label: question.label,
        isRequired: question.required,
        orderIndex: question.orderIndex,
        sectionId: section.id,
        sectionTitle: section.title,
        isHeader: section.isHeader === true,
        config: question.config
          ? (JSON.parse(
              JSON.stringify(question.config),
            ) as Prisma.InputJsonValue)
          : undefined,
        options: CHOICE_TYPES.has(question.type)
          ? {
              create: (
                (question.config?.options as string[] | undefined) ?? []
              ).map((option, index) => ({
                label: option,
                value: option,
                orderIndex: index,
              })),
            }
          : undefined,
      })),
    );

    const [surveyVersion] = await this.prisma.$transaction([
      this.prisma.surveyVersion.create({
        data: {
          id: versionId,
          surveyId: survey.id,
          version,
          schema: JSON.parse(
            JSON.stringify(fullSchema),
          ) as Prisma.InputJsonValue,
          publishedBy: requester.sub,
          questions: { create: questionsData },
        },
      }),
      this.prisma.survey.update({
        where: { id: survey.id },
        data: { status: SurveyStatus.PUBLISHED, currentVersion: version },
      }),
    ]);

    return {
      surveyId: survey.id,
      versionId: surveyVersion.id,
      version: surveyVersion.version,
      publishedAt: surveyVersion.publishedAt,
    };
  }

  async archive(requester: JwtPayload, id: string) {
    const survey = await this.findSurveyOrThrow(requester, id);

    if (survey.status === SurveyStatus.ARCHIVED) {
      throw new ConflictException({
        code: 'SURVEY_ALREADY_ARCHIVED',
        message: 'Pesquisa já está arquivada.',
      });
    }

    return this.prisma.survey.update({
      where: { id },
      data: { status: SurveyStatus.ARCHIVED },
      select: SURVEY_LIST_SELECT,
    });
  }

  async unarchive(requester: JwtPayload, id: string) {
    const survey = await this.findSurveyOrThrow(requester, id);

    if (survey.status !== SurveyStatus.ARCHIVED) {
      throw new ConflictException({
        code: 'SURVEY_NOT_ARCHIVED',
        message: 'Pesquisa não está arquivada.',
      });
    }

    return this.prisma.survey.update({
      where: { id },
      data: {
        status:
          survey.currentVersion > 0
            ? SurveyStatus.PUBLISHED
            : SurveyStatus.DRAFT,
      },
      select: SURVEY_LIST_SELECT,
    });
  }

  // Exclusão definitiva da pesquisa. Só permitida fora de PUBLISHED (arquive
  // antes de excluir) e sem respostas já coletadas em nenhuma versão — mesma
  // lógica de guarda usada em deleteVersion, mas na pesquisa inteira. Versões,
  // perguntas e opções são removidas em CASCADE pelo schema.
  async remove(requester: JwtPayload, id: string): Promise<void> {
    const survey = await this.findSurveyOrThrow(requester, id);

    if (survey.status === SurveyStatus.PUBLISHED) {
      throw new UnprocessableEntityException({
        code: 'SURVEY_IS_PUBLISHED',
        message:
          'Não é possível excluir uma pesquisa publicada — arquive-a antes de excluir.',
      });
    }

    const responseCount = await this.prisma.response.count({
      where: { surveyId: id },
    });
    if (responseCount > 0) {
      // Só o ADMINISTRADOR pode excluir uma pesquisa que já tem respostas
      // coletadas — e, ao fazer isso, as respostas somem junto (cascata
      // explícita abaixo). Para GESTOR, continua bloqueado: a alternativa é
      // arquivar.
      if (requester.role !== UserRole.ADMINISTRADOR) {
        throw new UnprocessableEntityException({
          code: 'SURVEY_HAS_RESPONSES',
          message:
            'Não é possível excluir uma pesquisa com respostas já coletadas — apenas o Administrador pode.',
        });
      }
      await this.removeWithResponses(id);
      return;
    }

    await this.prisma.survey.delete({ where: { id } });
  }

  // Exclusão em cascata (só para ADMINISTRADOR, ver remove() acima). Ordem
  // importa: ConflictRecord/SyncRecord referenciam Response sem onDelete:
  // Cascade no schema, então precisam ser apagados antes — só depois disso
  // o delete de Response (que aí sim cascade-apaga Answer e Location) e, por
  // fim, o de Survey (que cascade-apaga SurveyVersion → Question →
  // QuestionOption) conseguem seguir sem violar FK.
  private async removeWithResponses(surveyId: string): Promise<void> {
    const responses = await this.prisma.response.findMany({
      where: { surveyId },
      select: { id: true },
    });
    const responseIds = responses.map((r) => r.id);

    await this.prisma.$transaction([
      this.prisma.conflictRecord.deleteMany({
        where: {
          OR: [
            { responseId: { in: responseIds } },
            { conflictWithId: { in: responseIds } },
          ],
        },
      }),
      this.prisma.syncRecord.deleteMany({ where: { surveyId } }),
      this.prisma.response.deleteMany({ where: { surveyId } }),
      this.prisma.survey.delete({ where: { id: surveyId } }),
    ]);
  }

  async duplicate(requester: JwtPayload, id: string) {
    const survey = await this.prisma.survey.findFirst({
      where: { id, organizationId: requester.organizationId },
    });
    if (!survey) {
      throw new NotFoundException({
        code: 'SURVEY_NOT_FOUND',
        message: 'Pesquisa não encontrada.',
      });
    }

    return this.prisma.survey.create({
      data: {
        organizationId: requester.organizationId,
        createdById: requester.sub,
        title: `${survey.title} (cópia)`,
        description: survey.description,
        startsAt: survey.startsAt,
        endsAt: survey.endsAt,
      },
      select: SURVEY_LIST_SELECT,
    });
  }

  async listVersions(requester: JwtPayload, id: string) {
    await this.assertVersionsReadable(requester, id);

    const survey = await this.prisma.survey.findUnique({
      where: { id },
      select: { currentVersion: true },
    });

    const versions = await this.prisma.surveyVersion.findMany({
      where: { surveyId: id },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        publishedAt: true,
        publishedBy: true,
        _count: { select: { responses: true } },
      },
    });

    return versions.map(({ _count, ...version }) => ({
      ...version,
      responseCount: _count.responses,
      isActive: version.version === survey?.currentVersion,
    }));
  }

  // Ativa uma versão já publicada como a versão "atual" da pesquisa
  // (Survey.currentVersion) — é essa que o Mobile baixa/usa a partir da
  // próxima sincronização (ver SurveysRepository.syncSurveys no Mobile) e
  // que POST /publish usa como base para o próximo número de versão. Não
  // recria nem republica nada — só troca o ponteiro.
  async activateVersion(requester: JwtPayload, id: string, version: number) {
    const survey = await this.findSurveyOrThrow(requester, id);

    if (survey.status === SurveyStatus.ARCHIVED) {
      throw new UnprocessableEntityException({
        code: 'SURVEY_ARCHIVED',
        message: 'Não é possível ativar uma versão de uma pesquisa arquivada.',
      });
    }

    const surveyVersion = await this.prisma.surveyVersion.findUnique({
      where: { surveyId_version: { surveyId: id, version } },
    });
    if (!surveyVersion) {
      throw new NotFoundException({
        code: 'SURVEY_VERSION_NOT_FOUND',
        message: 'Versão não encontrada.',
      });
    }

    return this.prisma.survey.update({
      where: { id },
      data: { currentVersion: version },
      select: SURVEY_LIST_SELECT,
    });
  }

  // Exclui uma versão publicada específica. Bloqueada para a versão ativa
  // (currentVersion — ative outra antes) e para qualquer versão com
  // respostas já coletadas (Response.surveyVersionId aponta pra ela — a
  // FK sem CASCADE garante isso no banco também, mas falhar aqui primeiro
  // dá uma mensagem legível em vez do erro cru do Postgres).
  async deleteVersion(requester: JwtPayload, id: string, version: number) {
    const survey = await this.findSurveyOrThrow(requester, id);

    if (version === survey.currentVersion) {
      throw new UnprocessableEntityException({
        code: 'VERSION_IS_ACTIVE',
        message:
          'Não é possível excluir a versão ativa — ative outra versão antes.',
      });
    }

    const surveyVersion = await this.prisma.surveyVersion.findUnique({
      where: { surveyId_version: { surveyId: id, version } },
      include: { _count: { select: { responses: true } } },
    });
    if (!surveyVersion) {
      throw new NotFoundException({
        code: 'SURVEY_VERSION_NOT_FOUND',
        message: 'Versão não encontrada.',
      });
    }
    if (surveyVersion._count.responses > 0) {
      throw new UnprocessableEntityException({
        code: 'VERSION_HAS_RESPONSES',
        message:
          'Não é possível excluir uma versão com respostas já coletadas.',
      });
    }

    await this.prisma.surveyVersion.delete({
      where: { surveyId_version: { surveyId: id, version } },
    });
    return { deleted: true };
  }

  async getVersion(requester: JwtPayload, id: string, version: number) {
    await this.assertVersionsReadable(requester, id);

    const surveyVersion = await this.prisma.surveyVersion.findUnique({
      where: { surveyId_version: { surveyId: id, version } },
    });
    if (!surveyVersion) {
      throw new NotFoundException({
        code: 'SURVEY_VERSION_NOT_FOUND',
        message: 'Versão não encontrada.',
      });
    }

    return surveyVersion.schema;
  }

  // Painel operacional básico — lista as respostas já
  // sincronizadas de uma pesquisa com filtros simples. O Dashboard com KPIs
  // via view materializada e o Analytics completo com
  // by-researcher/by-period/mapa/export substituem/complementam
  // esta visão; ela não tenta replicar aquilo.
  async listResponses(
    requester: JwtPayload,
    id: string,
    query: ListSurveyResponsesQueryDto,
  ) {
    // Mesma regra de visibilidade de listVersions/getVersion: PESQUISADOR só
    // vê se estiver atribuído (independente do status atual da pesquisa) —
    // ao contrário de findSurveyOrThrow, que só confere a organização e é
    // usado pelos endpoints de gestão (já restritos a GESTOR/ADMINISTRADOR
    // no controller).
    await this.assertVersionsReadable(requester, id);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const isResearcher = requester.role === UserRole.PESQUISADOR;

    const where = {
      surveyId: id,
      ...(isResearcher
        ? { researcherId: requester.sub }
        : query.researcherId
          ? { researcherId: query.researcherId }
          : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            collectedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [data, total, synced, conflict, error] =
      await this.prisma.$transaction([
        this.prisma.response.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { collectedAt: 'desc' },
          select: {
            id: true,
            respondentId: true,
            status: true,
            collectedAt: true,
            syncedAt: true,
            researcher: { select: { id: true, name: true } },
          },
        }),
        this.prisma.response.count({ where }),
        this.prisma.response.count({ where: { ...where, status: 'SYNCED' } }),
        this.prisma.response.count({ where: { ...where, status: 'CONFLICT' } }),
        this.prisma.response.count({ where: { ...where, status: 'ERROR' } }),
      ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      counters: { total, synced, conflict, error },
    };
  }

  private async findSurveyOrThrow(
    requester: JwtPayload,
    id: string,
  ): Promise<Survey> {
    const survey = await this.prisma.survey.findFirst({
      where: { id, organizationId: requester.organizationId },
    });
    if (!survey) {
      throw new NotFoundException({
        code: 'SURVEY_NOT_FOUND',
        message: 'Pesquisa não encontrada.',
      });
    }
    return survey;
  }

  private async assertVersionsReadable(
    requester: JwtPayload,
    id: string,
  ): Promise<void> {
    // Sem filtro de atribuição — qualquer PESQUISADOR da organização pode ler
    // versões/respostas de qualquer pesquisa da própria organização (ver
    // comentário em findAll).
    const survey = await this.prisma.survey.findFirst({
      where: { id, organizationId: requester.organizationId },
      select: { id: true },
    });
    if (!survey) {
      throw new NotFoundException({
        code: 'SURVEY_NOT_FOUND',
        message: 'Pesquisa não encontrada.',
      });
    }
  }
}
