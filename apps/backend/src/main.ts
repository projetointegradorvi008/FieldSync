import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Headers HTTP de segurança (OWASP A05) — X-Content-Type-Options,
  // X-Frame-Options, etc.
  app.use(helmet());

  // CORS explícito (OWASP A05) — nunca "*" com credentials: true. Em
  // produção, CORS_ORIGIN aponta para o domínio real do Front-End Web.
  const corsOrigin = (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(
    ',',
  );
  app.enableCors({ origin: corsOrigin, credentials: true });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Traduz qualquer erro (validação, Prisma/Postgres, ou não tratado) para
  // uma mensagem em português compreensível por um usuário leigo — ver
  // GlobalExceptionFilter para o detalhe técnico, que continua só no log.
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Swagger expõe o mapa completo da API (rotas, DTOs) sem autenticação —
  // útil em dev/homologação, mas reconhecimento de graça para um atacante em
  // produção. Só monta em ambientes não-produtivos.
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('FieldSync API')
      .setDescription(
        'Plataforma para pesquisas operacionais em campo — offline-first, com sincronização e georreferenciamento.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, swaggerDocument);
  }

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
