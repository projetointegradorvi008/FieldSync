import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { HierarchyGuard } from '../auth/guards/hierarchy.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/jwt-payload';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

// CRUD de usuários. Toda rota exige um JWT válido (JwtAuthGuard) e um perfil
// autorizado (RolesGuard + @Roles); editar um usuário específico também
// passa pelo HierarchyGuard (não é possível alterar alguém do mesmo nível
// hierárquico ou acima — ver role-hierarchy.ts).
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ADMINISTRADOR, UserRole.GESTOR, UserRole.SUPERVISOR)
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListUsersQueryDto,
  ) {
    return this.usersService.findAll(user, query);
  }

  // Defesa em profundidade: já exige ADMINISTRADOR/SUPERVISOR autenticado,
  // mas criação de usuário é uma ação pouco frequente — um limite dedicado,
  // abaixo do global (100/min), reduz o efeito de uma conta comprometida
  // sendo usada para criar contas em massa.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @Roles(UserRole.ADMINISTRADOR, UserRole.SUPERVISOR)
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateUserDto) {
    return this.usersService.create(user, dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMINISTRADOR, UserRole.GESTOR, UserRole.SUPERVISOR)
  @UseGuards(HierarchyGuard)
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMINISTRADOR, UserRole.SUPERVISOR)
  @UseGuards(HierarchyGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.usersService.remove(user, id);
  }
}
