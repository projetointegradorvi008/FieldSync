import { ResponseStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

// Query string aceita por GET .../responses: paginação, filtros e ordenação
// (mais completa que ListSurveyResponsesQueryDto do módulo surveys, que é
// só o painel operacional básico do módulo surveys).
export class ListAnalyticsResponsesQueryDto {
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

  @IsOptional()
  @IsIn(['collectedAt', 'syncedAt'])
  sort?: 'collectedAt' | 'syncedAt' = 'collectedAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';
}
