import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../services/auth/auth-context';
import { getSyncStatus, subscribeSyncStatus, SyncStatusSnapshot } from '../services/sync/sync-status';
import { syncPendingResponses } from '../services/sync/sync-repository';
import { refreshPendingCount } from '../services/sync/auto-sync';
import { getFriendlyErrorMessage, showAlert } from '../utils/alert';
import { colors, radius } from '../theme/colors';

// Tela inicial após o login: atalhos para as demais telas e, abaixo do
// cabeçalho, os indicadores de estado do app — última sincronização,
// online/offline e um botão para sincronizar manualmente com o servidor.
// Substitui a antiga listra verde/laranja no topo (SyncStatusBadge, removida
// de App.tsx) e o botão de diagnóstico "Verificar sessão".
interface HomeScreenProps {
  onOpenSurveys: () => void;
  onOpenResponses: () => void;
}

function formatLastSync(iso: string | null): string {
  if (!iso) return 'Nunca sincronizado';
  return new Date(iso).toLocaleString('pt-BR');
}

export function HomeScreen({ onOpenSurveys, onOpenResponses }: HomeScreenProps) {
  const { user, logout } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatusSnapshot>(getSyncStatus());
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => subscribeSyncStatus(setSyncStatus), []);

  useEffect(() => {
    NetInfo.fetch().then((state) => setIsOnline(!!state.isConnected && state.isInternetReachable !== false));
    return NetInfo.addEventListener((state) =>
      setIsOnline(!!state.isConnected && state.isInternetReachable !== false),
    );
  }, []);

  async function handleSyncNow() {
    if (!isOnline) {
      showAlert('Sem conexão', 'Conecte-se a uma rede para sincronizar.');
      return;
    }
    try {
      const summary = await syncPendingResponses();
      await refreshPendingCount();
      const status = getSyncStatus();
      showAlert(
        status.surveysSyncFailed ? 'Sincronização concluída com pendência' : 'Sincronização concluída',
        // Em caso de falha ao atualizar o catálogo de pesquisas, o aviso
        // completo (com "Pesquisas: não foi possível atualizar a lista.")
        // já está em status.lastMessage — sem isto, o usuário via só o
        // resumo de respostas e achava que tudo tinha sincronizado.
        status.lastMessage ??
          `Sincronizadas: ${summary.synced + summary.alreadySynced} · Conflitos: ${summary.conflicts} · Falhas: ${summary.failed}`,
      );
    } catch (err) {
      showAlert('Falha ao sincronizar', getFriendlyErrorMessage(err, 'Não foi possível sincronizar agora.'));
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>FieldSync</Text>
      <Text style={styles.subtitle}>
        Bem-vindo(a), {user?.name} ({user?.role})
      </Text>

      <View style={styles.statusPanel}>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: isOnline ? colors.success : colors.destructive }]} />
          <Text style={styles.statusLabel}>{isOnline ? 'Online' : 'Offline'}</Text>
        </View>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.dot,
              {
                backgroundColor: syncStatus.isSyncing
                  ? colors.primary
                  : syncStatus.surveysSyncFailed || syncStatus.pendingCount > 0
                    ? colors.warning
                    : colors.success,
              },
            ]}
          />
          <Text style={styles.statusLabel}>
            {syncStatus.isSyncing
              ? 'Sincronizando...'
              : syncStatus.surveysSyncFailed
                ? `Pesquisas desatualizadas — última tentativa: ${formatLastSync(syncStatus.lastSyncAt)}`
                : `Última sincronização: ${formatLastSync(syncStatus.lastSyncAt)}`}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.syncButton, syncStatus.isSyncing && styles.syncButtonDisabled]}
          onPress={handleSyncNow}
          disabled={syncStatus.isSyncing}
        >
          <Text style={styles.syncButtonText}>
            {syncStatus.isSyncing ? 'Sincronizando...' : 'Sincronizar Serviço'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.spacer} />
      <TouchableOpacity style={styles.navButton} onPress={onOpenSurveys}>
        <Text style={styles.navButtonText}>Ver pesquisas</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.navButton} onPress={onOpenResponses}>
        <Text style={styles.navButtonText}>Minhas coletas</Text>
      </TouchableOpacity>
      <View style={styles.spacer} />
      <TouchableOpacity style={styles.logoutButton} onPress={() => logout()}>
        <Text style={styles.logoutButtonText}>Sair</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 14,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.foreground,
  },
  subtitle: {
    color: colors.mutedForeground,
    textAlign: 'center',
    marginBottom: 4,
    fontSize: 13.5,
  },
  statusPanel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 16,
    gap: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: radius.pill,
  },
  statusLabel: {
    fontSize: 13,
    color: colors.foreground,
  },
  syncButton: {
    height: 44,
    backgroundColor: colors.foreground,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  syncButtonDisabled: {
    opacity: 0.6,
  },
  syncButtonText: {
    color: colors.surface,
    fontWeight: '600',
    fontSize: 13.5,
  },
  navButton: {
    height: 58,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonText: {
    color: colors.primaryForeground,
    fontWeight: '600',
    fontSize: 15,
  },
  logoutButton: {
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.destructiveSoft,
  },
  logoutButtonText: {
    color: colors.destructive,
    fontWeight: '600',
    fontSize: 14,
  },
  spacer: {
    height: 24,
  },
});
