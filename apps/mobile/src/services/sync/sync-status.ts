// Store simples e assinável (mesmo padrão de session-context.ts) para o
// indicador global de sincronização, consultado pela Home e por "Minhas
// coletas".
export interface SyncStatusSnapshot {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: string | null;
  lastMessage: string | null;
  // true quando a última sincronização enviou as respostas pendentes com
  // sucesso mas falhou ao atualizar o catálogo de pesquisas (syncSurveys) —
  // sem isto, a Home mostrava "sincronizado" mesmo com a lista de pesquisas
  // desatualizada, escondendo a falha do usuário.
  surveysSyncFailed: boolean;
}

let snapshot: SyncStatusSnapshot = {
  isSyncing: false,
  pendingCount: 0,
  lastSyncAt: null,
  lastMessage: null,
  surveysSyncFailed: false,
};

type Listener = (snapshot: SyncStatusSnapshot) => void;
const listeners = new Set<Listener>();

export function getSyncStatus(): SyncStatusSnapshot {
  return snapshot;
}

export function subscribeSyncStatus(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => listeners.delete(listener);
}

export function setSyncStatus(partial: Partial<SyncStatusSnapshot>): void {
  snapshot = { ...snapshot, ...partial };
  for (const listener of listeners) listener(snapshot);
}
