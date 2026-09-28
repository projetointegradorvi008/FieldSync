import { SyncService } from './sync.service';

// Testes unitários do motor de sincronização com um PrismaService "falso"
// (incluindo o mock da transação `tx` usada dentro de syncOne). Cobre os
// Contratos C2 (conflito), C3 (versão do formulário) e C4 (relógio) em
// isolamento; o cenário ponta a ponta contra um Postgres real está em
// apps/backend/test/sync.e2e-spec.ts.
function createPrismaMock() {
  const tx = {
    response: { create: jest.fn() },
    answer: { createMany: jest.fn() },
    location: { create: jest.fn() },
    syncRecord: { create: jest.fn() },
    conflictRecord: {
      create: jest.fn().mockResolvedValue({ id: 'conflict-1' }),
    },
    $executeRaw: jest.fn(),
  };

  return {
    tx,
    device: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'device-db-1' }),
    },
    // findUnique = checagem de idempotência; findMany = candidatos a
    // conflito (C2, mesmo collectedAt) — sem mock explícito por teste,
    // resolve para `[]` e nenhum candidato bate.
    response: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    surveyVersion: { findUnique: jest.fn() },
    survey: { findFirst: jest.fn() },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  };
}

function createQueueMock() {
  return { notifyConflictDetected: jest.fn() };
}

const PESQUISADOR = {
  sub: 'researcher-1',
  organizationId: 'org-1',
  role: 'PESQUISADOR' as const,
  deviceId: 'device-1',
};

const GESTOR = {
  sub: 'gestor-1',
  organizationId: 'org-1',
  role: 'GESTOR' as const,
  deviceId: 'device-gestor',
};

const BASE_ITEM = {
  id: 'resp-1',
  surveyVersionId: 'version-1',
  collectedAt: new Date().toISOString(),
  answers: { q1: 'valor' },
};

const SURVEY_VERSION = {
  id: 'version-1',
  surveyId: 'survey-1',
  publishedAt: new Date(Date.now() - 1000 * 60 * 60), // 1h atrás
  questions: [
    { id: 'q-db-1', externalId: 'q1', isRequired: true },
    { id: 'q-db-2', externalId: 'q2', isRequired: false },
  ],
};

describe('SyncService', () => {
  describe('sync — idempotência e resolução de device', () => {
    it('returns ALREADY_SYNCED without touching the transaction when the response id already exists', async () => {
      const prisma = createPrismaMock();
      const queue = createQueueMock();
      prisma.device.findUnique.mockResolvedValue({ id: 'device-db-1' });
      prisma.response.findUnique.mockResolvedValue({ id: 'resp-1' });

      const service = new SyncService(prisma as any, queue as any);
      const result = await service.sync(PESQUISADOR, {
        deviceId: 'device-1',
        responses: [BASE_ITEM],
      } as any);

      expect(result.results).toEqual([
        { id: 'resp-1', status: 'ALREADY_SYNCED' },
      ]);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('creates a new Device row when the deviceIdentifier is not yet known', async () => {
      const prisma = createPrismaMock();
      const queue = createQueueMock();
      prisma.device.findUnique.mockResolvedValue(null);
      prisma.device.create.mockResolvedValue({ id: 'device-db-new' });
      prisma.response.findUnique.mockResolvedValue({ id: 'resp-1' });

      const service = new SyncService(prisma as any, queue as any);
      await service.sync(PESQUISADOR, {
        deviceId: 'brand-new-device',
        responses: [BASE_ITEM],
      } as any);

      expect(prisma.device.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            userId: 'researcher-1',
            deviceIdentifier: 'brand-new-device',
          }),
        }),
      );
    });
  });

  describe('sync — Contrato C4 (validação de relógio)', () => {
    it('rejects a collectedAt more than 24h in the future with INVALID_TIMESTAMP', async () => {
      const prisma = createPrismaMock();
      const queue = createQueueMock();
      prisma.device.findUnique.mockResolvedValue({ id: 'device-db-1' });
      prisma.response.findUnique.mockResolvedValue(null);

      const service = new SyncService(prisma as any, queue as any);
      const result = await service.sync(PESQUISADOR, {
        deviceId: 'device-1',
        responses: [
          {
            ...BASE_ITEM,
            collectedAt: new Date(
              Date.now() + 25 * 60 * 60 * 1000,
            ).toISOString(),
          },
        ],
      } as any);

      expect(result.results).toEqual([
        { id: 'resp-1', status: 'ERROR', reason: 'INVALID_TIMESTAMP' },
      ]);
    });

    it('rejects a collectedAt earlier than the SurveyVersion publishedAt with INVALID_TIMESTAMP', async () => {
      const prisma = createPrismaMock();
      const queue = createQueueMock();
      prisma.device.findUnique.mockResolvedValue({ id: 'device-db-1' });
      prisma.response.findUnique.mockResolvedValue(null);
      prisma.surveyVersion.findUnique.mockResolvedValue(SURVEY_VERSION);

      const service = new SyncService(prisma as any, queue as any);
      const result = await service.sync(PESQUISADOR, {
        deviceId: 'device-1',
        responses: [
          {
            ...BASE_ITEM,
            collectedAt: new Date(
              SURVEY_VERSION.publishedAt.getTime() - 1000,
            ).toISOString(),
          },
        ],
      } as any);

      expect(result.results).toEqual([
        { id: 'resp-1', status: 'ERROR', reason: 'INVALID_TIMESTAMP' },
      ]);
    });
  });

  describe('sync — Contrato C3 (versão do formulário)', () => {
    it('returns SURVEY_VERSION_NOT_FOUND when the declared surveyVersionId does not exist', async () => {
      const prisma = createPrismaMock();
      const queue = createQueueMock();
      prisma.device.findUnique.mockResolvedValue({ id: 'device-db-1' });
      prisma.response.findUnique.mockResolvedValue(null);
      prisma.surveyVersion.findUnique.mockResolvedValue(null);

      const service = new SyncService(prisma as any, queue as any);
      const result = await service.sync(PESQUISADOR, {
        deviceId: 'device-1',
        responses: [BASE_ITEM],
      } as any);

      expect(result.results).toEqual([
        { id: 'resp-1', status: 'ERROR', reason: 'SURVEY_VERSION_NOT_FOUND' },
      ]);
    });
  });

  describe('sync — autorização e validação de obrigatórios', () => {
    it('rejects a PESQUISADOR from a different organization with PERMISSION_DENIED', async () => {
      const prisma = createPrismaMock();
      const queue = createQueueMock();
      prisma.device.findUnique.mockResolvedValue({ id: 'device-db-1' });
      prisma.response.findUnique.mockResolvedValue(null);
      prisma.surveyVersion.findUnique.mockResolvedValue(SURVEY_VERSION);
      // Sem correspondência de organizationId — survey de outra organização.
      prisma.survey.findFirst.mockResolvedValue(null);

      const service = new SyncService(prisma as any, queue as any);
      const result = await service.sync(PESQUISADOR, {
        deviceId: 'device-1',
        responses: [BASE_ITEM],
      } as any);

      expect(result.results).toEqual([
        { id: 'resp-1', status: 'ERROR', reason: 'PERMISSION_DENIED' },
      ]);
    });

    it('accepts a PESQUISADOR who is NOT an assigned researcher, as long as the survey is in their organization', async () => {
      const prisma = createPrismaMock();
      const queue = createQueueMock();
      prisma.device.findUnique.mockResolvedValue({ id: 'device-db-1' });
      prisma.response.findUnique.mockResolvedValue(null);
      prisma.surveyVersion.findUnique.mockResolvedValue(SURVEY_VERSION);
      // Não está na lista de pesquisadores atribuídos, mas findFirst só
      // filtra por organizationId agora — encontra a pesquisa normalmente.
      prisma.survey.findFirst.mockResolvedValue({ id: 'survey-1' });

      const service = new SyncService(prisma as any, queue as any);
      const result = await service.sync(PESQUISADOR, {
        deviceId: 'device-1',
        responses: [BASE_ITEM],
      } as any);

      expect(prisma.survey.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-1' }),
        }),
      );
      expect(prisma.survey.findFirst.mock.calls[0][0].where).not.toHaveProperty(
        'researchers',
      );
      expect(result.results).toEqual([{ id: 'resp-1', status: 'SYNCED' }]);
    });

    it('does not check survey assignment for non-PESQUISADOR roles', async () => {
      const prisma = createPrismaMock();
      const queue = createQueueMock();
      prisma.device.findUnique.mockResolvedValue({ id: 'device-db-1' });
      prisma.response.findUnique.mockResolvedValue(null);
      prisma.surveyVersion.findUnique.mockResolvedValue(SURVEY_VERSION);

      const service = new SyncService(prisma as any, queue as any);
      const result = await service.sync(GESTOR, {
        deviceId: 'device-gestor',
        responses: [BASE_ITEM],
      } as any);

      expect(prisma.survey.findFirst).not.toHaveBeenCalled();
      expect(result.results).toEqual([{ id: 'resp-1', status: 'SYNCED' }]);
    });

    it('rejects a response missing an answer for a required question', async () => {
      const prisma = createPrismaMock();
      const queue = createQueueMock();
      prisma.device.findUnique.mockResolvedValue({ id: 'device-db-1' });
      prisma.response.findUnique.mockResolvedValue(null);
      prisma.surveyVersion.findUnique.mockResolvedValue(SURVEY_VERSION);
      prisma.survey.findFirst.mockResolvedValue({ id: 'survey-1' });

      const service = new SyncService(prisma as any, queue as any);
      const result = await service.sync(PESQUISADOR, {
        deviceId: 'device-1',
        responses: [{ ...BASE_ITEM, answers: {} }],
      } as any);

      expect(result.results).toEqual([
        { id: 'resp-1', status: 'ERROR', reason: 'MISSING_REQUIRED_ANSWER:q1' },
      ]);
    });

    it('requires `location` (not `answers`) to satisfy a required GPS question', async () => {
      const prisma = createPrismaMock();
      const queue = createQueueMock();
      prisma.device.findUnique.mockResolvedValue({ id: 'device-db-1' });
      prisma.response.findUnique.mockResolvedValue(null);
      prisma.surveyVersion.findUnique.mockResolvedValue({
        ...SURVEY_VERSION,
        questions: [
          { id: 'q-db-gps', externalId: 'q1', isRequired: true, type: 'GPS' },
        ],
      });
      prisma.survey.findFirst.mockResolvedValue({ id: 'survey-1' });

      const service = new SyncService(prisma as any, queue as any);

      const withoutLocation = await service.sync(PESQUISADOR, {
        deviceId: 'device-1',
        responses: [{ ...BASE_ITEM, answers: {} }],
      } as any);
      expect(withoutLocation.results).toEqual([
        { id: 'resp-1', status: 'ERROR', reason: 'MISSING_REQUIRED_ANSWER:q1' },
      ]);

      prisma.response.findUnique.mockResolvedValue(null);
      const withLocation = await service.sync(PESQUISADOR, {
        deviceId: 'device-1',
        responses: [
          {
            ...BASE_ITEM,
            answers: {},
            location: { latitude: -23.5, longitude: -46.6, accuracy: 8 },
          },
        ],
      } as any);
      expect(withLocation.results).toEqual([
        { id: 'resp-1', status: 'SYNCED' },
      ]);
    });
  });

  describe('sync — persistência de sucesso', () => {
    it('persists Response, Answer and SyncRecord, mapping externalId to the real Question id', async () => {
      const prisma = createPrismaMock();
      const queue = createQueueMock();
      prisma.device.findUnique.mockResolvedValue({ id: 'device-db-1' });
      prisma.response.findUnique.mockResolvedValue(null);
      prisma.surveyVersion.findUnique.mockResolvedValue(SURVEY_VERSION);
      prisma.survey.findFirst.mockResolvedValue({ id: 'survey-1' });

      const service = new SyncService(prisma as any, queue as any);
      const result = await service.sync(PESQUISADOR, {
        deviceId: 'device-1',
        responses: [
          {
            ...BASE_ITEM,
            location: { latitude: -23.5, longitude: -46.6, accuracy: 8.5 },
            answers: { q1: 'valor', q2: 'outro' },
          },
        ],
      } as any);

      expect(result.results).toEqual([{ id: 'resp-1', status: 'SYNCED' }]);
      expect(prisma.tx.response.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: 'resp-1',
            surveyId: 'survey-1',
            surveyVersionId: 'version-1',
            researcherId: 'researcher-1',
            deviceId: 'device-db-1',
            status: 'SYNCED',
          }),
        }),
      );
      expect(prisma.tx.answer.createMany).toHaveBeenCalledWith({
        data: [
          { responseId: 'resp-1', questionId: 'q-db-1', value: 'valor' },
          { responseId: 'resp-1', questionId: 'q-db-2', value: 'outro' },
        ],
      });
      expect(prisma.tx.location.create).toHaveBeenCalled();
      expect(prisma.tx.syncRecord.create).toHaveBeenCalledWith({
        data: {
          responseId: 'resp-1',
          surveyId: 'survey-1',
          deviceId: 'device-1',
          status: 'SYNCED',
        },
      });
    });
  });

  describe('sync — Contrato C2 (detecção de conflito, sem localização/respondentId como critério)', () => {
    it('persists with status CONFLICT, creates a ConflictRecord and notifies the queue when an existing response has the same collectedAt and identical answers', async () => {
      const prisma = createPrismaMock();
      const queue = createQueueMock();
      prisma.device.findUnique.mockResolvedValue({ id: 'device-db-1' });
      prisma.response.findUnique.mockResolvedValue(null);
      prisma.surveyVersion.findUnique.mockResolvedValue(SURVEY_VERSION);
      prisma.survey.findFirst.mockResolvedValue({ id: 'survey-1' });
      prisma.response.findMany.mockResolvedValue([
        {
          id: 'resp-original',
          answers: [{ questionId: 'q-db-1', value: 'valor' }],
        },
      ]);

      const service = new SyncService(prisma as any, queue as any);
      const result = await service.sync(PESQUISADOR, {
        deviceId: 'device-1',
        responses: [BASE_ITEM],
      } as any);

      expect(result.results).toEqual([
        { id: 'resp-1', status: 'CONFLICT', conflictId: 'conflict-1' },
      ]);
      expect(prisma.tx.response.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'CONFLICT' }),
        }),
      );
      expect(prisma.tx.conflictRecord.create).toHaveBeenCalledWith({
        data: { responseId: 'resp-1', conflictWithId: 'resp-original' },
      });
      expect(prisma.tx.syncRecord.create).toHaveBeenCalledWith({
        data: {
          responseId: 'resp-1',
          surveyId: 'survey-1',
          deviceId: 'device-1',
          status: 'CONFLICT',
        },
      });
      expect(queue.notifyConflictDetected).toHaveBeenCalledWith(
        'conflict-1',
        'survey-1',
      );
    });

    it('persists as SYNCED (no conflict) when an existing response has the same collectedAt but a different answer', async () => {
      const prisma = createPrismaMock();
      const queue = createQueueMock();
      prisma.device.findUnique.mockResolvedValue({ id: 'device-db-1' });
      prisma.response.findUnique.mockResolvedValue(null);
      prisma.surveyVersion.findUnique.mockResolvedValue(SURVEY_VERSION);
      prisma.survey.findFirst.mockResolvedValue({ id: 'survey-1' });
      prisma.response.findMany.mockResolvedValue([
        {
          id: 'resp-original',
          answers: [{ questionId: 'q-db-1', value: 'valor diferente' }],
        },
      ]);

      const service = new SyncService(prisma as any, queue as any);
      const result = await service.sync(PESQUISADOR, {
        deviceId: 'device-1',
        responses: [BASE_ITEM],
      } as any);

      expect(result.results).toEqual([{ id: 'resp-1', status: 'SYNCED' }]);
      expect(prisma.tx.conflictRecord.create).not.toHaveBeenCalled();
      expect(queue.notifyConflictDetected).not.toHaveBeenCalled();
    });

    it('does not flag as conflict two responses at the same location/respondent with different answers (location/respondentId are not criteria)', async () => {
      const prisma = createPrismaMock();
      const queue = createQueueMock();
      prisma.device.findUnique.mockResolvedValue({ id: 'device-db-1' });
      prisma.response.findUnique.mockResolvedValue(null);
      prisma.surveyVersion.findUnique.mockResolvedValue(SURVEY_VERSION);
      prisma.survey.findFirst.mockResolvedValue({ id: 'survey-1' });
      // Mesmo locationHash/respondentId do item enviado, mas resposta
      // diferente — não deve gerar conflito, já que só entram como
      // candidatos respostas com o mesmo collectedAt (nem chegam a ser
      // comparadas por localização/entrevistado).
      prisma.response.findMany.mockResolvedValue([]);

      const service = new SyncService(prisma as any, queue as any);
      const result = await service.sync(PESQUISADOR, {
        deviceId: 'device-1',
        responses: [
          {
            ...BASE_ITEM,
            locationHash: 'hash-abc',
            respondentId: 'resp-externo-1',
            location: { latitude: -23.5, longitude: -46.6, accuracy: 8 },
          },
        ],
      } as any);

      expect(result.results).toEqual([{ id: 'resp-1', status: 'SYNCED' }]);
      expect(prisma.response.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            surveyId: 'survey-1',
            collectedAt: new Date(BASE_ITEM.collectedAt),
          },
        }),
      );
      expect(prisma.tx.conflictRecord.create).not.toHaveBeenCalled();
      expect(queue.notifyConflictDetected).not.toHaveBeenCalled();
    });
  });
});
