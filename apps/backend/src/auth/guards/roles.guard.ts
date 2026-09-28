import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtPayload } from '../jwt-payload';

// Lê os perfis exigidos por `@Roles(...)` na rota (via Reflector) e compara
// com o perfil do usuário autenticado (já anexado pelo JwtAuthGuard, que
// deve rodar antes deste guard). Sem `@Roles(...)` na rota, libera geral.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user: JwtPayload }>();

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Perfil sem permissão.',
      });
    }

    return true;
  }
}
