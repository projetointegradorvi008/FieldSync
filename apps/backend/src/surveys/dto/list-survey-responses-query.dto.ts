import { ResponseStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

// Query string aceita por GET /surveys/:id/responses: paginação e filtros
// (pesquisador, status, intervalo de datas da coleta).
export class ListSurveyResponsesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsUUID()
  researcherId?: string;

  @IsOptional()
  @IsEnum(ResponseStatus)
  status?: ResponseStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
