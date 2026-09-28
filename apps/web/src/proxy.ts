import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { REFRESH_TOKEN_COOKIE } from '@/lib/cookies';

// Proteção de rota "otimista": só verifica a PRESENÇA do cookie httpOnly do
// refresh token (não pode validar o access token aqui, pois ele só existe em
// memória no cliente). A autorização real por perfil continua sendo aplicada
// no Backend em cada endpoint — ver 1.1 na spec.
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(REFRESH_TOKEN_COOKIE);
  const isLoginPage = request.nextUrl.pathname === '/login';

  if (!hasSession && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (hasSession && isLoginPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
