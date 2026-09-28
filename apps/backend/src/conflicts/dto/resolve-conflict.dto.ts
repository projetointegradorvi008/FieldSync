import { ConflictResolution } from '@prisma/client';
import { IsEnum } from 'class-validator';

// Corpo esperado por PATCH /conflicts/:id/resolve: qual lado do conflito o
// gestor escolheu manter (KEEP_FIRST/KEEP_SECOND) ou se descartou ambos
// (DISCARD_BOTH) — ver ConflictResolution no schema.prisma.
export class ResolveConflictDto {
  @IsEnum(ConflictResolution)
  action: ConflictResolution;
}
