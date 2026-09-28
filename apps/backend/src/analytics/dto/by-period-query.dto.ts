import { IsDateString, IsIn, IsOptional } from 'class-validator';

// Query string aceita por GET .../by-period: granularidade da série
// temporal (dia/semana/mês, usada no `date_trunc` da consulta) e período.
export class ByPeriodQueryDto {
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  groupBy?: 'day' | 'week' | 'month' = 'day';

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
