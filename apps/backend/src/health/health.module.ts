import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

// GET /health/detailed (verificação de DB/storage, protegida por Guards)
// ainda não foi implementada — ver 5.8 na spec.
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
