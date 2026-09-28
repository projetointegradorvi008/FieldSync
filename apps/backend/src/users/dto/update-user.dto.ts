import { UserRole } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

// Corpo esperado por PATCH /users/:id. Todos os campos são opcionais
// (atualização parcial); UsersService.update bloqueia alterar role/isActive
// do próprio usuário e promover alguém a um nível igual ou acima do solicitante.
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
