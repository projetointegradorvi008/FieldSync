import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class ExportQueryDto {
  @IsOptional()
  @IsIn(['csv', 'json'])
  format?: 'csv' | 'json' = 'csv';

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  researcherId?: string;

  // Ver LGPD (seção Privacidade e Proteção de Dados): por padrão o export
  // não inclui respondentId (PII). Marcar esta opção é uma decisão explícita
  // do exportador e fica registrada no AuditLog.
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includePii?: boolean = false;
}
