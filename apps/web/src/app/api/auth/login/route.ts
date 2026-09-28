import { NextResponse } from 'next/server';
import { backendFetch } from '@/lib/backend';
import { getOrCreateDeviceId, setRefreshTokenCookie, setUserProfileCookie } from '@/lib/cookies';

// Parte do "BFF": recebe email/senha do formulário de login, chama o
// Backend real e guarda o refresh token num cookie httpOnly (nunca exposto
// ao JavaScript do navegador) — só o access token volta no corpo da
// resposta, para o AuthProvider guardar em memória.
export async function POST(request: Request) {
  const body = await request.json();
  const deviceId = await getOrCreateDeviceId();

  const backendResponse = await backendFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: body.email,
      password: body.password,
      deviceId,
      deviceName: 'Navegador Web',
      platform: 'web',
    }),
  });

  const data = await backendResponse.json();

  if (!backendResponse.ok) {
    return NextResponse.json(data, { status: backendResponse.status });
  }

  await setRefreshTokenCookie(data.tokens.refreshToken);
  await setUserProfileCookie(data.user);

  return NextResponse.json({
    user: data.user,
    accessToken: data.tokens.accessToken,
    expiresIn: data.tokens.expiresIn,
  });
}
