import { IsDateString, IsOptional, IsString } from 'class-validator';

// Corpo esperado por POST /surveys. Cria a pesquisa em DRAFT (sem schema de
// formulário ainda) — o schema só é definido ao publicar (PublishSurveyDto).
export class CreateSurveyDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Categoria livre definida pelo Gestor (ex: "Censo", "Satisfação") —
  // metadado descritivo exibido no cabeçalho "Metadados" da Web.
  @IsOptional()
  @IsString()
  type?: string;

  // Estilo predominante das perguntas (ex: "Likert", "Aberta") — também
  // livre, definido pelo Gestor.
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
