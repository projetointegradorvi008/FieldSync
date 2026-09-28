import { UserRole } from '@prisma/client';

// Formato do conteúdo assinado dentro de um JWT de acesso emitido por
// AuthService.issueTokenPair. É o mesmo formato lido de volta pelo JwtAuthGuard.
export interface JwtPayload {
  sub: string; // user id
  organizationId: string;
  role: UserRole;
  deviceId: string;
}
