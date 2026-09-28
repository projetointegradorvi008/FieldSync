#!/usr/bin/env node
// Teste de carga sintético do /sync (ver 6.4 na especificação).
//
// Simula os "12 dispositivos" do MVP como 12 logins concorrentes de 12
// contas de pesquisador DISTINTAS, provisionadas pelo próprio script no
// início da execução (login é sessão única por USUÁRIO, não por
// dispositivo — ver AuthService.login — então 12 "dispositivos" no MESMO
// usuário se revogariam entre si; JwtAuthGuard valida essa revogação a
// cada requisição, não só no refresh). Cada rodada, cada "dispositivo"
// envia um lote de ~10 respostas (com GPS), espaçadas para não estourar o
// rate limit de /sync (30 req/min por IP em produção — todos os 12
// workers batem do MESMO IP de teste aqui, diferente do cenário real com
// 12 IPs distintos via Tailscale). Por isso, ANTES de rodar, suba o Backend
// com:
//
//   SYNC_RATE_LIMIT_PER_MINUTE=200 node dist/main.js
//
// Uso:
//   node scripts/load-test-sync.js [--base=http://localhost:3001/api/v1]
//     [--devices=12] [--rounds=5] [--intervalMs=10000]
//
// Critérios de passa/falha (ver 6.4):
//   - 0% de erros 5xx
//   - p95 de latência do /sync < 2000ms
//   - nenhuma resposta duplicada no banco após o teste (idempotência sob carga)
//
// Não faz cleanup automático dos dados criados (survey/responses/devices/
// contas de pesquisador de teste) — ver seção "Backup e Restauração"/
// rotina de limpeza manual usada no resto deste projeto; o script imprime
// os IDs/emails criados ao final.

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? true];
  }),
);

const BASE = args.base ?? 'http://localhost:3001/api/v1';
const DEVICES = Number(args.devices ?? 12);
const ROUNDS = Number(args.rounds ?? 5);
const INTERVAL_MS = Number(args.intervalMs ?? 10_000);
const RESPONSES_PER_BATCH = 10;

function uuid() {
  return crypto.randomUUID();
}

async function login(email, password, deviceId) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, deviceId }),
  });
  if (!res.ok)
    throw new Error(`Login falhou (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.tokens.accessToken;
}

const LOAD_TEST_RESEARCHER_PASSWORD = 'LoadTest123456';

// Cria uma conta de pesquisador descartável por "dispositivo" simulado —
// sessão única por usuário (ver AuthService.login) exige contas distintas
// para simular conexões concorrentes de verdade, uma por device.
async function provisionResearcher(adminToken, runId, index) {
  const email = `load-test-r${index}-${runId}@fieldsync.dev`;
  const res = await fetch(`${BASE}/users`, {
    method: 'POST',
    // POST /users exige ADMINISTRADOR (ver @Roles em UsersController) — GESTOR
    // não tem permissão para criar usuários, só para editar/desativar.
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `Load Test Researcher ${index}`,
      email,
      password: LOAD_TEST_RESEARCHER_PASSWORD,
      role: 'PESQUISADOR',
    }),
  });
  if (!res.ok)
    throw new Error(
      `Criação do pesquisador de teste ${index} falhou: ${await res.text()}`,
    );
  const user = await res.json();
  return { id: user.id, email, password: LOAD_TEST_RESEARCHER_PASSWORD };
}

async function setupTestSurvey(gestorToken, researcherIds) {
  const createRes = await fetch(`${BASE}/surveys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${gestorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: `[load-test] ${new Date().toISOString()}`,
      researcherIds,
    }),
  });
  if (!createRes.ok)
    throw new Error(`Criação da pesquisa falhou: ${await createRes.text()}`);
  const survey = await createRes.json();

  const publishRes = await fetch(`${BASE}/surveys/${survey.id}/publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${gestorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      schema: {
        title: survey.title,
        sections: [
          {
            id: 's1',
            title: 'Carga',
            questions: [
              {
                id: 'q1',
                type: 'TEXT',
                label: 'Observação',
                required: false,
                orderIndex: 0,
              },
              {
                id: 'q2',
                type: 'GPS',
                label: 'Local',
                required: true,
                orderIndex: 1,
              },
            ],
          },
        ],
      },
    }),
  });
  if (!publishRes.ok)
    throw new Error(`Publicação falhou: ${await publishRes.text()}`);
  const published = await publishRes.json();

  return { surveyId: survey.id, surveyVersionId: published.versionId };
}

function buildSyncPayload(syncDeviceId, label, surveyVersionId, count) {
  const responses = [];
  for (let i = 0; i < count; i++) {
    responses.push({
      id: uuid(),
      surveyVersionId,
      collectedAt: new Date().toISOString(),
      locationHash: `loadtest-${label}-${i}`,
      location: {
        latitude: -23.5 + Math.random() * 0.01,
        longitude: -46.6 + Math.random() * 0.01,
        accuracy: 8,
      },
      answers: { q1: `carga-${label}-${i}` },
    });
  }
  return { deviceId: syncDeviceId, responses };
}

async function runWorker(deviceIndex, researcher, surveyVersionId, stats) {
  const deviceLabel = `load-test-device-${deviceIndex}`;
  // Login aceita qualquer string como deviceId (vira claim do JWT / rótulo
  // da sessão); o payload de /sync exige um UUID de verdade
  // (Device.deviceIdentifier) — por isso os dois são valores distintos.
  const syncDeviceId = uuid();
  const token = await login(researcher.email, researcher.password, deviceLabel);

  for (let round = 0; round < ROUNDS; round++) {
    const payload = buildSyncPayload(
      syncDeviceId,
      `${deviceLabel}-r${round}`,
      surveyVersionId,
      RESPONSES_PER_BATCH,
    );

    const start = Date.now();
    let status = 0;
    try {
      const res = await fetch(`${BASE}/sync`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      status = res.status;
      const body = await res.json();
      if (res.ok) {
        stats.responsesCreated += body.results.filter(
          (r) => r.status === 'SYNCED',
        ).length;
      }
    } catch (err) {
      status = 0; // falha de rede/timeout — conta como erro
      stats.networkErrors.push(String(err));
    }
    const latencyMs = Date.now() - start;
    stats.syncLatencies.push(latencyMs);
    stats.syncStatuses.push(status);

    if (round < ROUNDS - 1) {
      await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
    }
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

async function main() {
  console.log(
    `Teste de carga /sync — ${DEVICES} dispositivos × ${ROUNDS} rodadas de ${RESPONSES_PER_BATCH} respostas, intervalo ${INTERVAL_MS}ms`,
  );

  const gestorToken = await login(
    'gestor@fieldsync.dev',
    'gestor123456',
    'load-test-gestor',
  );
  const adminToken = await login(
    'admin@fieldsync.dev',
    'admin123456',
    'load-test-admin',
  );

  const runId = Date.now();
  const researchers = await Promise.all(
    Array.from({ length: DEVICES }, (_, i) =>
      provisionResearcher(adminToken, runId, i),
    ),
  );
  console.log(
    `${researchers.length} conta(s) de pesquisador de teste provisionada(s) (email padrão load-test-r<N>-${runId}@fieldsync.dev).`,
  );

  const { surveyId, surveyVersionId } = await setupTestSurvey(
    gestorToken,
    researchers.map((r) => r.id),
  );
  console.log(
    `Survey de teste criada: ${surveyId} (versão ${surveyVersionId})`,
  );

  const stats = {
    syncLatencies: [],
    syncStatuses: [],
    responsesCreated: 0,
    networkErrors: [],
  };

  const startedAt = Date.now();
  await Promise.all(
    researchers.map((researcher, i) =>
      runWorker(i, researcher, surveyVersionId, stats),
    ),
  );
  const totalDurationMs = Date.now() - startedAt;

  const sortedSync = [...stats.syncLatencies].sort((a, b) => a - b);
  const sync5xx = stats.syncStatuses.filter((s) => s >= 500 || s === 0).length;
  const p95 = percentile(sortedSync, 95);

  console.log('\n--- Resultado ---');
  console.log(`Duração total: ${(totalDurationMs / 1000).toFixed(1)}s`);
  console.log(
    `Requisições /sync: ${stats.syncStatuses.length} (5xx/erro: ${sync5xx})`,
  );
  console.log(
    `Respostas SYNCED confirmadas pelo servidor: ${stats.responsesCreated}`,
  );
  console.log(
    `Latência /sync — p50: ${percentile(sortedSync, 50)}ms · p95: ${p95}ms · p99: ${percentile(sortedSync, 99)}ms`,
  );

  const expectedTotal = DEVICES * ROUNDS * RESPONSES_PER_BATCH;
  const countRes = await fetch(
    `${BASE}/analytics/surveys/${surveyId}/responses?limit=1`,
    { headers: { Authorization: `Bearer ${gestorToken}` } },
  );
  const countData = await countRes.json();
  console.log(
    `Respostas no banco para a pesquisa de teste: ${countData.meta.total} (esperado, sem duplicatas: ${expectedTotal})`,
  );

  const pass5xx = sync5xx === 0;
  const passLatency = p95 < 2000;
  const passIdempotency = countData.meta.total === expectedTotal;

  console.log('\n--- Critérios (ver 6.4) ---');
  console.log(`${pass5xx ? '✅' : '❌'} 0% de erros 5xx`);
  console.log(`${passLatency ? '✅' : '❌'} p95 < 2000ms (obtido: ${p95}ms)`);
  console.log(
    `${passIdempotency ? '✅' : '❌'} nenhuma resposta duplicada/perdida (esperado ${expectedTotal}, encontrado ${countData.meta.total})`,
  );

  console.log(
    `\nLimpeza manual necessária: survey ${surveyId}, ${expectedTotal} responses de teste e ${researchers.length} conta(s) de pesquisador de teste (emails load-test-r*-${runId}@fieldsync.dev) — ver rotina de limpeza usada no resto do projeto.`,
  );

  if (!pass5xx || !passLatency || !passIdempotency) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Teste de carga falhou:', err);
  process.exitCode = 1;
});
