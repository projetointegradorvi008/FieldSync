import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Encapsula o PrismaClient gerado a partir de schema.prisma, conectando ao
// Postgres quando o módulo Nest sobe e desconectando ao encerrar. Todo
// serviço que precisa consultar o banco injeta este serviço.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
