import { Transform } from 'class-transformer';
import { IsArray, IsUUID } from 'class-validator';

export class SyncStatusQueryDto {
  // ?ids=uuid-1,uuid-2,uuid-3 — ver GET /api/v1/sync/status na especificação.
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];
}
