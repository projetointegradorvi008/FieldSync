import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../jwt-payload';

// Decorator de parâmetro: uso em um controller como `@CurrentUser() user:
// JwtPayload`, para ler o usuário autenticado (anexado pelo JwtAuthGuard em
// `request.user`) sem repetir esse acesso em cada rota.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
