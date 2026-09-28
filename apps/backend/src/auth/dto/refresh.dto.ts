import { IsString } from 'class-validator';

// Corpo esperado por POST /auth/refresh: troca um refresh token válido
// (ainda não revogado/expirado) por um novo par de tokens (rotação).
export class RefreshDto {
  @IsString()
  refreshToken: string;

  @IsString()
  deviceId: string;
}
