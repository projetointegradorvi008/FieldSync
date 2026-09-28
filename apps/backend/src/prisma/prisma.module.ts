import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global() torna o PrismaService disponível em qualquer módulo sem
// precisar reimportar PrismaModule em cada um.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
