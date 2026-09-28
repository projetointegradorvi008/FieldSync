import { Injectable, NotFoundException } from '@nestjs/common';
import { ResponseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/jwt-payload';
import { AnalyticsFilterQueryDto } from './dto/analytics-filter-query.dto';
import { ByPeriodQueryDto } from './dto/by-period-query.dto';
import { ExportQueryDto } from './dto/export-query.dto';
import { ListAnalyticsResponsesQueryDto } from './dto/list-analytics-responses-query.dto';

interface ByPeriodRow {
  bucket: Date;
  total: bigint;
  synced: bigint;
  conflicts: bigint;
  errors: bigint;
}

const RESPONSE_DETAIL_SELECT = {
  id: true,
  respondentId: true,
  status: true,
  collectedAt: true,
  syncedAt: true,
  researcher: { select: { id: true, name: true } },
  location: { select: { latitude: true, longitude: true, accuracy: true } },
  answers: {
    select: {
      value: true,
      question: {
        select: { externalId: true, label: true, type: true, isHeader: true },
      },
    },
  },
} as const;

// GET /analytics/surveys/:id/* — Analytics completo (2.10):
// responses, resposta por id, by-researcher, by-period, locations, export,
// e o kpis via view materializada.
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getKpis(requester: JwtPayload, surveyId: string) {
    await this.assertSurveyReadable(requester, surveyId);

    // Direto nas tabelas (não mais via mv_survey_kpis) — o Dashboard da
    // pesquisa (surveys/[id]/dashboard) precisa refletir uma resposta
    // recém-sincronizada instantaneamente, igual ao Analytics completo e ao
    // painel operacional (ambos já consultavam ao vivo); a view
    // materializada só era atualizada a cada KPI_REFRESH_INTERVAL_MINUTES
    // pelo QueueService, deixando o Dashboard minutos desatualizado em
    // relação às outras abas. Mesma técnica do activeResearchers abaixo
    // (contagem via índice em surveyId, barata para o volume do MVP).
    const [grouped, lastResponse, activeResearchers] = await Promise.all([
      this.prisma.response.groupBy({
        by: ['status'],
        where: { surveyId },
        _count: { _all: true },
      }),
      this.prisma.response.findFirst({
        where: { surveyId },
        orderBy: { syncedAt: 'desc' },
        select: { syncedAt: true },
      }),
      this.prisma.response.findMany({
        // researcherId pode ser null (pesquisador excluído) — não conta
        // como pesquisador "ativo".
        where: { surveyId, researcherId: { not: null } },
        distinct: ['researcherId'],
        select: { researcherId: true },
      }),
    ]);

    const countByStatus = (status: ResponseStatus) =>
      grouped.find((g) => g.status === status)?._count._all ?? 0;
    const totalResponses = grouped.reduce((sum, g) => sum + g._count._all, 0);
    const synced = countByStatus(ResponseStatus.SYNCED);

    return {
      data: {
        surveyId,
        totalResponses,
        synced,
        conflicts: countByStatus(ResponseStatus.CONFLICT),
        errors: countByStatus(ResponseStatus.ERROR),
        activeResearchers: activeResearchers.length,
        completionRate: totalResponses > 0 ? synced / totalResponses : 0,
        lastResponseAt: lastResponse?.syncedAt ?? null,
        updatedAt: new Date(),
      },
    };
  }

  async listResponses(
    requester: JwtPayload,
    surveyId: string,
    query: ListAnalyticsResponsesQueryDto,
  ) {
    await this.assertSurveyReadable(requester, surveyId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildResponseWhere(surveyId, {
      researcherId: query.researcherId,
      status: query.status,
      from: query.from,
      to: query.to,
    });

    const [data, total] = await this.prisma.$transaction([
      this.prisma.response.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [query.sort ?? 'collectedAt']: query.order ?? 'desc' },
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
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getResponseDetail(
    requester: JwtPayload,
    surveyId: string,
    responseId: string,
  ) {
    await this.assertSurveyReadable(requester, surveyId);

    const response = await this.prisma.response.findFirst({
      where: { id: responseId, surveyId },
      select: RESPONSE_DETAIL_SELECT,
    });
    if (!response) {
      throw new NotFoundException({
        code: 'RESPONSE_NOT_FOUND',
        message: 'Resposta não encontrada.',
      });
    }
    return { data: response };
  }

  async byResearcher(
    requester: JwtPayload,
    surveyId: string,
    query: AnalyticsFilterQueryDto,
  ) {
    await this.assertSurveyReadable(requester, surveyId);

    const where = this.buildResponseWhere(surveyId, {
      researcherId: query.researcherId,
      from: query.from,
      to: query.to,
    });

    const grouped = await this.prisma.response.groupBy({
      by: ['researcherId', 'status'],
      where,
      _count: { _all: true },
    });

    // researcherId pode ser null (pesquisador excluído, ver
    // Response.researcher — onDelete: SetNull) — usa uma chave sentinela
    // para não quebrar o Map<string, ...> nem o `in` do findMany abaixo, que
    // não aceita null.
    const REMOVED_RESEARCHER_KEY = '__removed__';
    const byResearcherId = new Map<
      string,
      { total: number; synced: number; conflicts: number; errors: number }
    >();
    for (const row of grouped) {
      const key = row.researcherId ?? REMOVED_RESEARCHER_KEY;
      const entry = byResearcherId.get(key) ?? {
        total: 0,
        synced: 0,
        conflicts: 0,
        errors: 0,
      };
      entry.total += row._count._all;
      if (row.status === ResponseStatus.SYNCED) entry.synced += row._count._all;
      if (row.status === ResponseStatus.CONFLICT)
        entry.conflicts += row._count._all;
      if (row.status === ResponseStatus.ERROR) entry.errors += row._count._all;
      byResearcherId.set(key, entry);
    }

    const researchers = await this.prisma.user.findMany({
      where: {
        id: {
          in: [...byResearcherId.keys()].filter(
            (key) => key !== REMOVED_RESEARCHER_KEY,
          ),
        },
      },
      select: { id: true, name: true },
    });
    const nameById = new Map(researchers.map((r) => [r.id, r.name]));

    return {
      data: [...byResearcherId.entries()].map(([researcherId, counts]) => ({
        researcherId:
          researcherId === REMOVED_RESEARCHER_KEY ? null : researcherId,
        researcherName:
          researcherId === REMOVED_RESEARCHER_KEY
            ? 'Pesquisador removido'
            : (nameById.get(researcherId) ?? researcherId),
        ...counts,
      })),
    };
  }

  async byPeriod(
    requester: JwtPayload,
    surveyId: string,
    query: ByPeriodQueryDto,
  ) {
    await this.assertSurveyReadable(requester, surveyId);

    const groupBy = query.groupBy ?? 'day';
    const from = query.from ? new Date(query.from) : new Date(0);
    const to = query.to ? new Date(query.to) : new Date('9999-12-31');

    const rows = await this.prisma.$queryRaw<ByPeriodRow[]>`
      SELECT
        date_trunc(${groupBy}, "collectedAt") AS bucket,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'SYNCED') AS synced,
        COUNT(*) FILTER (WHERE status = 'CONFLICT') AS conflicts,
        COUNT(*) FILTER (WHERE status = 'ERROR') AS errors
      FROM responses
      WHERE "surveyId" = ${surveyId}::uuid
        AND "collectedAt" >= ${from}
        AND "collectedAt" <= ${to}
      GROUP BY bucket
      ORDER BY bucket ASC
    `;

    return {
      data: rows.map((row) => ({
        period: row.bucket.toISOString(),
        total: Number(row.total),
        synced: Number(row.synced),
        conflicts: Number(row.conflicts),
        errors: Number(row.errors),
      })),
    };
  }

  // Todos os pontos de coleta da organização, de todas as pesquisas — usado
  // pelo mapa do Painel geral (visão consolidada), diferente de `locations`
  // acima que é escopado a uma pesquisa (mapa do Analytics dela).
  async locationsAll(requester: JwtPayload) {
    const responses = await this.prisma.response.findMany({
      where: {
        survey: { organizationId: requester.organizationId },
        location: { isNot: null },
      },
      select: {
        id: true,
        status: true,
        collectedAt: true,
        researcher: { select: { id: true, name: true } },
        survey: { select: { id: true, title: true } },
        location: { select: { latitude: true, longitude: true } },
      },
    });

    return {
      data: responses.map((r) => ({
        responseId: r.id,
        latitude: r.location!.latitude,
        longitude: r.location!.longitude,
        collectedAt: r.collectedAt,
        researcher: r.researcher,
        status: r.status,
        survey: r.survey,
      })),
    };
  }

  async locations(
    requester: JwtPayload,
    surveyId: string,
    query: AnalyticsFilterQueryDto,
  ) {
    await this.assertSurveyReadable(requester, surveyId);

    const where = this.buildResponseWhere(surveyId, {
      researcherId: query.researcherId,
      from: query.from,
      to: query.to,
    });

    const responses = await this.prisma.response.findMany({
      where: { ...where, location: { isNot: null } },
      select: {
        id: true,
        status: true,
        collectedAt: true,
        researcher: { select: { id: true, name: true } },
        location: { select: { latitude: true, longitude: true } },
      },
    });

    return {
      data: responses.map((r) => ({
        responseId: r.id,
        latitude: r.location!.latitude,
        longitude: r.location!.longitude,
        collectedAt: r.collectedAt,
        researcher: r.researcher,
        status: r.status,
      })),
    };
  }

  async exportData(
    requester: JwtPayload,
    surveyId: string,
    query: ExportQueryDto,
  ) {
    await this.assertSurveyReadable(requester, surveyId);

    const where = this.buildResponseWhere(surveyId, {
      researcherId: query.researcherId,
      from: query.from,
      to: query.to,
    });

    // Dataset do PI (12 dispositivos) é pequeno o bastante para exportar de
    // forma síncrona. "Para datasets grandes: enfileira job e retorna URL de
    // download" (2.10) é a evolução natural via QueueService quando o volume
    // justificar — não implementada agora para não construir infraestrutura
    // sem necessidade real na escala atual do MVP.
    const responses = await this.prisma.response.findMany({
      where,
      orderBy: { collectedAt: 'desc' },
      select: {
        id: true,
        respondentId: true,
        status: true,
        collectedAt: true,
        syncedAt: true,
        researcher: { select: { name: true } },
        location: { select: { latitude: true, longitude: true } },
        answers: {
          select: {
            value: true,
            question: { select: { externalId: true, label: true } },
          },
        },
      },
    });

    // LGPD (Privacidade e Proteção de Dados): respondentId é PII e só entra
    // no export quando o exportador marca includePii explicitamente — e essa
    // decisão fica registrada no AuditLog.
    if (query.includePii) {
      await this.prisma.auditLog.create({
        data: {
          userId: requester.sub,
          action: 'EXPORT_WITH_PII',
          entityType: 'Survey',
          entityId: surveyId,
          metadata: { format: query.format ?? 'csv' },
        },
      });
    }

    const rows = responses.map((r) => ({
      responseId: r.id,
      researcherName: r.researcher?.name ?? 'Pesquisador removido',
      status: r.status,
      collectedAt: r.collectedAt.toISOString(),
      syncedAt: r.syncedAt.toISOString(),
      latitude: r.location?.latitude ?? null,
      longitude: r.location?.longitude ?? null,
      ...(query.includePii ? { respondentId: r.respondentId ?? '' } : {}),
      answers: Object.fromEntries(
        r.answers.map((a) => [a.question.label, a.value]),
      ),
    }));

    if (query.format === 'json') {
      return { format: 'json' as const, data: rows };
    }
    return { format: 'csv' as const, csv: this.buildCsv(rows) };
  }

  private buildCsv(rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return '\uFEFF';

    const baseColumns = Object.keys(rows[0]).filter((k) => k !== 'answers');
    const answerLabels = new Set<string>();
    for (const row of rows) {
      const answers = row.answers as Record<string, unknown>;
      for (const label of Object.keys(answers)) answerLabels.add(label);
    }
    const columns = [...baseColumns, ...answerLabels];

    // Excel em locale pt-BR usa ";" como separador de lista por padrão
    // (vírgula é o separador decimal) — evita a planilha abrir tudo numa
    // única coluna, que é o problema real por trás do critério "abre
    // corretamente no Excel".
    const escape = (value: unknown): string => {
      const str = value === null || value === undefined ? '' : String(value);
      if (/[;"\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
      return str;
    };

    // Injeção de fórmula (CSV/Excel): uma resposta de texto livre de um
    // PESQUISADOR começando com = + - @ vira uma fórmula executável ao abrir
    // no Excel/LibreOffice na máquina de um GESTOR/ADMINISTRADOR. Prefixar
    // com um "'" neutraliza sem alterar o valor visível na célula. Só se
    // aplica aos valores das células (respostas), não ao cabeçalho — que é
    // controlado por quem já tem o mesmo nível de acesso de quem abre o export.
    const sanitizeFormula = (str: string): string =>
      /^[=+\-@]/.test(str) ? `'${str}` : str;

    const escapeCell = (value: unknown): string =>
      escape(
        sanitizeFormula(
          String(value === null || value === undefined ? '' : value),
        ),
      );

    const lines = [columns.map(escape).join(';')];
    for (const row of rows) {
      const answers = row.answers as Record<string, unknown>;
      lines.push(
        columns
          .map((col) =>
            baseColumns.includes(col)
              ? escapeCell(row[col])
              : escapeCell(answers[col]),
          )
          .join(';'),
      );
    }
    return '\uFEFF' + lines.join('\r\n');
  }

  private buildResponseWhere(
    surveyId: string,
    filters: {
      researcherId?: string;
      status?: ResponseStatus;
      from?: string;
      to?: string;
    },
  ) {
    return {
      surveyId,
      ...(filters.researcherId ? { researcherId: filters.researcherId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.from || filters.to
        ? {
            collectedAt: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {}),
    };
  }

  private async assertSurveyReadable(
    requester: JwtPayload,
    surveyId: string,
  ): Promise<void> {
    const survey = await this.prisma.survey.findFirst({
      where: { id: surveyId, organizationId: requester.organizationId },
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
