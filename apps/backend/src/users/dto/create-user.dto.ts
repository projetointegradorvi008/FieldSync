import { UserRole } from '@prisma/client';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';

// Corpo esperado por POST /users. A senha em texto puro só existe até o
// UsersService.create fazer o hash (Argon2id) — nunca é persistida assim.
export class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(UserRole)
  role: UserRole;
}
