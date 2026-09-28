import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { roleLevel } from '../role-hierarchy';
import { JwtPayload } from '../jwt-payload';

// Aplica a regra de hierarquia de perfis (ver 1.5/2.2 na spec) em endpoints que
// alteram OUTRO usuário identificado por :id na rota. Editar o próprio
// usuário (self) sempre passa — a regra só existe para gerenciar terceiros.
@Injectable()
export class HierarchyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user: JwtPayload; params: { id: string } }>();
    const requester = request.user;
    const targetId = request.params.id;

    if (requester.sub === targetId) {
      return true;
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Usuário não encontrado.',
      });
    }

    if (roleLevel(requester.role) >= roleLevel(target.role)) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message:
          'Não é possível gerenciar um usuário do mesmo nível hierárquico ou acima.',
      });
    }

    return true;
  }
}
