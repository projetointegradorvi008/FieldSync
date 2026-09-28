'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Rota "/" não tem conteúdo próprio — só redireciona para o Dashboard. O
// `proxy.ts` (matcher de rotas) decide antes disso se o usuário vai
// parar no /login ou seguir até aqui.
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return null;
}
