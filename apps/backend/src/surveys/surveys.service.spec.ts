import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
// Testes unitários de SurveysService com um PrismaService "falso". Cobre
// CRUD básico, a regra de só editar em DRAFT, e a publicação de versão
// (validação de schema + desnormalização em Question/QuestionOption).
import { SurveysService } from './surveys.service';
import { validateSurveySchema } from './survey-schema.validator';

function createPrismaMock() {
  return {
    survey: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    surveyVersion: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    response: {
      count: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    conflictRecord: {
      deleteMany: jest.fn(),
    },
    syncRecord: {
      deleteMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
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

const ADMINISTRADOR = {
  sub: 'admin-1',
  organizationId: 'org-1',
  role: 'ADMINISTRADOR' as const,
  deviceId: 'admin-device',
};

const PESQUISADOR = {
  sub: 'researcher-1',
  organizationId: 'org-1',
  role: 'PESQUISADOR' as const,
  deviceId: 'researcher-device',
};

const VALID_SCHEMA = {
  title: 'Pesquisa de Satisfação',
  sections: [
    {
      id: 's1',
      title: 'Identificação',
      questions: [
        {
          id: 'q1',
          type: 'TEXT',
          label: 'Nome do entrevistado',
          required: false,
          orderIndex: 0,
        },
        {
          id: 'q2',
          type: 'SINGLE_CHOICE',
          label: 'Faixa etária',
          required: true,
          orderIndex: 1,
          config: { options: ['18-24', '25-34'] },
        },
      ],
    },
  ],
};

describe('validateSurveySchema — Contrato C1', () => {
  it('accepts a well-formed schema', () => {
    const result = validateSurveySchema(VALID_SCHEMA);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].questions).toHaveLength(2);
  });

  it('rejects a schema without sections', () => {
    expect(() => validateSurveySchema({ sections: [] })).toThrow(
      BadRequestException,
    );
  });

  it('rejects a schema with duplicate question ids', () => {
    const schema = {
      sections: [
        {
          id: 's1',
          questions: [
            {
              id: 'q1',
              type: 'TEXT',
              label: 'A',
              required: false,
              orderIndex: 0,
            },
            {
              id: 'q1',
              type: 'TEXT',
              label: 'B',
              required: false,
              orderIndex: 1,
            },
          ],
        },
      ],
    };
    expect(() => validateSurveySchema(schema)).toThrow(BadRequestException);
  });

  it('rejects a SINGLE_CHOICE question without config.options', () => {
    const schema = {
      sections: [
        {
          id: 's1',
          questions: [
            {
              id: 'q1',
              type: 'SINGLE_CHOICE',
              label: 'Faixa etária',
              required: true,
              orderIndex: 0,
            },
          ],
        },
      ],
    };
    expect(() => validateSurveySchema(schema)).toThrow(BadRequestException);
  });

  it('rejects a question with an empty label', () => {
    const schema = {
      sections: [
        {
          id: 's1',
          questions: [
            {
              id: 'q1',
              type: 'TEXT',
              label: '',
              required: false,
              orderIndex: 0,
            },
          ],
        },
      ],
    };
    expect(() => validateSurveySchema(schema)).toThrow(BadRequestException);
  });

  it('rejects an unknown question type', () => {
    const schema = {
      sections: [
        {
          id: 's1',
          questions: [
            {
              id: 'q1',
              type: 'CPF',
              label: 'Documento',
              required: true,
              orderIndex: 0,
            },
          ],
        },
      ],
    };
    expect(() => validateSurveySchema(schema)).toThrow(BadRequestException);
  });

  it('moves the isHeader section to the front regardless of authored order', () => {
    const schema = {
      sections: [
        {
          id: 's1',
          title: 'Avaliação',
          questions: [
            {
              id: 'q1',
              type: 'TEXT',
              label: 'Comentário',
              required: false,
              orderIndex: 0,
            },
          ],
        },
        {
          id: 's0',
          title: 'Identificação',
          isHeader: true,
          questions: [
            {
              id: 'q0',
              type: 'TEXT',
              label: 'Nome do pesquisador',
              required: true,
              orderIndex: 0,
            },
          ],
        },
      ],
    };
    const result = validateSurveySchema(schema);
    expect(result.sections[0].id).toBe('s0');
    expect(result.sections[0].isHeader).toBe(true);
    expect(result.sections[1].id).toBe('s1');
    expect(result.sections[1].isHeader).toBe(false);
  });

  it('rejects a schema with more than one isHeader section', () => {
    const schema = {
      sections: [
        {
          id: 's0',
          isHeader: true,
          questions: [
            {
              id: 'q0',
              type: 'TEXT',
              label: 'A',
              required: false,
              orderIndex: 0,
            },
          ],
        },
        {
          id: 's1',
          isHeader: true,
          questions: [
            {
              id: 'q1',
              type: 'TEXT',
              label: 'B',
              required: false,
              orderIndex: 0,
            },
          ],
        },
      ],
    };
    expect(() => validateSurveySchema(schema)).toThrow(BadRequestException);
  });

  it('rejects a GPS question inside the isHeader section', () => {
    const schema = {
      sections: [
        {
          id: 's0',
          isHeader: true,
          questions: [
            {
              id: 'q0',
              type: 'GPS',
              label: 'Local',
              required: false,
              orderIndex: 0,
            },
          ],
        },
      ],
    };
    expect(() => validateSurveySchema(schema)).toThrow(BadRequestException);
  });
});

describe('SurveysService', () => {
  describe('findAll — visibilidade por perfil', () => {
    it('restricts PESQUISADOR to PUBLISHED surveys of their organization, ignoring status filter and assignment', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findMany.mockResolvedValue([]);
      prisma.survey.count.mockResolvedValue(0);

      const service = new SurveysService(prisma as any);
      await service.findAll(PESQUISADOR, { status: 'DRAFT' } as any);

      const { where } = prisma.survey.findMany.mock.calls[0][0];
      expect(where).toEqual(
        expect.objectContaining({
          organizationId: 'org-1',
          status: 'PUBLISHED',
        }),
      );
      // Toda pesquisa PUBLISHED da organização deve aparecer para o
      // PESQUISADOR, não só as que estão na lista de atribuídos.
      expect(where).not.toHaveProperty('researchers');
    });

    it('lets GESTOR filter by any status across the whole organization', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findMany.mockResolvedValue([]);
      prisma.survey.count.mockResolvedValue(0);

      const service = new SurveysService(prisma as any);
      await service.findAll(GESTOR, { status: 'DRAFT' } as any);

      expect(prisma.survey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            status: 'DRAFT',
          }),
        }),
      );
    });
  });

  describe('create', () => {
    it('creates a DRAFT survey with the given fields', async () => {
      const prisma = createPrismaMock();
      prisma.survey.create.mockResolvedValue({
        id: 'survey-1',
        status: 'DRAFT',
      });

      const service = new SurveysService(prisma as any);
      await service.create(GESTOR, { title: 'Pesquisa X' } as any);

      expect(prisma.survey.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            createdById: 'gestor-1',
            title: 'Pesquisa X',
          }),
        }),
      );
    });
  });

  describe('update — apenas DRAFT é editável (exceto título)', () => {
    it('allows renaming (title-only) a PUBLISHED survey', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
        status: 'PUBLISHED',
        currentVersion: 1,
      });
      prisma.survey.update.mockResolvedValue({
        id: 'survey-1',
        title: 'Novo título',
      });

      const service = new SurveysService(prisma as any);
      await service.update(GESTOR, 'survey-1', { title: 'Novo título' } as any);

      expect(prisma.survey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'survey-1' },
          data: expect.objectContaining({ title: 'Novo título' }),
        }),
      );
    });

    it('rejects editing non-title fields of a PUBLISHED survey with SURVEY_NOT_DRAFT', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
        status: 'PUBLISHED',
        currentVersion: 1,
      });

      const service = new SurveysService(prisma as any);
      await expect(
        service.update(GESTOR, 'survey-1', {
          startsAt: '2026-01-01T00:00:00.000Z',
        } as any),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws SURVEY_NOT_FOUND for a survey outside the requester organization', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue(null);

      const service = new SurveysService(prisma as any);
      await expect(
        service.update(GESTOR, 'survey-other-org', {} as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('publish', () => {
    it('rejects publishing an ARCHIVED survey', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
        status: 'ARCHIVED',
        currentVersion: 1,
        title: 'Pesquisa X',
      });

      const service = new SurveysService(prisma as any);
      await expect(
        service.publish(GESTOR, 'survey-1', { schema: VALID_SCHEMA } as any),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejects a structurally invalid schema with SCHEMA_INVALID', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
        status: 'DRAFT',
        currentVersion: 0,
        title: 'Pesquisa X',
      });

      const service = new SurveysService(prisma as any);
      await expect(
        service.publish(GESTOR, 'survey-1', {
          schema: { sections: [] },
        } as any),
      ).rejects.toMatchObject({ response: { code: 'SCHEMA_INVALID' } });
    });

    it('creates a new SurveyVersion and increments currentVersion on success', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
        status: 'DRAFT',
        currentVersion: 0,
        title: 'Pesquisa X',
      });
      prisma.surveyVersion.create.mockResolvedValue({
        id: 'version-1',
        version: 1,
        publishedAt: new Date(),
      });
      prisma.survey.update.mockResolvedValue({});

      const service = new SurveysService(prisma as any);
      const result = await service.publish(GESTOR, 'survey-1', {
        schema: VALID_SCHEMA,
      } as any);

      expect(result.version).toBe(1);
      expect(prisma.surveyVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ surveyId: 'survey-1', version: 1 }),
        }),
      );
      expect(prisma.survey.update).toHaveBeenCalledWith({
        where: { id: 'survey-1' },
        data: { status: 'PUBLISHED', currentVersion: 1 },
      });
    });

    it('denormalizes questions and options from the validated schema', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
        status: 'DRAFT',
        currentVersion: 0,
        title: 'Pesquisa X',
      });
      prisma.surveyVersion.create.mockResolvedValue({
        id: 'version-1',
        version: 1,
        publishedAt: new Date(),
      });
      prisma.survey.update.mockResolvedValue({});

      const service = new SurveysService(prisma as any);
      await service.publish(GESTOR, 'survey-1', {
        schema: VALID_SCHEMA,
      } as any);

      expect(prisma.surveyVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            questions: {
              create: [
                expect.objectContaining({
                  externalId: 'q1',
                  type: 'TEXT',
                  isRequired: false,
                  options: undefined,
                }),
                expect.objectContaining({
                  externalId: 'q2',
                  type: 'SINGLE_CHOICE',
                  isRequired: true,
                  options: {
                    create: [
                      { label: '18-24', value: '18-24', orderIndex: 0 },
                      { label: '25-34', value: '25-34', orderIndex: 1 },
                    ],
                  },
                }),
              ],
            },
          }),
        }),
      );
    });
  });

  describe('archive', () => {
    it('rejects archiving an already-archived survey', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
        status: 'ARCHIVED',
        currentVersion: 1,
      });

      const service = new SurveysService(prisma as any);
      await expect(service.archive(GESTOR, 'survey-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('unarchive', () => {
    it('rejects unarchiving a survey that is not archived', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
        status: 'DRAFT',
        currentVersion: 0,
      });

      const service = new SurveysService(prisma as any);
      await expect(
        service.unarchive(GESTOR, 'survey-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('restores status to PUBLISHED when the survey has a published version', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
        status: 'ARCHIVED',
        currentVersion: 1,
      });

      const service = new SurveysService(prisma as any);
      await service.unarchive(GESTOR, 'survey-1');

      expect(prisma.survey.update).toHaveBeenCalledWith({
        where: { id: 'survey-1' },
        data: { status: 'PUBLISHED' },
        select: expect.anything(),
      });
    });

    it('restores status to DRAFT when the survey was never published', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
        status: 'ARCHIVED',
        currentVersion: 0,
      });

      const service = new SurveysService(prisma as any);
      await service.unarchive(GESTOR, 'survey-1');

      expect(prisma.survey.update).toHaveBeenCalledWith({
        where: { id: 'survey-1' },
        data: { status: 'DRAFT' },
        select: expect.anything(),
      });
    });
  });

  describe('remove', () => {
    it('rejects deleting a published survey', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
        status: 'PUBLISHED',
        currentVersion: 1,
      });

      const service = new SurveysService(prisma as any);
      await expect(service.remove(GESTOR, 'survey-1')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(prisma.survey.delete).not.toHaveBeenCalled();
    });

    it('rejects deleting a survey that already has collected responses', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
        status: 'ARCHIVED',
        currentVersion: 1,
      });
      prisma.response.count.mockResolvedValue(3);

      const service = new SurveysService(prisma as any);
      await expect(service.remove(GESTOR, 'survey-1')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(prisma.survey.delete).not.toHaveBeenCalled();
    });

    it('deletes a DRAFT/ARCHIVED survey with no responses', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
        status: 'ARCHIVED',
        currentVersion: 1,
      });
      prisma.response.count.mockResolvedValue(0);

      const service = new SurveysService(prisma as any);
      await service.remove(GESTOR, 'survey-1');

      expect(prisma.survey.delete).toHaveBeenCalledWith({
        where: { id: 'survey-1' },
      });
    });

    it('lets an ADMINISTRADOR delete a survey with responses, cascading the responses away', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
        status: 'ARCHIVED',
        currentVersion: 1,
      });
      prisma.response.count.mockResolvedValue(2);
      prisma.response.findMany.mockResolvedValue([
        { id: 'resp-1' },
        { id: 'resp-2' },
      ]);

      const service = new SurveysService(prisma as any);
      await service.remove(ADMINISTRADOR, 'survey-1');

      expect(prisma.conflictRecord.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { responseId: { in: ['resp-1', 'resp-2'] } },
            { conflictWithId: { in: ['resp-1', 'resp-2'] } },
          ],
        },
      });
      expect(prisma.syncRecord.deleteMany).toHaveBeenCalledWith({
        where: { surveyId: 'survey-1' },
      });
      expect(prisma.response.deleteMany).toHaveBeenCalledWith({
        where: { surveyId: 'survey-1' },
      });
      expect(prisma.survey.delete).toHaveBeenCalledWith({
        where: { id: 'survey-1' },
      });
    });
  });

  describe('duplicate', () => {
    it('creates a new DRAFT survey copying title (with suffix)', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
        title: 'Pesquisa Original',
        description: 'desc',
        startsAt: null,
        endsAt: null,
      });
      prisma.survey.create.mockResolvedValue({
        id: 'survey-2',
        status: 'DRAFT',
      });

      const service = new SurveysService(prisma as any);
      await service.duplicate(GESTOR, 'survey-1');

      expect(prisma.survey.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Pesquisa Original (cópia)',
          }),
        }),
      );
    });
  });

  describe('activateVersion', () => {
    it('rejects activating a version that does not exist for this survey', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
        status: 'PUBLISHED',
        currentVersion: 2,
      });
      prisma.surveyVersion.findUnique.mockResolvedValue(null);

      const service = new SurveysService(prisma as any);
      await expect(
        service.activateVersion(GESTOR, 'survey-1', 5),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects activating a version of an archived survey', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
        status: 'ARCHIVED',
        currentVersion: 2,
      });

      const service = new SurveysService(prisma as any);
      await expect(
        service.activateVersion(GESTOR, 'survey-1', 1),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('sets Survey.currentVersion to the chosen (already published) version', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
        status: 'PUBLISHED',
        currentVersion: 2,
      });
      prisma.surveyVersion.findUnique.mockResolvedValue({
        id: 'v1',
        version: 1,
      });
      prisma.survey.update.mockResolvedValue({
        id: 'survey-1',
        currentVersion: 1,
      });

      const service = new SurveysService(prisma as any);
      await service.activateVersion(GESTOR, 'survey-1', 1);

      expect(prisma.survey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'survey-1' },
          data: { currentVersion: 1 },
        }),
      );
    });
  });

  describe('deleteVersion', () => {
    it('rejects deleting the currently active version', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
        currentVersion: 2,
      });

      const service = new SurveysService(prisma as any);
      await expect(
        service.deleteVersion(GESTOR, 'survey-1', 2),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.surveyVersion.delete).not.toHaveBeenCalled();
    });

    it('rejects deleting a version that already has collected responses', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
        currentVersion: 2,
      });
      prisma.surveyVersion.findUnique.mockResolvedValue({
        id: 'v1',
        version: 1,
        _count: { responses: 3 },
      });

      const service = new SurveysService(prisma as any);
      await expect(
        service.deleteVersion(GESTOR, 'survey-1', 1),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.surveyVersion.delete).not.toHaveBeenCalled();
    });

    it('deletes a non-active version with no responses', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
        currentVersion: 2,
      });
      prisma.surveyVersion.findUnique.mockResolvedValue({
        id: 'v1',
        version: 1,
        _count: { responses: 0 },
      });

      const service = new SurveysService(prisma as any);
      const result = await service.deleteVersion(GESTOR, 'survey-1', 1);

      expect(prisma.surveyVersion.delete).toHaveBeenCalledWith({
        where: { surveyId_version: { surveyId: 'survey-1', version: 1 } },
      });
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('listResponses — painel operacional', () => {
    it('forces the researcherId filter to the requester for PESQUISADOR, ignoring any other value in the query', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
      });
      prisma.response.findMany.mockResolvedValue([]);
      prisma.response.count.mockResolvedValue(0);

      const service = new SurveysService(prisma as any);
      await service.listResponses(PESQUISADOR, 'survey-1', {
        researcherId: 'someone-else',
      } as any);

      expect(prisma.response.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            surveyId: 'survey-1',
            researcherId: 'researcher-1',
          }),
        }),
      );
    });

    it('lets a GESTOR filter by any researcherId and returns SYNCED/CONFLICT/ERROR counters', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
      });
      prisma.response.findMany.mockResolvedValue([{ id: 'resp-1' }]);
      prisma.response.count
        .mockResolvedValueOnce(5) // total
        .mockResolvedValueOnce(3) // synced
        .mockResolvedValueOnce(1) // conflict
        .mockResolvedValueOnce(1); // error

      const service = new SurveysService(prisma as any);
      const result = await service.listResponses(GESTOR, 'survey-1', {
        researcherId: 'researcher-1',
      } as any);

      expect(prisma.response.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ researcherId: 'researcher-1' }),
        }),
      );
      expect(result.counters).toEqual({
        total: 5,
        synced: 3,
        conflict: 1,
        error: 1,
      });
    });

    it('throws SURVEY_NOT_FOUND for a survey outside the requester organization', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue(null);

      const service = new SurveysService(prisma as any);
      await expect(
        service.listResponses(GESTOR, 'survey-other-org', {} as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lets a PESQUISADOR who is NOT assigned to the survey list it (assignment no longer gates visibility)', async () => {
      const prisma = createPrismaMock();
      prisma.survey.findFirst.mockResolvedValue({
        id: 'survey-1',
        organizationId: 'org-1',
      });
      prisma.response.findMany.mockResolvedValue([]);
      prisma.response.count.mockResolvedValue(0);

      const service = new SurveysService(prisma as any);
      await service.listResponses(PESQUISADOR, 'survey-1', {} as any);

      // assertVersionsReadable não deve mais filtrar por `researchers`.
      expect(prisma.survey.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'survey-1', organizationId: 'org-1' },
        }),
      );
      expect(prisma.response.findMany).toHaveBeenCalled();
    });
  });
});
