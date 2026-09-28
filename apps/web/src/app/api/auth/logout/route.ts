import { backendFetch } from '@/lib/backend';
import { clearAuthCookies, getOrCreateDeviceId, getRefreshToken } from '@/lib/cookies';

// Invalida a sessão no Backend (revoga o refresh token) e limpa os cookies
// locais, mesmo se a chamada ao Backend falhar.
export async function POST() {
  const refreshToken = await getRefreshToken();
  const deviceId = await getOrCreateDeviceId();

  if (refreshToken) {
    await backendFetch('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken, deviceId }),
    });
  }

  await clearAuthCookies();

  return new Response(null, { status: 204 });
}
