import * as SecureStore from 'expo-secure-store';
import { generateUuid } from '../../utils/uuid';

const DEVICE_ID_KEY = 'fieldsync_device_id';

// Gera (uma única vez, na primeira execução) e depois sempre reutiliza um
// identificador estável para este aparelho — usado em login e em cada
// sincronização, para o Backend distinguir dispositivos do mesmo usuário.

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;

  const deviceId = generateUuid();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  return deviceId;
}
