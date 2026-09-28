import { Type } from 'class-transformer';
import {
  IsArray,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class SyncLocationDto {
  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsOptional()
  @IsNumber()
  accuracy?: number;
}

export class SyncResponseItemDto {
  // UUID gerado NO dispositivo — é a chave de idempotência (ver 2.5/2.6).
  @IsUUID()
  id: string;

  @IsUUID()
  surveyVersionId: string;

  // Timestamp do dispositivo no momento da coleta (não da sincronização) —
  // validado contra o relógio do servidor pelo Contrato C4.
  @IsISO8601()
  collectedAt: string;

  @IsOptional()
  @IsString()
  locationHash?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SyncLocationDto)
  location?: SyncLocationDto;

  @IsOptional()
  @IsString()
  respondentId?: string;

  @IsObject()
  answers: Record<string, unknown>;
}

export class SyncRequestDto {
  // Identificador gerado pelo app na primeira execução (Device.deviceIdentifier)
  // — não confundir com o `id` interno da tabela `devices`.
  @IsUUID()
  deviceId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncResponseItemDto)
  responses: SyncResponseItemDto[];
}
