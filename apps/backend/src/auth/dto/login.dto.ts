import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

// Corpo esperado por POST /auth/login. deviceId/deviceName/platform
// identificam o dispositivo para a gestão de sessões (GET/DELETE /auth/sessions).
export class LoginDto {
  @IsString()
  email: string;

  @IsString()
  password: string;

  @IsString()
  @MinLength(1)
  deviceId: string;

  @IsOptional()
  @IsString()
  deviceName?: string;

  @IsOptional()
  @IsIn(['android', 'ios', 'web'])
  platform?: string;
}
