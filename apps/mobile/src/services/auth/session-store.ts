import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'fieldsync_access_token';
const REFRESH_TOKEN_KEY = 'fieldsync_refresh_token';
const USER_KEY = 'fieldsync_user';

// Leitura/escrita da sessão (tokens + perfil do usuário) no armazenamento
// criptografado do sistema operacional (expo-secure-store) — nunca no SQLite.

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function saveSession(accessToken: string, refreshToken: string, user: StoredUser): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
  ]);
}

export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
  ]);
}

export function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function getStoredUser(): Promise<StoredUser | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

// ⚠️ Só limpa o SecureStore (tokens/perfil). NUNCA apaga o SQLite (dados
// offline coletados) — ver "Fluxo de revogação" em 4.1 na spec.
export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
  ]);
}
