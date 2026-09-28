import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validate } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SurveysModule } from './surveys/surveys.module';
import { SyncModule } from './sync/sync.module';
import { QueueModule } from './queue/queue.module';
import { ConflictsModule } from './conflicts/conflicts.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    // Rate limiting global (revisão OWASP/A05). Endpoints
    // sensíveis (login, /sync) sobrescrevem com limites mais específicos via
    // @Throttle nos próprios controllers.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    SurveysModule,
    SyncModule,
    QueueModule,
    ConflictsModule,
    AnalyticsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
