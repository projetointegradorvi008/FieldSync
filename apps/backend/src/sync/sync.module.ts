import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '../queue/queue.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

// Importa QueueModule porque um sync que gera conflito publica um job na
// fila (ver QueueService.notifyConflictDetected em sync.service.ts).
@Module({
  imports: [AuthModule, QueueModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
