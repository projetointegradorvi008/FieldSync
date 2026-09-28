import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload';
import { SyncRequestDto } from './dto/sync-request.dto';
import { SyncStatusQueryDto } from './dto/sync-status-query.dto';
import { SyncService } from './sync.service';

// Ponto de entrada do motor de sincronização offline-first: recebe lotes de
// respostas coletadas em campo (POST /sync) e permite consultar o status de
// itens já enviados (GET /sync/status). Toda a regra fica em SyncService.
@ApiTags('Sync')
@ApiBearerAuth()
@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  // 30 req/min por IP — ver "Sync — Sincronização" na especificação. Lido de
  // env (default 30) só para permitir ajustar durante o teste de carga
  // sintético (12 "dispositivos" batendo do mesmo IP de teste, diferente do
  // cenário real onde cada device tem seu próprio IP/Tailscale IP) — em
  // produção, deixar SYNC_RATE_LIMIT_PER_MINUTE sem definir.
  @Throttle({
    default: {
      limit: () => Number(process.env.SYNC_RATE_LIMIT_PER_MINUTE ?? 30),
      ttl: 60_000,
    },
  })
  @Post()
  @HttpCode(HttpStatus.OK)
  async sync(@CurrentUser() user: JwtPayload, @Body() dto: SyncRequestDto) {
    return this.syncService.sync(user, dto);
  }

  @Get('status')
  async status(
    @CurrentUser() user: JwtPayload,
    @Query() query: SyncStatusQueryDto,
  ) {
    return this.syncService.getStatus(user, query.ids);
  }
}
