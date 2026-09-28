import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/jwt-payload';
import { AnalyticsService } from './analytics.service';
import { AnalyticsFilterQueryDto } from './dto/analytics-filter-query.dto';
import { ByPeriodQueryDto } from './dto/by-period-query.dto';
import { ExportQueryDto } from './dto/export-query.dto';
import { ListAnalyticsResponsesQueryDto } from './dto/list-analytics-responses-query.dto';

// Relatórios e exportação por pesquisa: KPIs, listagem/detalhe de respostas,
// agregações (by-researcher, by-period), localizações (para o mapa) e
// export CSV/JSON. Todo o controller é somente leitura — SUPERVISOR e
// VISUALIZADOR têm acesso de leitura a todos os dados da organização aqui
// (Dashboard/Analytics/Painel Operacional/mapa), igual a GESTOR/ADMINISTRADOR.
@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics/surveys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  UserRole.ADMINISTRADOR,
  UserRole.GESTOR,
  UserRole.SUPERVISOR,
  UserRole.VISUALIZADOR,
)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // Rota sem :id — precisa vir antes de ':id/kpis' para não ser capturada
  // pelo parâmetro de rota. Alimenta o mapa geral do Painel (todas as
  // pesquisas da organização, não só uma).
  @Get('locations')
  async locationsAll(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.locationsAll(user);
  }

  @Get(':id/kpis')
  async getKpis(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.analyticsService.getKpis(user, id);
  }

  @Get(':id/responses')
  async listResponses(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query() query: ListAnalyticsResponsesQueryDto,
  ) {
    return this.analyticsService.listResponses(user, id, query);
  }

  @Get(':id/responses/:responseId')
  async getResponseDetail(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('responseId') responseId: string,
  ) {
    return this.analyticsService.getResponseDetail(user, id, responseId);
  }

  @Get(':id/by-researcher')
  async byResearcher(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query() query: AnalyticsFilterQueryDto,
  ) {
    return this.analyticsService.byResearcher(user, id, query);
  }

  @Get(':id/by-period')
  async byPeriod(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query() query: ByPeriodQueryDto,
  ) {
    return this.analyticsService.byPeriod(user, id, query);
  }

  @Get(':id/locations')
  async locations(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query() query: AnalyticsFilterQueryDto,
  ) {
    return this.analyticsService.locations(user, id, query);
  }

  @Get(':id/export')
  async exportData(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query() query: ExportQueryDto,
    @Res() res: Response,
  ) {
    const result = await this.analyticsService.exportData(user, id, query);
    if (result.format === 'json') {
      res.json({ data: result.data });
      return;
    }
    res
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header(
        'Content-Disposition',
        `attachment; filename="survey-${id}-export.csv"`,
      )
      .send(result.csv);
  }
}
