import { NotFoundException } from '@nestjs/common';
import { ConflictsService } from './conflicts.service';

// Testes unitários de ConflictsService com um PrismaService "falso".
function createPrismaMock() {
  return {
    conflictRecord: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    response: {
      findUniqueOrThrow: jest.fn(),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

const GESTOR = {
  sub: 'gestor-1',
  organizationId: 'org-1',
  role: 'GESTOR' as const,
  deviceId: 'gestor-device',
};

describe('ConflictsService', () => {
  describe('list', () => {
    it('scopes the query to the requester organization and PENDING status', async () => {
      const prisma = createPrismaMock();
      prisma.conflictRecord.findMany.mockResolvedValue([]);
      prisma.conflictRecord.count.mockResolvedValue(0);

      const service = new ConflictsService(prisma as any);
      await service.list(GESTOR, { page: 1, limit: 20 });

      expect(prisma.conflictRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
            response: expect.objectContaining({
              survey: { organizationId: 'org-1' },
            }),
          }),
        }),
      );
    });

    it('adds a surveyId filter when provided', async () => {
      const prisma = createPrismaMock();
      prisma.conflictRecord.findMany.mockResolvedValue([]);
      prisma.conflictRecord.count.mockResolvedValue(0);

      const service = new ConflictsService(prisma as any);
      await service.list(GESTOR, {
        page: 1,
        limit: 20,
        surveyId: 'survey-1',
      });

      expect(prisma.conflictRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            response: expect.objectContaining({ surveyId: 'survey-1' }),
          }),
        }),
      );
    });
  });

  describe('resolve', () => {
    it('throws CONFLICT_NOT_FOUND for a conflict outside the requester organization', async () => {
      const prisma = createPrismaMock();
      prisma.conflictRecord.findFirst.mockResolvedValue(null);

      const service = new ConflictsService(prisma as any);
      await expect(
        service.resolve(GESTOR, 'conflict-1', { action: 'KEEP_FIRST' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.conflictRecord.update).not.toHaveBeenCalled();
    });

    it('records the resolution decision without mutating the underlying responses', async () => {
      const prisma = createPrismaMock();
      prisma.conflictRecord.findFirst.mockResolvedValue({ id: 'conflict-1' });
      prisma.conflictRecord.update.mockResolvedValue({
        id: 'conflict-1',
        status: 'RESOLVED',
      });

      const service = new ConflictsService(prisma as any);
      await service.resolve(GESTOR, 'conflict-1', {
        action: 'KEEP_SECOND',
      } as any);

      expect(prisma.conflictRecord.update).toHaveBeenCalledWith({
        where: { id: 'conflict-1' },
        data: expect.objectContaining({
          status: 'RESOLVED',
          resolution: 'KEEP_SECOND',
          resolvedById: 'gestor-1',
        }),
      });
    });
  });

  describe('getOne', () => {
    it('throws CONFLICT_NOT_FOUND for a conflict outside the requester organization', async () => {
      const prisma = createPrismaMock();
      prisma.conflictRecord.findFirst.mockResolvedValue(null);

      const service = new ConflictsService(prisma as any);
      await expect(service.getOne(GESTOR, 'conflict-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns both responses (response and conflictWith) with their answers', async () => {
      const prisma = createPrismaMock();
      prisma.conflictRecord.findFirst.mockResolvedValue({
        id: 'conflict-1',
        status: 'PENDING',
        resolution: null,
        resolvedById: null,
        resolvedAt: null,
        detectedAt: new Date('2024-08-15T10:00:00.000Z'),
        responseId: 'resp-1',
        conflictWithId: 'resp-2',
      });
      prisma.response.findUniqueOrThrow
        .mockResolvedValueOnce({ id: 'resp-1', answers: [] })
        .mockResolvedValueOnce({ id: 'resp-2', answers: [] });

      const service = new ConflictsService(prisma as any);
      const result = await service.getOne(GESTOR, 'conflict-1');

      expect(result.response).toEqual({ id: 'resp-1', answers: [] });
      expect(result.conflictWith).toEqual({ id: 'resp-2', answers: [] });
    });
  });
});
