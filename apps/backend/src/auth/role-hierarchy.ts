import { UserRole } from '@prisma/client';

// Nível hierárquico dos perfis — ver 1.5/2.2 na spec.
// Quanto menor o número, maior o privilégio. ROOT nunca é atribuído via API.
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  ROOT: 0,
  ADMINISTRADOR: 1,
  GESTOR: 2,
  SUPERVISOR: 3,
  PESQUISADOR: 4,
  VISUALIZADOR: 4,
};

export function roleLevel(role: UserRole): number {
  return ROLE_HIERARCHY[role];
}
