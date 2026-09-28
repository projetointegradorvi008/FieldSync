import { NextResponse } from 'next/server';
import { backendFetch } from '@/lib/backend';
import { clearAuthCookies, getOrCreateDeviceId, getRefreshToken, setRefreshTokenCookie } from '@/lib/cookies';

// Renova o access token lendo o refresh token do cookie httpOnly (nunca do
// corpo da requisição do cliente) — chamado pelo AuthProvider a cada 401.
export async function POST() {
  const refreshToken = await getRefreshToken();
  const deviceId = await getOrCreateDeviceId();

  if (!refreshToken) {
    return NextResponse.json({ error: { code: 'TOKEN_EXPIRED', message: 'Sem sessão ativa.' } }, { status: 401 });
  }

  const backendResponse = await backendFetch('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken, deviceId }),
  });

  const data = await backendResponse.json();

  if (!backendResponse.ok) {
    await clearAuthCookies();
    return NextResponse.json(data, { status: backendResponse.status });
  }

  await setRefreshTokenCookie(data.refreshToken);

  return NextResponse.json({ accessToken: data.accessToken, expiresIn: data.expiresIn });
}
