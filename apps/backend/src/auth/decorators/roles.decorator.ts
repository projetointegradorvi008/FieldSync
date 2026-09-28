import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

// Decorator de metadados: `@Roles('ADMINISTRADOR', 'GESTOR')` numa rota marca
// quais perfis podem acessá-la; o RolesGuard lê esse metadado em tempo de
// requisição para decidir se libera ou bloqueia.
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
