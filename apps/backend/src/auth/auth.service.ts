import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ARGON2_OPTIONS } from './argon2.config';
import { parseDurationMs } from './duration.util';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtPayload } from './jwt-payload';
import { roleLevel } from './role-hierarchy';

// Hash "dummy" pré-computado uma única vez, no carregamento do módulo (não
// por requisição) — usado para equalizar o tempo de resposta do login
// quando o e-mail não existe (ver comentário em `login()` abaixo). Se fosse
// gerado por requisição, o próprio custo do hash() introduziria uma latência
// variável e reabriria o canal de tempo que essa correção fecha.
const DUMMY_PASSWORD_HASH_PROMISE = argon2.hash(
  'senha-dummy-para-igualar-tempo-de-resposta',
  ARGON2_OPTIONS,
);

// Regra de negócio de autenticação: login (verifica senha com Argon2id),
// rotação de refresh token com detecção de reuso (indício de token roubado —
// ver REUSE_DETECTED abaixo), logout e gestão de sessões/dispositivos.
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  // OWASP A09 — eventos de segurança logados explicitamente (login falho,
  // REUSE_DETECTED, revogação de sessão), ver checklist na especificação.
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.isActive) {
      // Roda um argon2.verify contra um hash fixo mesmo sem usuário — sem
      // isso, este caminho retorna quase instantaneamente enquanto o
      // caminho "usuário existe" espera o verify() completo, permitindo
      // enumerar e-mails válidos só medindo o tempo de resposta do login.
      await argon2.verify(await DUMMY_PASSWORD_HASH_PROMISE, dto.password);
      this.logger.warn(
        `Login falho (usuário inexistente/inativo): ${dto.email}`,
      );
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email ou senha incorretos.',
      });
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      this.logger.warn(`Login falho (senha incorreta): ${dto.email}`);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email ou senha incorretos.',
      });
    }

    // PESQUISADOR é um perfil exclusivo do app mobile de coleta de campo —
    // não tem acesso a nenhuma tela da Web (Dashboard, Analytics, Usuários
    // etc.), então nem chega a autenticar por esse canal. Checada depois da
    // senha (não antes) para não revelar o perfil de um email a quem ainda
    // não provou conhecer a senha.
    if (dto.platform === 'web' && user.role === 'PESQUISADOR') {
      this.logger.warn(
        `Login web bloqueado para perfil PESQUISADOR: ${dto.email}`,
      );
      throw new ForbiddenException({
        code: 'WEB_ACCESS_DENIED',
        message:
          'Pesquisadores de campo só podem acessar pelo aplicativo mobile.',
      });
    }

    // Sessão única por usuário: um novo login (mesmo dispositivo ou outro)
    // revoga qualquer sessão ativa anterior — o próximo refresh/requisição
    // dela recebe TOKEN_REVOKED e força o logout nesse outro lugar (ver
    // AuthProvider no Web e revocation-bus no Mobile).
    const { count: revokedPriorSessions } =
      await this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'NEW_LOGIN' },
      });
    if (revokedPriorSessions > 0) {
      this.logger.warn(
        `Login em novo dispositivo (${dto.deviceId}) revogou ${revokedPriorSessions} sessão(ões) anterior(es) do usuário ${user.id} — sessão única por usuário.`,
      );
    }

    const tokens = await this.issueTokenPair({
      sub: user.id,
      organizationId: user.organizationId,
      role: user.role,
      deviceId: dto.deviceId,
    });

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        deviceId: dto.deviceId,
        deviceName: dto.deviceName,
        platform: dto.platform,
        tokenHash: this.hashToken(tokens.refreshToken),
        expiresAt: new Date(Date.now() + parseDurationMs(this.refreshTtl())),
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      tokens,
    };
  }

  async refresh(dto: RefreshDto): Promise<TokenPair> {
    const tokenHash = this.hashToken(dto.refreshToken);
    const existing = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, deviceId: dto.deviceId },
    });

    if (!existing) {
      throw new UnauthorizedException({
        code: 'TOKEN_EXPIRED',
        message: 'Refresh token inválido.',
      });
    }

    if (existing.revokedAt) {
      if (existing.revokeReason === 'ROTATED') {
        // Reuse detection (ver 2.2): alguém tentou reusar um refresh token já
        // rotacionado — sinal de possível roubo. Revoga TODAS as sessões do device.
        await this.prisma.refreshToken.updateMany({
          where: { deviceId: dto.deviceId, revokedAt: null },
          data: { revokedAt: new Date(), revokeReason: 'REUSE_DETECTED' },
        });
        this.logger.warn(
          `REUSE_DETECTED — refresh token já rotacionado foi reenviado; todas as sessões do dispositivo ${dto.deviceId} (usuário ${existing.userId}) foram revogadas`,
        );
      }
      throw new UnauthorizedException({
        code: 'TOKEN_REVOKED',
        message: 'Sessão revogada.',
      });
    }

    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'TOKEN_EXPIRED',
        message: 'Refresh token expirado.',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: existing.userId },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: 'TOKEN_REVOKED',
        message: 'Usuário inativo.',
      });
    }

    const tokens = await this.issueTokenPair({
      sub: user.id,
      organizationId: user.organizationId,
      role: user.role,
      deviceId: dto.deviceId,
    });
    const newTokenHash = this.hashToken(tokens.refreshToken);

    await this.prisma.$transaction([
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          deviceId: dto.deviceId,
          deviceName: existing.deviceName,
          platform: existing.platform,
          tokenHash: newTokenHash,
          expiresAt: new Date(Date.now() + parseDurationMs(this.refreshTtl())),
        },
      }),
      this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: {
          revokedAt: new Date(),
          revokeReason: 'ROTATED',
          replacedByTokenHash: newTokenHash,
        },
      }),
    ]);

    return tokens;
  }

  async logout(dto: LogoutDto): Promise<void> {
    const tokenHash = this.hashToken(dto.refreshToken);
    const existing = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, deviceId: dto.deviceId, revokedAt: null },
    });

    if (existing) {
      await this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), revokeReason: 'MANUAL' },
      });
    }
  }

  async listSessions(requester: JwtPayload) {
    // Além das próprias sessões, inclui as de usuários da mesma organização
    // hierarquicamente abaixo do requester (mesma regra do revokeSession
    // abaixo) — sem isso, a revogação cross-user já suportada ali ficava
    // inalcançável pela UI (não havia como descobrir o deviceId de outra
    // pessoa). É o que faz o celular de um PESQUISADOR aparecer na aba de
    // Sessões de um GESTOR/ADMINISTRADOR, por exemplo.
    const orgUsers = await this.prisma.user.findMany({
      where: { organizationId: requester.organizationId },
      select: { id: true, name: true, role: true },
    });
    const visibleUserIds = orgUsers
      .filter(
        (u) =>
          u.id === requester.sub ||
          roleLevel(u.role) > roleLevel(requester.role),
      )
      .map((u) => u.id);
    const nameById = new Map(orgUsers.map((u) => [u.id, u.name]));

    const activeSessions = await this.prisma.refreshToken.findMany({
      where: { userId: { in: visibleUserIds }, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return {
      sessions: activeSessions.map((session) => ({
        id: session.id,
        deviceId: session.deviceId,
        deviceName: session.deviceName,
        platform: session.platform,
        // Aproximação: não rastreamos "última requisição" por sessão,
        // usamos a emissão/rotação do refresh token mais recente como proxy.
        lastSeenAt: session.createdAt,
        current: session.deviceId === requester.deviceId,
        owner: {
          id: session.userId,
          name: nameById.get(session.userId) ?? session.userId,
        },
        isOwnSession: session.userId === requester.sub,
      })),
    };
  }

  async revokeSession(
    requester: JwtPayload,
    targetDeviceId: string,
  ): Promise<void> {
    const activeSessions = await this.prisma.refreshToken.findMany({
      where: { deviceId: targetDeviceId, revokedAt: null },
    });

    if (activeSessions.length === 0) {
      return; // já não há sessão ativa para esse dispositivo — idempotente
    }

    const targetUserId = activeSessions[0].userId;

    if (targetUserId !== requester.sub) {
      const target = await this.prisma.user.findUnique({
        where: { id: targetUserId },
      });
      if (!target || roleLevel(requester.role) >= roleLevel(target.role)) {
        throw new ForbiddenException({
          code: 'PERMISSION_DENIED',
          message:
            'Não é possível revogar a sessão de um usuário do mesmo nível hierárquico ou acima.',
        });
      }
    }

    await this.prisma.refreshToken.updateMany({
      where: { deviceId: targetDeviceId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'MANUAL' },
    });
    this.logger.warn(
      `Sessão revogada manualmente: dispositivo ${targetDeviceId} (usuário ${targetUserId}) por ${requester.sub}`,
    );
  }

  private async issueTokenPair(payload: JwtPayload): Promise<TokenPair> {
    const accessTtl = this.configService.get<string>(
      'JWT_ACCESS_EXPIRES_IN',
      '15m',
    );
    const expiresIn = Math.floor(parseDurationMs(accessTtl) / 1000);
    const accessToken = await this.jwtService.signAsync(payload, { expiresIn });
    const refreshToken = randomBytes(48).toString('hex');

    return { accessToken, refreshToken, expiresIn };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshTtl(): string {
    return this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
  }

  static hashPassword(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }
}
