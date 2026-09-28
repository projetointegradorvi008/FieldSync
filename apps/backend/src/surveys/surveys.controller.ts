import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/jwt-payload';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { ListSurveyResponsesQueryDto } from './dto/list-survey-responses-query.dto';
import { ListSurveysQueryDto } from './dto/list-surveys-query.dto';
import { PublishSurveyDto } from './dto/publish-survey.dto';
import { UpdateSurveyDto } from './dto/update-survey.dto';
import { SurveysService } from './surveys.service';

// CRUD de pesquisas, publicação versionada do schema do formulário (Contrato
// C1), arquivamento, duplicação e consulta de versões/respostas. PESQUISADOR
// só enxerga pesquisas PUBLISHED às quais está atribuído — essa regra vive
// no SurveysService, não neste controller.
@ApiTags('Surveys')
@ApiBearerAuth()
@Controller('surveys')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SurveysController {
  constructor(private readonly surveysService: SurveysService) {}

  @Get()
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListSurveysQueryDto,
  ) {
    return this.surveysService.findAll(user, query);
  }

  @Post()
  @Roles(UserRole.ADMINISTRADOR, UserRole.GESTOR)
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateSurveyDto) {
    return this.surveysService.create(user, dto);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.surveysService.findOne(user, id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMINISTRADOR, UserRole.GESTOR)
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateSurveyDto,
  ) {
    return this.surveysService.update(user, id, dto);
  }

  @Post(':id/publish')
  @Roles(UserRole.ADMINISTRADOR, UserRole.GESTOR)
  async publish(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: PublishSurveyDto,
  ) {
    return this.surveysService.publish(user, id, dto);
  }

  @Post(':id/archive')
  @Roles(UserRole.ADMINISTRADOR, UserRole.GESTOR)
  @HttpCode(HttpStatus.OK)
  async archive(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.surveysService.archive(user, id);
  }

  @Post(':id/unarchive')
  @Roles(UserRole.ADMINISTRADOR, UserRole.GESTOR)
  @HttpCode(HttpStatus.OK)
  async unarchive(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.surveysService.unarchive(user, id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMINISTRADOR, UserRole.GESTOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.surveysService.remove(user, id);
  }

  @Post(':id/duplicate')
  @Roles(UserRole.ADMINISTRADOR, UserRole.GESTOR)
  async duplicate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.surveysService.duplicate(user, id);
  }

  @Get(':id/versions')
  async listVersions(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.surveysService.listVersions(user, id);
  }

  @Get(':id/versions/:version')
  async getVersion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.surveysService.getVersion(user, id, version);
  }

  @Post(':id/versions/:version/activate')
  @Roles(UserRole.ADMINISTRADOR, UserRole.GESTOR)
  async activateVersion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.surveysService.activateVersion(user, id, version);
  }

  @Delete(':id/versions/:version')
  @Roles(UserRole.ADMINISTRADOR, UserRole.GESTOR)
  async deleteVersion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.surveysService.deleteVersion(user, id, version);
  }

  @Get(':id/responses')
  async listResponses(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query() query: ListSurveyResponsesQueryDto,
  ) {
    return this.surveysService.listResponses(user, id, query);
  }
}
