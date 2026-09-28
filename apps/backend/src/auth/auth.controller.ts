import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtPayload } from './jwt-payload';

// Rotas HTTP de autenticação e gestão de sessão. Toda a regra de negócio
// (verificação de senha, emissão/rotação de token) vive em AuthService —
// este controller só valida a entrada (via DTOs) e delega.
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // OWASP A07 — limita tentativas de força bruta contra login. Lido de env
  // (default 5) pelo mesmo motivo do SYNC_RATE_LIMIT_PER_MINUTE — permitir
  // ajuste durante o teste de carga sintético (12 "dispositivos" logando do
  // mesmo IP de teste); em produção, deixar LOGIN_RATE_LIMIT_PER_MINUTE
  // sem definir.
  @Throttle({
    default: {
      limit: () => Number(process.env.LOGIN_RATE_LIMIT_PER_MINUTE ?? 5),
      ttl: 60_000,
    },
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // Sem isso, /auth/refresh caía só no limite global (100/min) — mas esta
  // rota escreve no banco a cada chamada (rotação de token) e implementa a
  // detecção de reuso (REUSE_DETECTED, ver AuthService.refresh), um controle
  // de segurança que vale a pena limitar como login/sync.
  @Throttle({
    default: {
      limit: () => Number(process.env.REFRESH_RATE_LIMIT_PER_MINUTE ?? 10),
      ttl: 60_000,
    },
  })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: LogoutDto) {
    await this.authService.logout(dto);
  }

  // VISUALIZADOR só enxerga dados (Dashboard/Analytics/Painel/mapa) — a
  // gestão de sessões/dispositivos fica bloqueada para esse perfil (ver
  // NavBar no Web, que já esconde a aba).
  @ApiBearerAuth()
  @Get('sessions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRADOR, UserRole.GESTOR, UserRole.SUPERVISOR)
  async sessions(@CurrentUser() user: JwtPayload) {
    return this.authService.listSessions(user);
  }

  @ApiBearerAuth()
  @Delete('sessions/:deviceId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRADOR, UserRole.GESTOR, UserRole.SUPERVISOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentUser() user: JwtPayload,
    @Param('deviceId') deviceId: string,
  ) {
    await this.authService.revokeSession(user, deviceId);
  }
}
