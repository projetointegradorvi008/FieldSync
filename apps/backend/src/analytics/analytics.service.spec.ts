import { NotFoundException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

// Testes unitários com um PrismaService "falso" (jest.fn() em cada método
// usado) — não conectam a um banco real; isso é feito pelos testes de
// integração em apps/backend/test/. Cobre getResponseDetail, byResearcher,
// byPeriod, locations e exportData (com/sem PII e o formato do CSV).
function createPrismaMock() {
  return {
    survey: { findFirst: jest.fn() },
    response: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    user: { findMany: jest.fn() },
    auditLog: { create: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

const GESTOR = {
  sub: 'gestor-1',
  organizationId: 'org-1',
  role: 'GESTOR' as const,
  deviceId: 'gestor-device',
};

describe('AnalyticsService', () => {
  it('throws SURVEY_NOT_FOUND for a survey outside the requester organization', async () => {
    const prisma = createPrismaMock();
    prisma.survey.findFirst.mockResolvedValue(null);

    const service = new AnalyticsService(prisma as any);
    await expect(service.getKpis(GESTOR, 'survey-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns zeroed KPIs when the survey has no responses yet', async () => {
    const prisma = createPrismaMock();
    prisma.survey.findFirst.mockResolvedValue({ id: 'survey-1' });
    prisma.response.groupBy.mockResolvedValue([]);
    prisma.response.findFirst.mockResolvedValue(null);
    prisma.response.findMany.mockResolvedValue([]);

    const service = new AnalyticsService(prisma as any);
    const result = await service.getKpis(GESTOR, 'survey-1');

    expect(result.data).toEqual(
      expect.objectContaining({
        surveyId: 'survey-1',
        totalResponses: 0,
        synced: 0,
        conflicts: 0,
        errors: 0,
        activeResearchers: 0,
        completionRate: 0,
        lastResponseAt: null,
      }),
    );
  });

  it('computes completionRate live from responses (instant, not via a stale materialized view) and counts distinct active researchers', async () => {
    const prisma = createPrismaMock();
    prisma.survey.findFirst.mockResolvedValue({ id: 'survey-1' });
    prisma.response.groupBy.mockResolvedValue([
      { status: 'SYNCED', _count: { _all: 8 } },
      { status: 'CONFLICT', _count: { _all: 1 } },
      { status: 'ERROR', _count: { _all: 1 } },
    ]);
    prisma.response.findFirst.mockResolvedValue({
      syncedAt: new Date('2024-08-15T13:45:00.000Z'),
    });
    prisma.response.findMany.mockResolvedValue([
      { researcherId: 'r1' },
      { researcherId: 'r2' },
    ]);

    const service = new AnalyticsService(prisma as any);
    const result = await service.getKpis(GESTOR, 'survey-1');

    expect(result.data.totalResponses).toBe(10);
    expect(result.data.synced).toBe(8);
    expect(result.data.completionRate).toBe(0.8);
    expect(result.data.activeResearchers).toBe(2);
    expect(result.data.lastResponseAt).toEqual(
      new Date('2024-08-15T13:45:00.000Z'),
    );
  });

  describe('getResponseDetail', () => {
    it('throws RESPONSE_NOT_FOUND when the response does not belong to the survey', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({ id: 'survey-1' });
      prisma.response.findFirst.mockResolvedValue(null);

      const service = new AnalyticsService(prisma as any);
      await expect(
        service.getResponseDetail(GESTOR, 'survey-1', 'resp-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns the full response with answers and location', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({ id: 'survey-1' });
      prisma.response.findFirst.mockResolvedValue({
        id: 'resp-1',
        answers: [
          { value: 'Manhã', question: { externalId: 'q1', label: 'Turno' } },
        ],
      });

      const service = new AnalyticsService(prisma as any);
      const result = await service.getResponseDetail(
        GESTOR,
        'survey-1',
        'resp-1',
      );

      expect(result.data.id).toBe('resp-1');
      expect(prisma.response.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'resp-1', surveyId: 'survey-1' },
        }),
      );
    });
  });

  describe('byResearcher', () => {
    it('pivots groupBy(researcherId, status) rows into per-researcher totals', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({ id: 'survey-1' });
      prisma.response.groupBy.mockResolvedValue([
        { researcherId: 'r1', status: 'SYNCED', _count: { _all: 5 } },
        { researcherId: 'r1', status: 'CONFLICT', _count: { _all: 1 } },
        { researcherId: 'r2', status: 'SYNCED', _count: { _all: 3 } },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'r1', name: 'Ana' },
        { id: 'r2', name: 'Bruno' },
      ]);

      const service = new AnalyticsService(prisma as any);
      const result = await service.byResearcher(GESTOR, 'survey-1', {});

      expect(result.data).toEqual(
        expect.arrayContaining([
          {
            researcherId: 'r1',
            researcherName: 'Ana',
            total: 6,
            synced: 5,
            conflicts: 1,
            errors: 0,
          },
          {
            researcherId: 'r2',
            researcherName: 'Bruno',
            total: 3,
            synced: 3,
            conflicts: 0,
            errors: 0,
          },
        ]),
      );
    });
  });

  describe('byPeriod', () => {
    it('maps date_trunc buckets into numeric counts', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({ id: 'survey-1' });
      prisma.$queryRaw.mockResolvedValue([
        {
          bucket: new Date('2024-08-15T00:00:00.000Z'),
          total: 4n,
          synced: 3n,
          conflicts: 1n,
          errors: 0n,
        },
      ]);

      const service = new AnalyticsService(prisma as any);
      const result = await service.byPeriod(GESTOR, 'survey-1', {
        groupBy: 'day',
      });

      expect(result.data).toEqual([
        {
          period: '2024-08-15T00:00:00.000Z',
          total: 4,
          synced: 3,
          conflicts: 1,
          errors: 0,
        },
      ]);
    });
  });

  describe('locations', () => {
    it('only returns responses that have a location, projecting lat/lng', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({ id: 'survey-1' });
      prisma.response.findMany.mockResolvedValue([
        {
          id: 'resp-1',
          status: 'SYNCED',
          collectedAt: new Date('2024-08-15T09:30:00.000Z'),
          researcher: { id: 'r1', name: 'Ana' },
          location: { latitude: -23.55052, longitude: -46.633308 },
        },
      ]);

      const service = new AnalyticsService(prisma as any);
      const result = await service.locations(GESTOR, 'survey-1', {});

      expect(prisma.response.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ location: { isNot: null } }),
        }),
      );
      expect(result.data).toEqual([
        {
          responseId: 'resp-1',
          latitude: -23.55052,
          longitude: -46.633308,
          collectedAt: new Date('2024-08-15T09:30:00.000Z'),
          researcher: { id: 'r1', name: 'Ana' },
          status: 'SYNCED',
        },
      ]);
    });
  });

  describe('exportData', () => {
    function mockResponsesForExport(
      prisma: ReturnType<typeof createPrismaMock>,
    ) {
      prisma.response.findMany.mockResolvedValue([
        {
          id: 'resp-1',
          respondentId: 'Maria',
          status: 'SYNCED',
          collectedAt: new Date('2024-08-15T09:30:00.000Z'),
          syncedAt: new Date('2024-08-15T09:31:00.000Z'),
          researcher: { name: 'Ana' },
          location: { latitude: -23.5, longitude: -46.6 },
          answers: [
            { value: 'Manhã', question: { externalId: 'q1', label: 'Turno' } },
          ],
        },
      ]);
    }

    it('never includes respondentId (PII) by default and does not write an AuditLog', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({ id: 'survey-1' });
      mockResponsesForExport(prisma);

      const service = new AnalyticsService(prisma as any);
      const result = await service.exportData(GESTOR, 'survey-1', {
        format: 'json',
      } as any);

      expect(result.format).toBe('json');
      if (result.format === 'json') {
        expect(result.data[0]).not.toHaveProperty('respondentId');
      }
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('includes respondentId and writes an AuditLog when includePii is explicitly set', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({ id: 'survey-1' });
      mockResponsesForExport(prisma);

      const service = new AnalyticsService(prisma as any);
      const result = await service.exportData(GESTOR, 'survey-1', {
        format: 'json',
        includePii: true,
      } as any);

      expect(result.format).toBe('json');
      if (result.format === 'json') {
        expect(result.data[0]).toMatchObject({ respondentId: 'Maria' });
      }
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'gestor-1',
            action: 'EXPORT_WITH_PII',
            entityType: 'Survey',
            entityId: 'survey-1',
          }),
        }),
      );
    });

    it('builds a semicolon-separated CSV with a UTF-8 BOM and one column per answer label', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({ id: 'survey-1' });
      mockResponsesForExport(prisma);

      const service = new AnalyticsService(prisma as any);
      const result = await service.exportData(GESTOR, 'survey-1', {
        format: 'csv',
      } as any);

      expect(result.format).toBe('csv');
      if (result.format === 'csv') {
        expect(result.csv.charCodeAt(0)).toBe(0xfeff);
        expect(result.csv).toContain('Turno');
        expect(result.csv).toContain('Manhã');
        expect(result.csv).not.toContain('Maria');
      }
    });

    it('neutralizes formula-injection payloads in answer values in the CSV export', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({ id: 'survey-1' });
      prisma.response.findMany.mockResolvedValue([
        {
          id: 'resp-1',
          respondentId: 'Maria',
          status: 'SYNCED',
          collectedAt: new Date('2024-08-15T09:30:00.000Z'),
          syncedAt: new Date('2024-08-15T09:31:00.000Z'),
          researcher: { name: 'Ana' },
          location: { latitude: -23.5, longitude: -46.6 },
          answers: [
            {
              value: '=cmd()',
              question: { externalId: 'q1', label: 'Observação' },
            },
          ],
        },
      ]);

      const service = new AnalyticsService(prisma as any);
      const result = await service.exportData(GESTOR, 'survey-1', {
        format: 'csv',
      } as any);

      expect(result.format).toBe('csv');
      if (result.format === 'csv') {
        expect(result.csv).toContain("'=cmd()");
        expect(result.csv).not.toMatch(/;=cmd\(\)/);
      }
    });
  });
});
