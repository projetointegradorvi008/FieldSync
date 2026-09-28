import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { parseDurationMs } from './duration.util';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { HierarchyGuard } from './guards/hierarchy.guard';

// Módulo de autenticação: registra o JwtModule com o segredo/tempo de
// expiração lidos do .env, e exporta os guards de auth para os outros
// módulos (Users, Surveys, etc.) poderem protegê-los.
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: Math.floor(
            parseDurationMs(
              config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
            ) / 1000,
          ),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard, HierarchyGuard],
  exports: [AuthService, JwtAuthGuard, RolesGuard, HierarchyGuard, JwtModule],
})
export class AuthModule {}
