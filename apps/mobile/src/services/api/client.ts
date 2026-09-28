import { getOrCreateDeviceId } from '../auth/device-id';
import { clearSession, getAccessToken, getRefreshToken, saveTokens } from '../auth/session-store';
import { notifySessionRevoked } from '../auth/revocation-bus';

// EXPO_PUBLIC_API_URL segue a mesma convenção do .env.example na raiz do
// projeto: já inclui o sufixo "/api" (ex: http://100.x.x.1/api).
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost/api';

export class SessionRevokedError extends Error {}

// O refresh token é rotacionado a cada uso pelo backend (REUSE_DETECTED):
// duas chamadas concorrentes de refreshTokens() (ex: duas telas chamando
// apiFetch ao mesmo tempo com o access token expirado) fariam a segunda
// reenviar um token já rotacionado pela primeira, derrubando a sessão
// inteira. Este ref garante que só exista uma requisição de refresh em voo
// por vez — chamadas concorrentes reaproveitam a mesma promise.
let refreshPromise: Promise<string> | null = null;

// Exportado para o AuthProvider chamar proativamente ao voltar ao primeiro
// plano (ver auth-context.tsx) — é a única forma de descobrir uma sessão
// revogada (revogação manual, desativação de usuário, login em outro
// dispositivo) sem esperar uma chamada de API com 401 acontecer por acaso;
// não há canal de push neste app.
export async function refreshTokens(): Promise<string> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const refreshToken = await getRefreshToken();
    const deviceId = await getOrCreateDeviceId();

    if (!refreshToken) {
      throw new SessionRevokedError('Sem sessão ativa.');
    }

    const response = await fetch(`${API_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken, deviceId }),
    });

    if (!response.ok) {
      // TOKEN_REVOKED ou TOKEN_EXPIRED — limpa o SecureStore (nunca o SQLite,
      // ver session-store.ts) e avisa o AuthProvider para voltar à tela de login.
      await clearSession();
      notifySessionRevoked();
      throw new SessionRevokedError('Sessão revogada ou expirada.');
    }

    const data = await response.json();
    await saveTokens(data.accessToken, data.refreshToken);
    return data.accessToken;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

// Interceptor HTTP mínimo (ver 4.1/2.2 na spec): anexa o access token, e se o
// Backend responder 401, tenta renovar via refresh token uma única vez antes
// de desistir.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const accessToken = await getAccessToken();

  const doFetch = (token: string | null) =>
    fetch(`${API_URL}/v1${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });

  let response = await doFetch(accessToken);

  if (response.status === 401) {
    const newToken = await refreshTokens();
    response = await doFetch(newToken);
  }

  return response;
}
