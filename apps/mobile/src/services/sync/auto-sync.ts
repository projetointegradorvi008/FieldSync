import NetInfo from '@react-native-community/netinfo';
import { getDatabase } from '../../database';
import { getAppConfigNumber } from '../config/app-config-repository';
import { notifySyncFinished } from '../notifications/sync-notifications';
import { setSyncStatus } from './sync-status';
import { syncPendingResponses } from './sync-repository';

// Sync automático (4.8): dispara ao detectar conectividade (o
// proxy prático de "Tailscale + internet" — o app não distingue a VPN em si,
// só que a rede voltou) e também por um retry agendado a cada
// SYNC_RETRY_INTERVAL_MINUTES. Ambos
// respeitam SYNC_MAX_AUTO_RETRIES (o botão manual da tela "Minhas coletas"
// não respeita o teto — é a via de escape depois de FAILED_MANUAL_REQUIRED).

let netInfoUnsubscribe: (() => void) | null = null;
let retryTimer: ReturnType<typeof setInterval> | null = null;
let wasReachable = false;
let isRunning = false;

export async function refreshPendingCount(): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM responses WHERE status = 'PENDING'",
  );
  setSyncStatus({ pendingCount: row?.count ?? 0 });
}

async function runAutoSync(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    // isSyncing/lastSyncAt/lastMessage já são atualizados dentro de
    // syncPendingResponses (ver sync-repository.ts) — usado tanto aqui quanto
    // pelos botões manuais, então o status global reflete qualquer sync.
    const summary = await syncPendingResponses({ respectAutoRetryCap: true });
    await notifySyncFinished(summary);
  } catch {
    // Falha inesperada (não é falha de rede — essa já é tratada dentro de
    // syncPendingResponses, que mantém PENDING sem lançar): aqui só evitamos
    // que quebre o timer de retry.
  } finally {
    isRunning = false;
    await refreshPendingCount();
  }
}

async function scheduleRetryTimer(): Promise<void> {
  if (retryTimer) clearInterval(retryTimer);
  const intervalMinutes = await getAppConfigNumber('sync_retry_interval_minutes');
  retryTimer = setInterval(
    () => {
      NetInfo.fetch().then((state) => {
        if (state.isConnected && state.isInternetReachable !== false) {
          void runAutoSync();
        }
      });
    },
    intervalMinutes * 60 * 1000,
  );
}

export async function startAutoSync(): Promise<void> {
  await refreshPendingCount();
  await scheduleRetryTimer();

  netInfoUnsubscribe = NetInfo.addEventListener((state) => {
    const reachable = !!state.isConnected && state.isInternetReachable !== false;
    if (reachable && !wasReachable) {
      void runAutoSync();
    }
    wasReachable = reachable;
  });
}

export function stopAutoSync(): void {
  if (netInfoUnsubscribe) {
    netInfoUnsubscribe();
    netInfoUnsubscribe = null;
  }
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
  wasReachable = false;
}
