'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts/toast-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getFriendlyErrorMessage } from '@/lib/error-message';

// Tela de login. A chamada real ao Backend acontece dentro de
// AuthProvider.login (via /api/auth/login) — esta página só coleta o
// formulário e trata o resultado.
function LoginForm() {
  const { login } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Definido pelo AuthProvider ao forçar logout (inatividade — IDLE_TIMEOUT_MS
  // — ou sessão revogada: revogação manual, usuário desativado, ou login
  // no mesmo usuário em outro lugar — sessão única) — avisa o motivo via popup.
  const reason = searchParams.get('reason');
  useEffect(() => {
    if (reason === 'idle') {
      toast.info('Sua sessão expirou por inatividade. Entre novamente.');
    } else if (reason === 'revoked') {
      toast.info('Sua sessão foi encerrada (por um administrador, ou por um novo login nesta conta). Entre novamente.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Falha ao entrar.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid flex-1 md:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[oklch(0.30_0.10_255)] via-[oklch(0.20_0.09_260)] to-[oklch(0.15_0.06_262)] p-14 text-white md:flex">
        <div
          aria-hidden
          className="absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full"
          style={{ background: 'radial-gradient(closest-side, oklch(0.55 0.16 255 / 0.35), transparent 70%)' }}
        />
        <span className="relative z-10 flex items-center gap-2 text-lg font-semibold">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"
              stroke="white"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M9.2 8.6a3.2 3.2 0 0 1 5.4-1.3M14.8 10.4a3.2 3.2 0 0 1-5.4 1.3"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          FieldSync
        </span>

        <div className="relative z-10 flex max-w-sm flex-col gap-4">
          {[
            {
              title: 'Coleta em campo',
              desc: 'Pesquisadores registram dados offline-first, com GPS, direto no ponto de coleta.',
            },
            {
              title: 'Sincronização automática',
              desc: 'Assim que o celular reconecta, as respostas sobem e conflitos são sinalizados.',
            },
            {
              title: 'Painel do gestor',
              desc: 'Indicadores, mapas de coleta e analytics em tempo real para toda a operação.',
            },
          ].map((step, i, arr) => (
            <div key={step.title} className="flex items-start gap-3.5">
              <div className="flex flex-col items-center">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-white shadow-[0_0_0_4px_oklch(1_0_0/0.15)]" />
                {i < arr.length - 1 && <span className="mt-1 w-px flex-1 bg-white/25" />}
              </div>
              <div>
                <h4 className="text-sm font-semibold">{step.title}</h4>
                <p className="text-[13px] text-white/65">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="relative z-10 max-w-sm text-[13px] leading-relaxed text-white/55">
          Plataforma para pesquisas operacionais em campo — transporte público, coleta
          georreferenciada e sincronização offline-first.
        </p>
      </div>

      <div className="flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Bem-vindo(a) de volta</CardTitle>
            <CardDescription>Entre com sua conta para acessar o painel.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Senha</Label>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={isSubmitting} className="mt-2">
                {isSubmitting ? 'Entrando...' : 'Entrar'}
              </Button>
            </form>
            <p className="mt-5 text-center text-xs text-muted-foreground">
              Acesso restrito a usuários cadastrados pela sua organização.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
