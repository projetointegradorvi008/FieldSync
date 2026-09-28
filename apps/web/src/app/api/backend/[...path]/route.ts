import { NextRequest, NextResponse } from 'next/server';
import { backendFetch } from '@/lib/backend';

async function proxy(request: NextRequest, ctx: RouteContext<'/api/backend/[...path]'>) {
  const { path } = await ctx.params;
  const search = request.nextUrl.search;
  const authorization = request.headers.get('authorization');

  const hasBody = request.method !== 'GET' && request.method !== 'DELETE';
  const body = hasBody ? await request.text() : undefined;

  const backendResponse = await backendFetch(`/${path.join('/')}${search}`, {
    method: request.method,
    headers: authorization ? { authorization } : undefined,
    body,
  });

  // arrayBuffer (não .text()) para repassar os bytes exatamente como vieram —
  // .text() decodifica como UTF-8 e descarta um BOM inicial (ex: o export
  // CSV em analytics.service.ts depende do BOM para abrir corretamente no
  // Excel).
  const responseBody = await backendResponse.arrayBuffer();
  const contentDisposition = backendResponse.headers.get('content-disposition');
  // 204/205/304 nunca podem ter corpo (o construtor de Response lança
  // TypeError se receber um, mesmo vazio) — ex: DELETE /auth/sessions/:id
  // (revogar sessão) responde 204 e quebrava aqui, derrubando o botão
  // "Revogar" da aba Sessões com um 500 antes mesmo de chegar ao navegador.
  const isNoBodyStatus = [204, 205, 304].includes(backendResponse.status);
  return new NextResponse(isNoBodyStatus ? null : responseBody, {
    status: backendResponse.status,
    headers: {
      'Content-Type': backendResponse.headers.get('content-type') ?? 'application/json',
      ...(contentDisposition ? { 'Content-Disposition': contentDisposition } : {}),
    },
  });
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
