import { IsDateString, IsOptional, IsString } from 'class-validator';

// Corpo esperado por PATCH /surveys/:id. Todos os campos são opcionais;
// SurveysService.update só permite editar uma pesquisa ainda em DRAFT.
export class UpdateSurveyDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  questionStyle?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
