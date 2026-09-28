import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

// Query string aceita por GET /conflicts: paginação e filtro opcional por
// pesquisa. Só lista conflitos PENDING (ainda não resolvidos).
export class ListConflictsQueryDto {
  @IsOptional()
  @IsUUID()
  surveyId?: string;

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
}
