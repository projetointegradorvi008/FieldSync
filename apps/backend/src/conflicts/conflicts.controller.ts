import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { ConflictsService } from './conflicts.service';
import { ListConflictsQueryDto } from './dto/list-conflicts-query.dto';
import { ResolveConflictDto } from './dto/resolve-conflict.dto';

// Painel de resolução de conflitos (Contrato C2): listar, ver o detalhe
// lado a lado e resolver (KEEP_FIRST/KEEP_SECOND/DISCARD_BOTH). Restrito a
// GESTOR/ADMINISTRADOR.
@ApiTags('Conflicts')
@ApiBearerAuth()
@Controller('conflicts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMINISTRADOR, UserRole.GESTOR)
export class ConflictsController {
  constructor(private readonly conflictsService: ConflictsService) {}

  @Get()
  async list(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListConflictsQueryDto,
  ) {
    return this.conflictsService.list(user, query);
  }

  @Get(':id')
  async getOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.conflictsService.getOne(user, id);
  }

  @Patch(':id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolve(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ResolveConflictDto,
  ) {
    return this.conflictsService.resolve(user, id, dto);
  }
}
