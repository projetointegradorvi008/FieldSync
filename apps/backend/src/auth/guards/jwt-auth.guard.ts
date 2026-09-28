import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../jwt-payload';

// Bloqueia qualquer rota decorada com `@UseGuards(JwtAuthGuard)` que não
// traga um `Authorization: Bearer <token>` válido; se válido, anexa o
// payload decodificado em `request.user` para os demais guards/decorators
// (RolesGuard, HierarchyGuard, @CurrentUser) usarem depois.
//
// Além de validar a assinatura/expiração do JWT, confirma que a sessão
// (userId + deviceId) ainda tem um refresh token não revogado: sem isso, um
// access token de até 15min continuaria funcionando normalmente num
// dispositivo cujo login foi revogado por um novo login em outro lugar —
// sessão única por usuário (ver AuthService.login) só é "imediata" se cada
// requisição, não só o refresh, checar a revogação.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException({
        code: 'TOKEN_EXPIRED',
        message: 'Token ausente.',
      });
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException({
        code: 'TOKEN_EXPIRED',
        message: 'Token inválido ou expirado.',
      });
    }

    const activeSession = await this.prisma.refreshToken.findFirst({
      where: {
        userId: payload.sub,
        deviceId: payload.deviceId,
        revokedAt: null,
      },
      select: { id: true },
    });
    if (!activeSession) {
      throw new UnauthorizedException({
        code: 'TOKEN_REVOKED',
        message: 'Sessão revogada.',
      });
    }

    request['user'] = payload;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
