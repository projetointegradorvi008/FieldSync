import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';

// Notificação local ao finalizar sync (4.8). Só notificações
// locais são usadas (sem push remoto) — no entanto, a partir do SDK 53, o
// pacote expo-notifications lança uma Error (não só um warning) já ao ser
// IMPORTADO no Android dentro do Expo Go — ver
// DevicePushTokenAutoRegistration.fx.js, que registra um listener de push
// como efeito colateral do import, mesmo sem chamarmos nenhuma API de push.
// Isso derruba o app inteiro ("runtime not ready") ao abrir no Expo Go.
// Por isso o import do módulo é adiado (dynamic import) e só acontece fora
// dessa combinação (Android + Expo Go); nela, a notificação de sync
// simplesmente não é exibida, mas o app continua funcionando normalmente —
// um development build resolve isso por completo (ver AGENTS.md do app).
const PUSH_MODULE_UNSAFE = Platform.OS === 'android' && isRunningInExpoGo();

let notificationsModule: typeof import('expo-notifications') | null = null;
let notificationsModulePromise: Promise<typeof import('expo-notifications') | null> | null = null;

async function getNotifications(): Promise<typeof import('expo-notifications') | null> {
  if (PUSH_MODULE_UNSAFE) return null;
  if (notificationsModule) return notificationsModule;
  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications').then((mod) => {
      mod.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      notificationsModule = mod;
      return mod;
    });
  }
  return notificationsModulePromise;
}

let permissionRequested = false;

async function ensurePermission(Notifications: typeof import('expo-notifications')): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (permissionRequested) return false;
  permissionRequested = true;
  const result = await Notifications.requestPermissionsAsync();
  return result.granted;
}

export async function notifySyncFinished(summary: {
  synced: number;
  alreadySynced: number;
  conflicts: number;
  failed: number;
}): Promise<void> {
  const totalSynced = summary.synced + summary.alreadySynced;
  // Sem nada de relevante para reportar (nenhuma resposta processada) — não
  // vale a pena interromper o pesquisador com uma notificação vazia.
  if (totalSynced === 0 && summary.conflicts === 0 && summary.failed === 0) return;

  const Notifications = await getNotifications();
  if (!Notifications) return;

  const granted = await ensurePermission(Notifications);
  if (!granted) return;

  const parts = [`${totalSynced} sincronizada(s)`];
  if (summary.conflicts > 0) parts.push(`${summary.conflicts} em conflito`);
  if (summary.failed > 0) parts.push(`${summary.failed} com falha`);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Sincronização concluída',
      body: parts.join(' · '),
    },
    trigger: null,
  });
}
