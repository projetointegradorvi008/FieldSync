import { getDatabase } from '../../database';
import { apiFetch } from '../api/client';
import { getOrCreateDeviceId } from '../auth/device-id';
import { getAppConfigNumber } from '../config/app-config-repository';
import { syncSurveys } from '../surveys/surveys-repository';
import { getFriendlyErrorMessage } from '../../utils/alert';
import { setSyncStatus } from './sync-status';

interface PendingResponseRow {
  id: string;
  survey_id: string;
  survey_version_id: string;
  answers_json: string;
  location_hash: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  collected_at: string;
  respondent_id: string | null;
  sync_attempts: number;
}

export interface SyncSummary {
  synced: number;
  alreadySynced: number;
  conflicts: number;
  failed: number;
}

interface SyncOptions {
  // true quando disparado automaticamente (NetInfo/timer — ver auto-sync.ts):
  // respostas que já esgotaram SYNC_MAX_AUTO_RETRIES não entram no lote e
  // viram FAILED_MANUAL_REQUIRED, exigindo o botão manual (ver 4.8). O botão
  // "Sincronizar agora" chama sem essa opção — sempre tenta tudo que está
  // PENDING, é a via de escape manual da própria política de retry.
  respectAutoRetryCap?: boolean;
}

// Lê a fila local (respostas PENDING) e envia para o Backend, atualizando o
// status local conforme o resultado. Chamada tanto pelo botão manual quanto
// pelo sync automático e pelo retry agendado (ver auto-sync.ts) — é o único
// ponto que atualiza o status global de sincronização (ver sync-status.ts),
// consultado pela Home e por "Minhas coletas" para mostrar a data/hora da
// última sincronização.
export async function syncPendingResponses(
  options?: SyncOptions,
): Promise<SyncSummary> {
  setSyncStatus({ isSyncing: true });
  try {
    const summary = await runSync(options);

    // A lista de pesquisas é baixada aqui também (e não só na tela "Minhas
    // pesquisas") porque este é o único ponto que atualiza o status global de
    // sincronização — sem isso, o indicador "Última sincronização" na Home
    // ficava verde/atualizado mesmo com o catálogo de pesquisas desatualizado
    // (pesquisas novas só apareciam depois de reabrir a tela manualmente).
    // Uma falha aqui não deve derrubar a sincronização de respostas, que já
    // foi concluída com sucesso.
    let surveysMessage = '';
    let surveysSyncFailed = false;
    try {
      await syncSurveys();
    } catch {
      surveysMessage = ' · Pesquisas: não foi possível atualizar a lista.';
      surveysSyncFailed = true;
    }

    setSyncStatus({
      isSyncing: false,
      lastSyncAt: new Date().toISOString(),
      lastMessage: `Sincronizadas: ${summary.synced + summary.alreadySynced} · Conflitos: ${summary.conflicts} · Falhas: ${summary.failed}${surveysMessage}`,
      surveysSyncFailed,
    });
    return summary;
  } catch (err) {
    setSyncStatus({ isSyncing: false });
    throw err;
  }
}

async function runSync(options?: SyncOptions): Promise<SyncSummary> {
  const db = await getDatabase();
  const deviceId = await getOrCreateDeviceId();

  const summary: SyncSummary = {
    synced: 0,
    alreadySynced: 0,
    conflicts: 0,
    failed: 0,
  };

  const allPending = await db.getAllAsync<PendingResponseRow>(
    "SELECT * FROM responses WHERE status = 'PENDING'",
  );

  let pendingResponses = allPending;
  if (options?.respectAutoRetryCap) {
    const maxRetries = await getAppConfigNumber('sync_max_auto_retries');
    const overCap = allPending.filter((r) => r.sync_attempts >= maxRetries);
    pendingResponses = allPending.filter((r) => r.sync_attempts < maxRetries);
    for (const row of overCap) {
      await db.runAsync(
        "UPDATE responses SET status = 'FAILED_MANUAL_REQUIRED', last_error = ? WHERE id = ?",
        [
          `Excedeu ${maxRetries} tentativas automáticas de sincronização.`,
          row.id,
        ],
      );
      summary.failed += 1;
    }
  }

  if (pendingResponses.length === 0) {
    return summary;
  }

  const payload = {
    deviceId,
    responses: pendingResponses.map((row) => ({
      id: row.id,
      surveyVersionId: row.survey_version_id,
      collectedAt: row.collected_at,
      locationHash: row.location_hash ?? undefined,
      location:
        row.latitude != null && row.longitude != null
          ? { latitude: row.latitude, longitude: row.longitude, accuracy: row.accuracy ?? undefined }
          : undefined,
      respondentId: row.respondent_id ?? undefined,
      answers: JSON.parse(row.answers_json),
    })),
  };

  try {
    const response = await apiFetch('/sync', { method: 'POST', body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message ?? 'Falha ao sincronizar.');
    }

    const now = new Date().toISOString();
    for (const result of data.results as {
      id: string;
      status: string;
      reason?: string;
      conflictId?: string;
    }[]) {
      if (result.status === 'SYNCED') {
        await db.runAsync("UPDATE responses SET status = 'SYNCED', synced_at = ? WHERE id = ?", [
          now,
          result.id,
        ]);
        summary.synced += 1;
      } else if (result.status === 'ALREADY_SYNCED') {
        await db.runAsync("UPDATE responses SET status = 'SYNCED', synced_at = ? WHERE id = ?", [
          now,
          result.id,
        ]);
        summary.alreadySynced += 1;
      } else if (result.status === 'CONFLICT') {
        // C2 — o servidor aceitou e persistiu a resposta, mas ela colide com
        // outra já sincronizada (mesma pesquisa/local/entrevistado/dia). O
        // gestor resolve pelo painel Web; aqui só refletimos o estado.
        await db.runAsync(
          "UPDATE responses SET status = 'CONFLICT', synced_at = ?, last_error = ? WHERE id = ?",
          [now, `Conflito detectado (conflictId: ${result.conflictId}).`, result.id],
        );
        summary.conflicts += 1;
      } else {
        // Erro de dado (4xx) — vai direto para FAILED_MANUAL_REQUIRED, sem
        // consumir tentativas de retry automático (ver política em 4.8).
        await db.runAsync(
          "UPDATE responses SET status = 'FAILED_MANUAL_REQUIRED', last_error = ?, sync_attempts = sync_attempts + 1 WHERE id = ?",
          [result.reason ?? 'Erro desconhecido', result.id],
        );
        summary.failed += 1;
      }
    }
  } catch (err) {
    // Falha de rede — mantém PENDING para nova tentativa manual, só registra
    // o erro e incrementa o contador de tentativas.
    const message = getFriendlyErrorMessage(err, 'Falha de rede ao sincronizar.');
    for (const row of pendingResponses) {
      await db.runAsync(
        "UPDATE responses SET last_error = ?, sync_attempts = sync_attempts + 1 WHERE id = ?",
        [message, row.id],
      );
    }
    return summary;
  }

  return summary;
}
