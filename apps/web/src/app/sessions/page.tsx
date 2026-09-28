'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts/toast-context';
import { NavBar } from '@/components/nav-bar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DevicePairingQr } from '@/components/device-pairing-qr';
import { extractApiErrorMessage, getFriendlyErrorMessage } from '@/lib/error-message';

const AUTO_REFRESH_INTERVAL_MS = 15_000;
// VISUALIZADOR só enxerga dados (Dashboard/Analytics/Painel/mapa) — mesma
// regra do NavBar (que já esconde o link). Redireciona aqui também para
// bloquear quem chegar direto pela URL, sem depender só do link escondido.
const SESSIONS_BLOCKED_ROLES = ['VISUALIZADOR'];

interface Session {
  id: string;
  deviceId: string;
  deviceName: string | null;
  platform: string | null;
  lastSeenAt: string;
  current: boolean;
  owner: { id: string; name: string };
  isOwnSession: boolean;
}

// Lista as sessões/dispositivos ativos (GET /auth/sessions) e permite
// revogar um deles individualmente. Para ADMINISTRADOR/GESTOR/SUPERVISOR,
// inclui também os dispositivos de usuários hierarquicamente abaixo (ex: o
// celular de um PESQUISADOR já logado no Mobile) — não só a própria sessão
// do navegador atual — permitindo de fato usar a revogação cross-user que o
// Backend já suporta (ver auth.service.ts).
export default function SessionsPage() {
  const { user, apiFetch } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isBlocked = !!user && SESSIONS_BLOCKED_ROLES.includes(user.role);

  useEffect(() => {
    if (isBlocked) router.replace('/dashboard');
  }, [isBlocked, router]);

  async function loadSessions(options: { silent?: boolean } = {}) {
    if (!options.silent) setIsLoading(true);
    try {
      const response = await apiFetch('/auth/sessions');
      const data = await response.json();
      if (!response.ok) throw new Error(extractApiErrorMessage(data, 'Falha ao carregar sessões.'));
      setSessions(data.sessions);
    } catch (err) {
      if (!options.silent) toast.error(getFriendlyErrorMessage(err, 'Falha ao carregar sessões.'));
    } finally {
      if (!options.silent) setIsLoading(false);
    }
  }

  useEffect(() => {
    if (isBlocked) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca inicial ao montar
    loadSessions();
    // Autoatualização: mantém a lista de dispositivos conectados em dia sem
    // que o usuário precise recarregar a página manualmente. Silenciosa (sem
    // spinner nem popup de erro a cada ciclo) para não incomodar quem está
    // só olhando a tela.
    const interval = setInterval(() => loadSessions({ silent: true }), AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBlocked]);

  if (isBlocked) return null;

  async function revoke(session: Session) {
    // Ação destrutiva: revoga a sessão imediatamente, derrubando
    // o dispositivo de campo mesmo em meio a uma coleta em andamento.
    const label = session.deviceName ?? session.deviceId;
    if (!window.confirm(`Revogar a sessão de "${label}"? O dispositivo será desconectado imediatamente.`)) {
      return;
    }
    try {
      const response = await apiFetch(`/auth/sessions/${session.deviceId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(extractApiErrorMessage(data, 'Falha ao revogar sessão.'));
      }
      toast.success('Sessão revogada.');
      await loadSessions();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Falha ao revogar sessão.'));
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <NavBar />
      <main className="flex flex-1 flex-col gap-6 p-8">
        <h1 className="text-2xl font-semibold">Sessões ativas</h1>

        <DevicePairingQr />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dispositivos conectados</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Carregando...</p>
            ) : sessions.length === 0 ? (
              <p className="text-muted-foreground">Nenhum dispositivo conectado.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {sessions.map((session) => (
                  <li
                    key={session.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {session.deviceName ?? session.deviceId} {session.current && <Badge>Este dispositivo</Badge>}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {!session.isOwnSession && `${session.owner.name} · `}
                        {session.platform ?? 'plataforma desconhecida'} · última atividade em{' '}
                        {new Date(session.lastSeenAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => revoke(session)}>
                      Revogar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
