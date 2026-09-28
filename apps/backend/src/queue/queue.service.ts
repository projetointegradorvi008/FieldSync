import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// `pg-boss` exporta via `module.exports = PgBoss` (CJS puro) e este projeto
// não tem `esModuleInterop` habilitado — `import PgBoss from 'pg-boss'`
// resolveria para `.default` (inexistente). A sintaxe `import ... = require`
// atribui o `module.exports` inteiro, funcionando nos dois casos.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- ver comentário acima
import PgBoss = require('pg-boss');
import { PrismaService } from '../prisma/prisma.service';

const CONFLICT_QUEUE = 'conflict-detected';
const KPI_REFRESH_QUEUE = 'refresh-kpis';

interface ConflictDetectedJob {
  conflictId: string;
  surveyId: string;
}

// Motor de filas do Módulo 2.8 — PostgreSQL via pg-boss, sem Redis adicional
// (mesmo banco do resto da aplicação). Usado para (a) enfileirar a
// notificação de conflito ao gestor (C2) e (b) o job agendado que
// atualiza a view materializada `mv_survey_kpis`. Não há canal de
// email/push no MVP — "notificar o gestor" é, por especificação, o próprio
// painel exibir os conflitos pendentes (GET /conflicts); o handler do job
// aqui é o ponto de extensão onde um canal real entraria no futuro.
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private boss: PgBoss | null = null;
  private lastKpiRefreshAt: Date | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    const boss = new PgBoss({
      connectionString: this.config.get<string>('DATABASE_URL'),
    });
    boss.on('error', (err) => this.logger.error('pg-boss error', err));
    await boss.start();
    this.boss = boss;

    await boss.createQueue(CONFLICT_QUEUE);
    await boss.createQueue(KPI_REFRESH_QUEUE);

    await boss.work<ConflictDetectedJob>(CONFLICT_QUEUE, async ([job]) => {
      this.logger.log(
        `Conflito detectado: conflictId=${job.data.conflictId} surveyId=${job.data.surveyId} — visível para o gestor em GET /conflicts.`,
      );
    });

    await boss.work(KPI_REFRESH_QUEUE, async () => {
      await this.prisma.$executeRawUnsafe(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_survey_kpis',
      );
      this.lastKpiRefreshAt = new Date();
    });

    const intervalMinutes = Number(
      this.config.get('KPI_REFRESH_INTERVAL_MINUTES', '5'),
    );
    await boss.schedule(KPI_REFRESH_QUEUE, `*/${intervalMinutes} * * * *`, {});
  }

  async onModuleDestroy(): Promise<void> {
    if (this.boss) await this.boss.stop();
  }

  async notifyConflictDetected(
    conflictId: string,
    surveyId: string,
  ): Promise<void> {
    if (!this.boss) return;
    await this.boss.send(CONFLICT_QUEUE, { conflictId, surveyId });
  }

  getLastKpiRefreshAt(): Date | null {
    return this.lastKpiRefreshAt;
  }
}
