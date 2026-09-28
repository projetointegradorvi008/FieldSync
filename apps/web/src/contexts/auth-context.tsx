'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { extractApiErrorMessage } from '@/lib/error-message';

// Contexto React de autenticação do Web. O access token nunca é persistido
// (nem em localStorage nem em cookie legível por JS) — vive só em memória
// (accessTokenRef) e é renovado via /api/auth/refresh (que lê o refresh
// token do cookie httpOnly) sempre que uma chamada via apiFetch recebe 401.
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: (reason?: 'idle' | 'revoked') => Promise<void>;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Tempo de inatividade (sem mouse/teclado/toque) até o logout automático de
// um perfil logado — independe da expiração do refresh token no backend.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const IDLE_ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;

function readUserCookie(): AuthUser | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )fieldsync_user=([^;]*)/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const accessTokenRef = useRef<string | null>(null);
  // O refresh token é rotacionado a cada uso (ver REUSE_DETECTED no backend):
  // duas chamadas concorrentes a /api/auth/refresh (ex: vários widgets do
  // dashboard recebendo 401 ao mesmo tempo) fariam a segunda reenviar um
  // token já rotacionado pela primeira, derrubando todas as sessões. Este
  // ref garante que só exista uma requisição de refresh em voo por vez —
  // chamadas concorrentes reaproveitam a mesma promise.
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  const refresh = useCallback((): Promise<string | null> => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const promise = (async () => {
      try {
        const response = await fetch('/api/auth/refresh', { method: 'POST' });
        if (!response.ok) {
          accessTokenRef.current = null;
          setUser(null);
          return null;
        }
        const data = await response.json();
        accessTokenRef.current = data.accessToken;
        return data.accessToken;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    const cookieUser = readUserCookie();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reidratação síncrona do cookie de perfil no mount
    if (cookieUser) setUser(cookieUser);

    refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(extractApiErrorMessage(data, 'Falha ao entrar.'));
    }

    accessTokenRef.current = data.accessToken;
    setUser(data.user);
  }, []);

  const logout = useCallback(
    async (reason?: 'idle' | 'revoked') => {
      await fetch('/api/auth/logout', { method: 'POST' });
      accessTokenRef.current = null;
      setUser(null);
      router.push(reason ? `/login?reason=${reason}` : '/login');
    },
    [router],
  );

  // Logout automático por inatividade: com um usuário logado, qualquer
  // ausência de atividade (mouse, teclado, toque, scroll) por IDLE_TIMEOUT_MS
  // força o logout, mesmo que o refresh token ainda seja válido.
  useEffect(() => {
    if (!user) return;

    let timer: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        logout('idle');
      }, IDLE_TIMEOUT_MS);
    };

    resetTimer();
    IDLE_ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));

    return () => {
      clearTimeout(timer);
      IDLE_ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [user, logout]);

  // Detecta sessão revogada em outro lugar (revogação manual na aba
  // Sessões, usuário desativado, ou login no mesmo usuário em outro
  // dispositivo/aba — sessão única por usuário) ao voltar para esta aba —
  // sem isso, só seria descoberta na próxima chamada de API que por acaso
  // desse 401. Equivalente ao check de foreground do Mobile (auth-context.tsx lá).
  useEffect(() => {
    if (!user) return;

    async function checkSessionValidity() {
      if (document.visibilityState !== 'visible') return;
      const token = await refresh();
      if (!token) {
        logout('revoked');
      }
    }

    document.addEventListener('visibilitychange', checkSessionValidity);
    return () => document.removeEventListener('visibilitychange', checkSessionValidity);
  }, [user, refresh, logout]);

  const apiFetch = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const doFetch = (token: string | null) =>
        fetch(`/api/backend${path}`, {
          ...init,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...init.headers,
          },
        });

      let response = await doFetch(accessTokenRef.current);

      if (response.status === 401) {
        const newToken = await refresh();
        if (!newToken) {
          await logout();
          throw new Error('Sessão expirada.');
        }
        response = await doFetch(newToken);
      }

      return response;
    },
    [refresh, logout],
  );

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, apiFetch }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de um <AuthProvider>');
  }
  return ctx;
}
