import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// Filtros comuns a by-researcher e locations (pesquisador + período) — ver
// 1.8/1.9 na especificação ("Filtrar e agrupar... pesquisador, período").
export class AnalyticsFilterQueryDto {
  @IsOptional()
  @IsUUID()
  researcherId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
