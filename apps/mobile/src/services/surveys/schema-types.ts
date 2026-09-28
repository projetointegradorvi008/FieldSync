export type QuestionType =
  | 'TEXT'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'SINGLE_CHOICE'
  | 'MULTIPLE_CHOICE'
  | 'DATE'
  | 'TIME'
  | 'GPS';

export interface SchemaQuestion {
  id: string;
  type: QuestionType;
  label: string;
  required: boolean;
  orderIndex: number;
  config?: Record<string, unknown>;
}

export interface SchemaSection {
  id: string;
  title?: string;
  // Seção cabeçalho: sempre a primeira do formulário (o Backend já a
  // reordena em SurveysService.publish), respondida uma única vez por
  // sessão de coleta e obrigatória antes de liberar as demais seções — ver
  // FormRendererScreen.
  isHeader?: boolean;
  questions: SchemaQuestion[];
}

// Formato completo devolvido por GET /surveys/:id/versions/:version e
// armazenado em `survey_versions.schema_json` no SQLite (Contrato C1).
// description/type/questionStyle são metadados da pesquisa (não do
// formulário em si) — o Backend só os inclui a partir da versão publicada
// depois de SurveysService.publish passar a propagá-los (ver comentário lá).
export interface SurveySchema {
  surveyId: string;
  versionId: string;
  version: number;
  title: string;
  description?: string;
  type?: string;
  questionStyle?: string;
  sections: SchemaSection[];
}
