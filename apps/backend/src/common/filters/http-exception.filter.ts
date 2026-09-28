import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

// Filtro global de exceções — garante que qualquer erro que chegue ao
// cliente use uma mensagem em português que uma pessoa leiga consiga
// entender, mesmo quando a causa real é técnica (validação de DTO, erro do
// Prisma/Postgres, exceção não tratada). O detalhe técnico é sempre
// registrado no log do servidor via Logger, nunca exposto na resposta.
//
// Exceções lançadas manualmente pelos services com `{code, message}` (ex.:
// ConflictException({code: 'SURVEY_ALREADY_ARCHIVED', message: '...'})) já
// usam mensagens amigáveis em português — passam por este filtro sem
// alteração.

const VALIDATION_MESSAGE =
  'Alguns campos não foram preenchidos corretamente. Verifique os dados e tente novamente.';
const GENERIC_MESSAGE =
  'Ocorreu um erro inesperado. Tente novamente em instantes.';

// Ver https://www.prisma.io/docs/orm/reference/error-reference para a lista
// completa de códigos — só mapeamos os que realmente podem surgir das
// operações deste projeto (constraints únicas, registro não encontrado,
// violação de chave estrangeira).
const PRISMA_ERROR_MESSAGES: Record<string, string> = {
  P2002: 'Já existe um registro com esses dados.',
  P2025: 'Registro não encontrado.',
  P2003: 'Não é possível concluir esta ação porque há dados relacionados.',
};

function isFriendlyExceptionBody(
  body: unknown,
): body is { code: string; message: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    typeof (body as Record<string, unknown>).message === 'string'
  );
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (isFriendlyExceptionBody(body)) {
        response.status(status).json(body);
        return;
      }

      if (exception instanceof BadRequestException) {
        this.logger.warn(`Validação falhou: ${JSON.stringify(body)}`);
        response.status(status).json({
          code: 'VALIDATION_ERROR',
          message: VALIDATION_MESSAGE,
        });
        return;
      }

      response
        .status(status)
        .json(typeof body === 'string' ? { message: body } : body);
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      this.logger.error(
        `Erro do Prisma [${exception.code}]: ${exception.message}`,
      );
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        code: `DATABASE_${exception.code}`,
        message: PRISMA_ERROR_MESSAGES[exception.code] ?? GENERIC_MESSAGE,
      });
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_ERROR',
      message: GENERIC_MESSAGE,
    });
  }
}
