import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

// GET /health — usado pelo healthcheck do Docker Compose, pelo Nginx e pelo
// smoke test do deploy.yml para saber se o Backend está de pé. Sem
// autenticação de propósito (precisa responder antes de qualquer login).
@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
