import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { AuthService } from '../src/auth/auth.service';
import { validateAdminPasswordStrength } from '../src/config/env.validation';

const prisma = new PrismaClient();

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(items: T[]): T {
  return items[randomInt(0, items.length - 1)];
}

function randomChoices<T>(items: T[], min: number, max: number): T[] {
  const count = randomInt(min, Math.min(max, items.length));
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Datas dentro dos últimos `days` dias (para o gráfico "por período" ter uma
// série contínua em vez de um único pico num só dia).
function randomRecentDate(days: number): Date {
  const now = Date.now();
  const offsetMs = randomInt(0, days * 24 * 60 * 60 * 1000);
  return new Date(now - offsetMs);
}

// Ponto de entrada do `prisma db seed` (ver "prisma.seed" em package.json) —
// único jeito de rodar o seed, seja localmente ou por engano contra um
// banco de produção. Por isso a decisão do que semear mora aqui, não numa
// convenção de documentação: em NODE_ENV=production, cria só o
// Administrador (ver seedProduction) e nunca os dados de exemplo abaixo.
async function main() {
  if (process.env.NODE_ENV === 'production') {
    return seedProduction();
  }
  return seedDevelopment();
}

// Seed de produção: cria (ou garante) apenas 1 Organization + 1 usuário
// ADMINISTRADOR — nenhum dado de exemplo (pesquisas, respostas, outros
// usuários). Roda em todo deploy (ver deploy.yml), então precisa ser
// idempotente sem sobrescrever uma senha já trocada pelo próprio
// Administrador depois do bootstrap inicial — por isso o `update` abaixo
// nunca toca em passwordHash, só o `create`.
async function seedProduction() {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const passwordError = validateAdminPasswordStrength(adminPassword);
  if (passwordError) {
    throw new Error(`Seed de produção abortado: ${passwordError}`);
  }

  const organizationName =
    process.env.ADMIN_ORGANIZATION_NAME ?? 'FieldSync';
  const organizationSlug =
    process.env.ADMIN_ORGANIZATION_SLUG ?? 'fieldsync';
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@fieldsync.local';
  const adminName = process.env.ADMIN_NAME ?? 'Administrador';

  const organization = await prisma.organization.upsert({
    where: { slug: organizationSlug },
    update: {},
    create: { name: organizationName, slug: organizationSlug },
  });

  const passwordHash = await AuthService.hashPassword(adminPassword!);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { isRootAdmin: true },
    create: {
      organizationId: organization.id,
      name: adminName,
      email: adminEmail,
      passwordHash,
      role: 'ADMINISTRADOR',
      isRootAdmin: true,
    },
  });

  console.log('Seed de produção concluído: nenhum dado de exemplo criado.');
  console.log(`  Organization: ${organization.name} (${organization.id})`);
  console.log(`  ADMINISTRADOR: ${admin.email} (senha definida via ADMIN_PASSWORD)`);
}

// Seed de desenvolvimento: Organization + usuários de teste
// (ADMINISTRADOR, GESTOR, PESQUISADOR) + 2 pesquisas de teste (1 DRAFT,
// 1 PUBLISHED). Credenciais só
// servem para ambiente local/dev — nunca usar estes valores em produção.
async function seedDevelopment() {
  const organization = await prisma.organization.upsert({
    where: { slug: 'auto-viacao-urubupunga' },
    update: {},
    create: {
      name: 'Auto Viação Urubupungá',
      slug: 'auto-viacao-urubupunga',
    },
  });

  const adminPasswordHash = await AuthService.hashPassword('admin123456');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@fieldsync.dev' },
    // isRootAdmin também no update — garante a proteção mesmo rodando o
    // seed sobre um banco onde esse usuário já existia antes desse campo.
    update: { isRootAdmin: true },
    create: {
      organizationId: organization.id,
      name: 'Administrador FieldSync',
      email: 'admin@fieldsync.dev',
      passwordHash: adminPasswordHash,
      role: 'ADMINISTRADOR',
      isRootAdmin: true,
    },
  });

  const researcherPasswordHash =
    await AuthService.hashPassword('pesquisador123');
  const researcher = await prisma.user.upsert({
    where: { email: 'pesquisador01@fieldsync.dev' },
    // update também renomeia usuários já existentes de rodadas anteriores do
    // seed — mantém só "Pesquisador de Campo 01/02/03" (nome e email
    // genéricos, sem nome de pessoa) como pesquisadores de exemplo.
    update: { name: 'Pesquisador de Campo 01' },
    create: {
      organizationId: organization.id,
      name: 'Pesquisador de Campo 01',
      email: 'pesquisador01@fieldsync.dev',
      passwordHash: researcherPasswordHash,
      role: 'PESQUISADOR',
    },
  });

  const gestorPasswordHash = await AuthService.hashPassword('gestor123456');
  const gestor = await prisma.user.upsert({
    where: { email: 'gestor@fieldsync.dev' },
    update: {},
    create: {
      organizationId: organization.id,
      name: 'Gestor de Pesquisas',
      email: 'gestor@fieldsync.dev',
      passwordHash: gestorPasswordHash,
      role: 'GESTOR',
    },
  });

  const supervisorPasswordHash =
    await AuthService.hashPassword('supervisor123');
  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@fieldsync.dev' },
    update: {},
    create: {
      organizationId: organization.id,
      name: 'Supervisor de Campo',
      email: 'supervisor@fieldsync.dev',
      passwordHash: supervisorPasswordHash,
      role: 'SUPERVISOR',
    },
  });

  const visualizadorPasswordHash =
    await AuthService.hashPassword('visualizador123');
  const visualizador = await prisma.user.upsert({
    where: { email: 'visualizador@fieldsync.dev' },
    update: {},
    create: {
      organizationId: organization.id,
      name: 'Visualizador de Relatórios',
      email: 'visualizador@fieldsync.dev',
      passwordHash: visualizadorPasswordHash,
      role: 'VISUALIZADOR',
    },
  });

  let draftSurvey = await prisma.survey.findFirst({
    where: {
      organizationId: organization.id,
      title: 'Levantamento de Pontos de Ônibus (rascunho)',
    },
  });
  if (!draftSurvey) {
    draftSurvey = await prisma.survey.create({
      data: {
        organizationId: organization.id,
        createdById: gestor.id,
        title: 'Levantamento de Pontos de Ônibus (rascunho)',
        description: 'Pesquisa de teste ainda em elaboração.',
        type: 'Infraestrutura',
        questionStyle: 'Objetiva',
        status: 'DRAFT',
      },
    });
  }

  let publishedSurvey = await prisma.survey.findFirst({
    where: {
      organizationId: organization.id,
      title: 'Pesquisa de Satisfação de Passageiros',
    },
  });
  if (!publishedSurvey) {
    publishedSurvey = await prisma.survey.create({
      data: {
        organizationId: organization.id,
        createdById: gestor.id,
        title: 'Pesquisa de Satisfação de Passageiros',
        description: 'Pesquisa de teste já publicada.',
        type: 'Satisfação',
        questionStyle: 'Likert',
        status: 'DRAFT',
      },
    });

    const version = 1;
    const versionId = randomUUID();
    const sectionId = 's1';
    const sectionTitle = 'Identificação';
    await prisma.surveyVersion.create({
      data: {
        id: versionId,
        surveyId: publishedSurvey.id,
        version,
        publishedBy: gestor.id,
        schema: {
          surveyId: publishedSurvey.id,
          versionId,
          version,
          title: publishedSurvey.title,
          description: publishedSurvey.description,
          type: publishedSurvey.type,
          questionStyle: publishedSurvey.questionStyle,
          sections: [
            {
              id: sectionId,
              title: sectionTitle,
              questions: [
                {
                  id: 'q1',
                  type: 'SINGLE_CHOICE',
                  label: 'Turno',
                  required: true,
                  orderIndex: 0,
                  config: {
                    options: ['Manhã', 'Tarde', 'Noite'],
                  },
                },
                {
                  id: 'q2',
                  type: 'GPS',
                  label: 'Localização da coleta',
                  required: true,
                  orderIndex: 1,
                  config: { precisionThreshold: 20 },
                },
              ],
            },
          ],
        },
        // Denormaliza Question/QuestionOption manualmente — este seed cria a
        // SurveyVersion diretamente (sem passar por SurveysService.publish),
        // então precisa espelhar aqui o que o publish real faz.
        questions: {
          create: [
            {
              externalId: 'q1',
              type: 'SINGLE_CHOICE',
              label: 'Turno',
              isRequired: true,
              orderIndex: 0,
              sectionId,
              sectionTitle,
              config: {
                options: ['Manhã', 'Tarde', 'Noite'],
              },
              options: {
                create: ['Manhã', 'Tarde', 'Noite'].map((option, index) => ({
                  label: option,
                  value: option,
                  orderIndex: index,
                })),
              },
            },
            {
              externalId: 'q2',
              type: 'GPS',
              label: 'Localização da coleta',
              isRequired: true,
              orderIndex: 1,
              sectionId,
              sectionTitle,
              config: { precisionThreshold: 20 },
            },
          ],
        },
      },
    });

    publishedSurvey = await prisma.survey.update({
      where: { id: publishedSurvey.id },
      data: { status: 'PUBLISHED', currentVersion: version },
    });
  }

  // ── Pesquisa respondida com todos os tipos de pergunta ──────────
  // Cobre os 8 QuestionType (TEXT, NUMBER, BOOLEAN, SINGLE_CHOICE,
  // MULTIPLE_CHOICE, DATE, TIME, GPS) com dezenas de respostas
  // reais (múltiplos pesquisadores, datas espalhadas, status variados e
  // alguns conflitos) — para avaliar a qualidade dos gráficos de
  // Analytics/Dashboard sem precisar coletar dados manualmente pelo Mobile.
  const researcher2PasswordHash =
    await AuthService.hashPassword('pesquisador123');
  const researcher2 = await prisma.user.upsert({
    where: { email: 'pesquisador02@fieldsync.dev' },
    update: { name: 'Pesquisador de Campo 02' },
    create: {
      organizationId: organization.id,
      name: 'Pesquisador de Campo 02',
      email: 'pesquisador02@fieldsync.dev',
      passwordHash: researcher2PasswordHash,
      role: 'PESQUISADOR',
    },
  });

  const researcher3PasswordHash =
    await AuthService.hashPassword('pesquisador123');
  const researcher3 = await prisma.user.upsert({
    where: { email: 'pesquisador03@fieldsync.dev' },
    update: { name: 'Pesquisador de Campo 03' },
    create: {
      organizationId: organization.id,
      name: 'Pesquisador de Campo 03',
      email: 'pesquisador03@fieldsync.dev',
      passwordHash: researcher3PasswordHash,
      role: 'PESQUISADOR',
    },
  });

  const seedResearchers = [researcher, researcher2, researcher3];
  const devices = new Map<string, { id: string }>();
  for (const r of seedResearchers) {
    const device = await prisma.device.upsert({
      where: { deviceIdentifier: `seed-device-${r.email}` },
      update: {},
      create: {
        organizationId: organization.id,
        userId: r.id,
        deviceIdentifier: `seed-device-${r.email}`,
        deviceName: `Celular de ${r.name}`,
        platform: 'android',
        appVersion: '1.0.0',
        lastSeenAt: new Date(),
      },
    });
    devices.set(r.id, device);
  }

  let fullSurvey = await prisma.survey.findFirst({
    where: {
      organizationId: organization.id,
      title: 'Pesquisa de Satisfação — Todos os Tipos de Pergunta',
    },
  });

  if (!fullSurvey) {
    fullSurvey = await prisma.survey.create({
      data: {
        organizationId: organization.id,
        createdById: gestor.id,
        title: 'Pesquisa de Satisfação — Todos os Tipos de Pergunta',
        description:
          'Pesquisa de exemplo (seed) já respondida, cobrindo os 9 tipos de pergunta — usada para avaliar a qualidade dos gráficos de Analytics/Dashboard.',
        type: 'Satisfação',
        questionStyle: 'Mista (objetiva, aberta, numérica, GPS, foto)',
        status: 'DRAFT',
      },
    });

    const version = 1;
    const versionId = randomUUID();
    // Cabeçalho da pesquisa (isHeader) — preenchido uma vez por sessão de
    // coleta (ver survey-builder no Web e FormRendererScreen no Mobile),
    // separado do bloco de perguntas de campo.
    const headerSectionId = 'header';
    const headerSectionTitle = 'Cabeçalho da pesquisa';
    const sectionId = 's1';
    const sectionTitle = 'Avaliação da viagem';

    const singleChoiceOptions = ['Manhã', 'Tarde', 'Noite'];
    const multipleChoiceOptions = [
      'Atraso',
      'Limpeza',
      'Conforto do assento',
      'Preço da passagem',
      'Nenhum problema',
    ];

    const headerQuestions = [
      {
        id: 'h0',
        type: 'TEXT',
        label: 'Ponto de coleta',
        required: true,
        orderIndex: 0,
        config: { maxLength: 80 },
      },
      {
        id: 'h1',
        type: 'TEXT',
        label: 'Veículo utilizado nesta sessão de coleta',
        required: true,
        orderIndex: 1,
        config: { maxLength: 60 },
      },
    ] as const;

    const schemaQuestions = [
      {
        id: 'q1',
        type: 'TEXT',
        label: 'Comentário sobre a experiência na viagem',
        required: false,
        orderIndex: 0,
        config: { maxLength: 280 },
      },
      {
        id: 'q2',
        type: 'NUMBER',
        label: 'Nota de 0 a 10 para o atendimento',
        required: true,
        orderIndex: 1,
        config: { min: 0, max: 10 },
      },
      {
        id: 'q3',
        type: 'BOOLEAN',
        label: 'Recomendaria esta linha a um amigo?',
        required: true,
        orderIndex: 2,
        config: {},
      },
      {
        id: 'q4',
        type: 'SINGLE_CHOICE',
        label: 'Qual turno da viagem?',
        required: true,
        orderIndex: 3,
        config: { options: singleChoiceOptions },
      },
      {
        id: 'q5',
        type: 'MULTIPLE_CHOICE',
        label: 'Quais problemas você percebeu durante a viagem?',
        required: false,
        orderIndex: 4,
        config: { options: multipleChoiceOptions },
      },
      {
        id: 'q6',
        type: 'DATE',
        label: 'Data da viagem',
        required: true,
        orderIndex: 5,
        config: { format: 'DD/MM/AAAA' },
      },
      {
        id: 'q7',
        type: 'TIME',
        label: 'Horário de embarque',
        required: true,
        orderIndex: 6,
        config: { format: 'HH:mm' },
      },
      {
        id: 'q8',
        type: 'GPS',
        label: 'Localização do embarque',
        required: true,
        orderIndex: 7,
        config: { precisionThreshold: 20 },
      },
    ] as const;

    await prisma.surveyVersion.create({
      data: {
        id: versionId,
        surveyId: fullSurvey.id,
        version,
        publishedBy: gestor.id,
        schema: {
          surveyId: fullSurvey.id,
          versionId,
          version,
          title: fullSurvey.title,
          description: fullSurvey.description,
          type: fullSurvey.type,
          questionStyle: fullSurvey.questionStyle,
          sections: [
            {
              id: headerSectionId,
              title: headerSectionTitle,
              isHeader: true,
              questions: headerQuestions,
            },
            { id: sectionId, title: sectionTitle, questions: schemaQuestions },
          ],
        },
        // Denormaliza Question/QuestionOption manualmente, como no seed
        // acima (este script cria a SurveyVersion diretamente, sem
        // passar por SurveysService.publish).
        questions: {
          create: [
            ...headerQuestions.map((q) => ({
              externalId: q.id,
              type: q.type,
              label: q.label,
              isRequired: q.required,
              orderIndex: q.orderIndex,
              sectionId: headerSectionId,
              sectionTitle: headerSectionTitle,
              isHeader: true,
              config: q.config,
            })),
            ...schemaQuestions.map((q) => ({
              externalId: q.id,
              type: q.type,
              label: q.label,
              isRequired: q.required,
              orderIndex: q.orderIndex,
              sectionId,
              sectionTitle,
              isHeader: false,
              config: q.config,
              options:
                q.type === 'SINGLE_CHOICE' || q.type === 'MULTIPLE_CHOICE'
                  ? {
                      create: (q.config as { options: string[] }).options.map(
                        (option, index) => ({
                          label: option,
                          value: option,
                          orderIndex: index,
                        }),
                      ),
                    }
                  : undefined,
            })),
          ],
        },
      },
    });

    fullSurvey = await prisma.survey.update({
      where: { id: fullSurvey.id },
      data: { status: 'PUBLISHED', currentVersion: version },
    });

    const questions = await prisma.question.findMany({
      where: { surveyVersionId: versionId },
    });
    const questionByExternalId = new Map(
      questions.map((q) => [q.externalId, q]),
    );

    // Ponto central das coletas (região de Osasco/SP) com um pequeno
    // espalhamento aleatório, para o mapa de calor ficar plausível em vez de
    // um único ponto sobreposto.
    const baseLat = -23.5325;
    const baseLng = -46.7916;

    const textSamples = [
      'Viagem tranquila, sem problemas.',
      'Motorista muito atencioso, parabéns!',
      'Ônibus atrasou uns 15 minutos, mas chegou bem.',
      'Poderia ter mais ventilação no veículo.',
      'Tudo certo, sem reclamações.',
      'Assento um pouco desconfortável para viagens longas.',
      'Excelente atendimento na hora do embarque.',
      'Sem comentários adicionais.',
    ];

    // Cabeçalho (h0/h1) — pontos de coleta reais da região de Osasco/SP e
    // identificação do veículo, reaproveitados entre respostas do mesmo
    // pesquisador (mesmo comportamento do botão "Salvar cabeçalho" no
    // Mobile: várias respostas seguidas no mesmo ponto de coleta).
    const collectionPoints = [
      'Terminal Osasco',
      'Estação Osasco (CPTM)',
      'Shopping União de Osasco',
      'Av. dos Autonomistas, 1400',
      'Centro de Osasco',
    ];
    const vehicleSamples = [
      'Linha 175 - Osasco/Lapa',
      'Linha 302 - Osasco/Centro',
      'Linha 018 - Osasco/Barueri',
      'Linha 447 - Osasco/Carapicuíba',
    ];

    const respondentPrefix = 'RESP';
    const totalResponses = 60;
    const conflictPairCount = 3;
    const errorCount = 4;

    // Marca de antemão quais índices vão virar conflito/erro, o resto fica
    // SYNCED — dá uma distribuição de status realista para os gráficos de
    // status/período/pesquisador.
    const conflictIndexes = new Set<number>();
    while (conflictIndexes.size < conflictPairCount * 2) {
      conflictIndexes.add(randomInt(0, totalResponses - 1));
    }
    const errorIndexes = new Set<number>();
    while (errorIndexes.size < errorCount) {
      const idx = randomInt(0, totalResponses - 1);
      if (!conflictIndexes.has(idx)) errorIndexes.add(idx);
    }

    const createdResponseIds: string[] = [];

    for (let i = 0; i < totalResponses; i++) {
      const researcherPick = randomChoice(seedResearchers);
      const device = devices.get(researcherPick.id)!;
      const collectedAt = randomRecentDate(30);
      const responseId = randomUUID();

      const status = conflictIndexes.has(i)
        ? 'CONFLICT'
        : errorIndexes.has(i)
          ? 'ERROR'
          : 'SYNCED';

      const lat = baseLat + (Math.random() - 0.5) * 0.08;
      const lng = baseLng + (Math.random() - 0.5) * 0.08;
      const locationHash = conflictIndexes.has(i)
        ? `geo:${baseLat.toFixed(3)},${baseLng.toFixed(3)}` // mesmo hash para todo o par conflitante
        : `geo:${lat.toFixed(3)},${lng.toFixed(3)}`;

      await prisma.response.create({
        data: {
          id: responseId,
          surveyId: fullSurvey.id,
          surveyVersionId: versionId,
          researcherId: researcherPick.id,
          deviceId: device.id,
          respondentId: `${respondentPrefix}-${String(i + 1).padStart(3, '0')}`,
          status,
          locationHash,
          collectedAt,
          syncedAt: new Date(
            collectedAt.getTime() + randomInt(1, 30) * 60 * 1000,
          ),
        },
      });
      createdResponseIds.push(responseId);

      const hh = randomInt(5, 22);
      const mm = randomChoice([0, 15, 30, 45]);

      const answers: { questionId: string; value: unknown }[] = [
        {
          questionId: questionByExternalId.get('h0')!.id,
          value: randomChoice(collectionPoints),
        },
        {
          questionId: questionByExternalId.get('h1')!.id,
          value: randomChoice(vehicleSamples),
        },
        {
          questionId: questionByExternalId.get('q1')!.id,
          value: randomChoice(textSamples),
        },
        {
          questionId: questionByExternalId.get('q2')!.id,
          value: randomInt(0, 10),
        },
        {
          questionId: questionByExternalId.get('q3')!.id,
          value: Math.random() > 0.25,
        },
        {
          questionId: questionByExternalId.get('q4')!.id,
          value: randomChoice(singleChoiceOptions),
        },
        {
          questionId: questionByExternalId.get('q5')!.id,
          value: randomChoices(multipleChoiceOptions, 1, 3),
        },
        {
          questionId: questionByExternalId.get('q6')!.id,
          value: `${pad2(collectedAt.getDate())}/${pad2(collectedAt.getMonth() + 1)}/${collectedAt.getFullYear()}`,
        },
        {
          questionId: questionByExternalId.get('q7')!.id,
          value: `${pad2(hh)}:${pad2(mm)}`,
        },
      ];

      await prisma.answer.createMany({
        data: answers.map((a) => ({
          responseId,
          questionId: a.questionId,
          value: a.value as never,
        })),
      });

      // GPS (q8) é satisfeito pelo Response.location, não por um Answer —
      // mesmo comportamento do fluxo real (ver sync.service.ts).
      await prisma.location.create({
        data: {
          responseId,
          latitude: lat,
          longitude: lng,
          accuracy: randomInt(4, 18),
          capturedAt: collectedAt,
        },
      });
      await prisma.$executeRaw`UPDATE locations SET coordinates = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326) WHERE "responseId" = ${responseId}::uuid`;
    }

    // Registra os pares em conflito (ConflictRecord) — metade já resolvida,
    // para a tela de Conflitos também ter exemplos de ambos os estados.
    const conflictIds = [...conflictIndexes];
    for (let p = 0; p < conflictPairCount; p++) {
      const [aIdx, bIdx] = [conflictIds[p * 2], conflictIds[p * 2 + 1]];
      const isResolved = p === 0;
      await prisma.conflictRecord.create({
        data: {
          responseId: createdResponseIds[bIdx],
          conflictWithId: createdResponseIds[aIdx],
          status: isResolved ? 'RESOLVED' : 'PENDING',
          resolution: isResolved ? 'KEEP_FIRST' : undefined,
          resolvedById: isResolved ? gestor.id : undefined,
          resolvedAt: isResolved ? new Date() : undefined,
        },
      });
    }
  }

  // KPIs (mv_survey_kpis) só são atualizados pelo job agendado do
  // QueueService (a cada KPI_REFRESH_INTERVAL_MINUTES) — refresca aqui
  // também para os dados do seed aparecerem no Dashboard/KPIs imediatamente.
  await prisma.$executeRawUnsafe(
    'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_survey_kpis',
  );

  console.log('Seed concluído:');
  console.log(`  Organization: ${organization.name} (${organization.id})`);
  console.log(`  ADMINISTRADOR: ${admin.email} / senha: admin123456`);
  console.log(`  GESTOR:        ${gestor.email} / senha: gestor123456`);
  console.log(
    `  SUPERVISOR:    ${supervisor.email} / senha: supervisor123`,
  );
  console.log(
    `  VISUALIZADOR:  ${visualizador.email} / senha: visualizador123`,
  );
  console.log(`  PESQUISADOR:   ${researcher.email} / senha: pesquisador123`);
  console.log(`  PESQUISADOR:   ${researcher2.email} / senha: pesquisador123`);
  console.log(`  PESQUISADOR:   ${researcher3.email} / senha: pesquisador123`);
  console.log(`  Survey DRAFT:     ${draftSurvey.title}`);
  console.log(`  Survey PUBLISHED: ${publishedSurvey.title}`);
  console.log(
    `  Survey PUBLISHED (respondida, todos os tipos de pergunta): ${fullSurvey.title}`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
