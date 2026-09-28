import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';

// Exporta QueueService para SyncModule (notificação de conflito) e
// AnalyticsModule (leitura do último refresh de KPIs).
@Module({
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
