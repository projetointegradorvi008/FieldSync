import { IsString } from 'class-validator';

// Corpo esperado por POST /auth/logout: identifica qual refresh token
// (e de qual dispositivo) deve ser revogado.
export class LogoutDto {
  @IsString()
  refreshToken: string;

  @IsString()
  deviceId: string;
}
