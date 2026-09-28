import { randomUUID } from 'crypto';
import { cookies } from 'next/headers';

export const REFRESH_TOKEN_COOKIE = 'fieldsync_refresh_token';
export const DEVICE_ID_COOKIE = 'fieldsync_device_id';
export const USER_PROFILE_COOKIE = 'fieldsync_user';

const isProd = process.env.NODE_ENV === 'production';

export async function getOrCreateDeviceId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(DEVICE_ID_COOKIE)?.value;
  if (existing) return existing;

  const deviceId = randomUUID();
  store.set(DEVICE_ID_COOKIE, deviceId, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return deviceId;
}

export async function setRefreshTokenCookie(refreshToken: string): Promise<void> {
  const store = await cookies();
  store.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // espelha JWT_REFRESH_EXPIRES_IN (7d)
  });
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
}

// Não é httpOnly de propósito: só espelha dados já devolvidos no corpo do
// login (não sensíveis) para o AuthProvider reidratar sem um endpoint /me.
export async function setUserProfileCookie(user: UserProfile): Promise<void> {
  const store = await cookies();
  store.set(USER_PROFILE_COOKIE, JSON.stringify(user), {
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAuthCookies(): Promise<void> {
  const store = await cookies();
  store.delete(REFRESH_TOKEN_COOKIE);
  store.delete(USER_PROFILE_COOKIE);
}

export async function getRefreshToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(REFRESH_TOKEN_COOKIE)?.value;
}
