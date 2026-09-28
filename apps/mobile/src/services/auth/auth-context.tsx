import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { API_URL, refreshTokens } from '../api/client';
import { getOrCreateDeviceId } from './device-id';
import { onSessionRevoked } from './revocation-bus';
import { clearSession, getAccessToken, getStoredUser, saveSession, StoredUser } from './session-store';

// Tempo em segundo plano até forçar o logout automático de um perfil
// logado — equivalente móvel do timer de inatividade do Web (não há
// mouse/teclado aqui, então usamos o tempo em background como proxy de
// inatividade).
const IDLE_BACKGROUND_MS = 30 * 60 * 1000;

// Contexto React de autenticação: guarda o usuário logado e expõe
// login/logout para o resto do app. Login/logout de sessão não apagam o
// SQLite (dados offline coletados) — só o SecureStore (tokens/perfil).
interface AuthContextValue {
  user: StoredUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    onSessionRevoked(() => setUser(null));

    (async () => {
      const [token, storedUser] = await Promise.all([getAccessToken(), getStoredUser()]);
      if (token && storedUser) {
        setUser(storedUser);
      }
      setIsLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const deviceId = await getOrCreateDeviceId();

    const response = await fetch(`${API_URL}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        deviceId,
        deviceName: 'Dispositivo Android',
        platform: 'android',
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message ?? 'Falha ao entrar.');
    }

    await saveSession(data.tokens.accessToken, data.tokens.refreshToken, data.user);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    // Preserva o SQLite (dados offline) — só limpa tokens/perfil do SecureStore.
    await clearSession();
    setUser(null);
  }, []);

  // Logout automático por inatividade: se o app ficou em background por
  // mais de IDLE_BACKGROUND_MS, desloga ao voltar ao primeiro plano em vez
  // de deixar o refresh token (válido por dias) manter a sessão aberta.
  const backgroundedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (!user) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundedAtRef.current = Date.now();
        return;
      }

      if (nextState === 'active' && backgroundedAtRef.current !== null) {
        const elapsed = Date.now() - backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (elapsed >= IDLE_BACKGROUND_MS) {
          logout();
          return;
        }
        // Sessão revogada em outro lugar (manual, desativação de usuário,
        // login em outro dispositivo — sessão única) enquanto o app estava
        // em background: sem isso, só seria descoberta na próxima chamada
        // de API que por acaso desse 401. refreshTokens() já limpa a sessão
        // e dispara onSessionRevoked (acima) quando o token foi revogado.
        refreshTokens().catch(() => {});
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [user, logout]);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de um <AuthProvider>');
  }
  return ctx;
}
