import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';

// Config pública, lida em tempo de execução (nunca em build) — necessário
// porque o build do Web roda em standalone e as variáveis passadas via
// `environment:` do docker-compose só existem no container em runtime, não
// no momento do `next build`. Usado pela aba de Sessões para renderizar o
// QR code de pareamento do Expo (ver EXPO_DEV_SERVER_URL no .env.example).
//
// O IP do Tailscale muda a cada restart da stack (ver
// apps/mobile/docker-entrypoint.sh), então preferimos sempre o arquivo que o
// serviço `mobile` escreve com o IP resolvido nesta subida
// (tailscale_ip_export, montado em /shared-ip:ro só aqui) em vez da
// EXPO_DEV_SERVER_URL estática do .env, que fica desatualizada. Se o
// arquivo não existir (ex: serviço `mobile` não está rodando, ou a
// resolução automática falhou lá), cai de volta silenciosamente para a env
// var, igual o próprio docker-entrypoint.sh faz.
const SHARED_IP_PATH = '/shared-ip/tailscale-ip';

export async function GET() {
  let expoDevServerUrl = process.env.EXPO_DEV_SERVER_URL || null;

  try {
    const resolvedIp = (await readFile(SHARED_IP_PATH, 'utf-8')).trim();
    if (resolvedIp) {
      expoDevServerUrl = `exp://${resolvedIp}:8081`;
    }
  } catch {
    // Arquivo ainda não existe ou não está acessível — usa o fallback acima.
  }

  return NextResponse.json({ expoDevServerUrl });
}
