import { IsObject } from 'class-validator';

export class PublishSurveyDto {
  // Validado estruturalmente em survey-schema.validator.ts (Contrato C1) — aqui
  // só garantimos que é um objeto, para manter o código de erro SCHEMA_INVALID
  // consistente em vez do formato padrão do ValidationPipe.
  @IsObject()
  schema: Record<string, unknown>;
}
