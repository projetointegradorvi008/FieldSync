import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { JwtPayload } from '../auth/jwt-payload';
import { roleLevel } from '../auth/role-hierarchy';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// Nunca seleciona passwordHash — este é o único formato de usuário que sai
// da API em qualquer resposta (listagem, criação, edição).
const USER_LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  isRootAdmin: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(requester: JwtPayload, query: ListUsersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where = {
      organizationId: requester.organizationId,
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: 'asc' },
        select: USER_LIST_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async create(requester: JwtPayload, dto: CreateUserDto) {
    if (roleLevel(dto.role) <= roleLevel(requester.role)) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message:
          'Não é possível criar um usuário de nível igual ou acima do seu.',
      });
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Já existe um usuário com esse email.',
      });
    }

    const passwordHash = await AuthService.hashPassword(dto.password);

    return this.prisma.user.create({
      data: {
        organizationId: requester.organizationId,
        name: dto.name,
        email: dto.email,
        passwordHash,
        role: dto.role,
      },
      select: USER_LIST_SELECT,
    });
  }

  async update(requester: JwtPayload, targetId: string, dto: UpdateUserDto) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Usuário não encontrado.',
      });
    }

    const isSelf = requester.sub === targetId;

    if (isSelf && (dto.role !== undefined || dto.isActive !== undefined)) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message:
          'Não é possível alterar o próprio perfil (role) ou status (isActive).',
      });
    }

    if (
      !isSelf &&
      dto.role !== undefined &&
      roleLevel(dto.role) <= roleLevel(requester.role)
    ) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message:
          'Não é possível promover um usuário a um nível igual ou acima do seu.',
      });
    }

    // O usuário-raiz do bootstrap (seed) nunca pode ser desativado — nem por
    // si mesmo (já bloqueado acima por isSelf) nem por outro administrador.
    if (target.isRootAdmin && dto.isActive !== undefined) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Este usuário é protegido e não pode ser desativado.',
      });
    }

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: USER_LIST_SELECT,
    });

    // Desativar força o logout: revoga toda sessão ativa do usuário — o
    // próximo refresh/requisição (Web ou Mobile) recebe TOKEN_REVOKED e
    // derruba a sessão, mesmo que o app esteja aberto e ocioso.
    if (dto.isActive === false) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: targetId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'USER_DEACTIVATED' },
      });
    }

    return updated;
  }

  async remove(requester: JwtPayload, targetId: string): Promise<void> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Usuário não encontrado.',
      });
    }

    if (requester.sub === targetId) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Não é possível excluir a própria conta.',
      });
    }

    if (target.isRootAdmin) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Este usuário é protegido e não pode ser excluído.',
      });
    }

    if (roleLevel(target.role) <= roleLevel(requester.role)) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message:
          'Não é possível excluir um usuário do mesmo nível hierárquico ou acima.',
      });
    }

    // Só pesquisas CRIADAS pelo usuário ainda bloqueiam a exclusão — o FK de
    // Survey.createdById não tem onDelete: SetNull, e não faria sentido uma
    // pesquisa "sem dono". A alternativa nesse caso é desativar (isActive:
    // false, já suportado pelo update). Respostas COLETADAS pelo usuário
    // (Response.researcherId) já não bloqueiam mais: a pesquisa e as
    // respostas ficam intactas, só perdem a referência ao pesquisador (ver
    // onDelete: SetNull no schema).
    const createdSurveysCount = await this.prisma.survey.count({
      where: { createdById: targetId },
    });
    if (createdSurveysCount > 0) {
      throw new ConflictException({
        code: 'USER_HAS_DEPENDENT_DATA',
        message:
          'Não é possível excluir um usuário com pesquisas criadas — desative-o em vez disso.',
      });
    }

    // RefreshToken tem onDelete: Cascade; AuditLog, Response.researcherId e
    // Device.userId têm onDelete: SetNull — nenhuma limpeza manual é
    // necessária antes de apagar o usuário.
    await this.prisma.user.delete({ where: { id: targetId } });
  }
}
