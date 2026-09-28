import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { UserRole } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';

// Teste de integração do motor de sincronização (6.2): sobe a
// aplicação inteira contra um Postgres real e exercita POST /api/v1/sync
// via HTTP de ponta a ponta (login real incluso), sem mockar nada do
// Backend. Cria seus próprios dados isolados (organização/usuário/pesquisa
// com prefixo "e2e-sync-test") e limpa tudo ao final.
//
// IDs e e-mail são gerados por execução (randomUUID) em vez de literais
// fixos: se um `afterAll` de uma execução anterior não rodar até o fim
// (processo interrompido, falha no meio do teste), a próxima execução não
// deve colidir com violação de unicidade (P2002) contra o mesmo Postgres.
describe('POST /api/v1/sync (integração)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const orgId = randomUUID();
  const userId = randomUUID();
  const surveyId = randomUUID();
  const surveyVersionId = randomUUID();
  const questionId = randomUUID();
  const email = `e2e-sync-test-${randomUUID()}@fieldsync.dev`;
  const password = 'e2e-sync-test-password';

  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    const passwordHash = await AuthService.hashPassword(password);

    await prisma.organization.create({
      data: { id: orgId, name: 'E2E Sync Test Org', slug: 'e2e-sync-test-org' },
    });
    await prisma.user.create({
      data: {
        id: userId,
        organizationId: orgId,
        name: 'E2E Sync Test Researcher',
        email,
        passwordHash,
        role: UserRole.PESQUISADOR,
      },
    });
    await prisma.survey.create({
      data: {
        id: surveyId,
        organizationId: orgId,
        createdById: userId,
        title: 'E2E Sync Test Survey',
        currentVersion: 1,
      },
    });
    await prisma.surveyVersion.create({
      data: {
        id: surveyVersionId,
        surveyId,
        version: 1,
        publishedBy: userId,
        schema: { title: 'E2E Sync Test Survey', version: 1, sections: [] },
        questions: {
          create: [
            {
              id: questionId,
              externalId: 'q1',
              type: 'TEXT',
              label: 'Observação',
              isRequired: true,
              orderIndex: 0,
            },
          ],
        },
      },
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password, deviceId: 'e2e-sync-test-device' });
    accessToken = loginResponse.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.answer.deleteMany({
      where: { question: { surveyVersionId } },
    });
    await prisma.syncRecord.deleteMany({ where: { surveyId } });
    await prisma.location.deleteMany({ where: { response: { surveyId } } });
    await prisma.response.deleteMany({ where: { surveyId } });
    await prisma.question.deleteMany({ where: { surveyVersionId } });
    await prisma.surveyVersion.deleteMany({ where: { surveyId } });
    await prisma.survey.delete({ where: { id: surveyId } });
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.device.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await app.close();
  });

  it('persists a valid response and returns SYNCED', async () => {
    const responseId = '10000000-0000-4000-8000-000000000001';

    const response = await request(app.getHttpServer())
      .post('/api/v1/sync')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        deviceId: '20000000-0000-4000-8000-000000000001',
        responses: [
          {
            id: responseId,
            surveyVersionId,
            collectedAt: new Date().toISOString(),
            answers: { q1: 'resposta de teste' },
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.results).toEqual([
      { id: responseId, status: 'SYNCED' },
    ]);

    const persisted = await prisma.response.findUnique({
      where: { id: responseId },
      include: { answers: true },
    });
    expect(persisted).not.toBeNull();
    expect(persisted?.status).toBe('SYNCED');
    expect(persisted?.answers).toHaveLength(1);
  });

  it('is idempotent: resending the same UUID returns ALREADY_SYNCED without creating a duplicate', async () => {
    const responseId = '10000000-0000-4000-8000-000000000002';
    const payload = {
      deviceId: '20000000-0000-4000-8000-000000000002',
      responses: [
        {
          id: responseId,
          surveyVersionId,
          collectedAt: new Date().toISOString(),
          answers: { q1: 'primeira tentativa' },
        },
      ],
    };

    const first = await request(app.getHttpServer())
      .post('/api/v1/sync')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload);
    expect(first.body.results).toEqual([{ id: responseId, status: 'SYNCED' }]);

    const second = await request(app.getHttpServer())
      .post('/api/v1/sync')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload);
    expect(second.status).toBe(200);
    expect(second.body.results).toEqual([
      { id: responseId, status: 'ALREADY_SYNCED' },
    ]);

    const count = await prisma.response.count({ where: { id: responseId } });
    expect(count).toBe(1);
  });

  it('rejects an unknown surveyVersionId with SURVEY_VERSION_NOT_FOUND (C3)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/sync')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        deviceId: '20000000-0000-4000-8000-000000000003',
        responses: [
          {
            id: '10000000-0000-4000-8000-000000000003',
            surveyVersionId: '00000000-0000-4000-8000-000000000099',
            collectedAt: new Date().toISOString(),
            answers: {},
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.results).toEqual([
      {
        id: '10000000-0000-4000-8000-000000000003',
        status: 'ERROR',
        reason: 'SURVEY_VERSION_NOT_FOUND',
      },
    ]);
  });

  it('rejects a collectedAt more than 24h in the future with INVALID_TIMESTAMP (C4)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/sync')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        deviceId: '20000000-0000-4000-8000-000000000004',
        responses: [
          {
            id: '10000000-0000-4000-8000-000000000004',
            surveyVersionId,
            collectedAt: new Date(
              Date.now() + 48 * 60 * 60 * 1000,
            ).toISOString(),
            answers: { q1: 'x' },
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.results).toEqual([
      {
        id: '10000000-0000-4000-8000-000000000004',
        status: 'ERROR',
        reason: 'INVALID_TIMESTAMP',
      },
    ]);
  });

  it('rejects a request without a valid access token', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/sync')
      .send({
        deviceId: '20000000-0000-4000-8000-000000000005',
        responses: [],
      });

    expect(response.status).toBe(401);
  });
});
