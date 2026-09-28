export type QuestionType =
  | 'TEXT'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'SINGLE_CHOICE'
  | 'MULTIPLE_CHOICE'
  | 'DATE'
  | 'TIME'
  | 'GPS';

export const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'TEXT', label: 'Texto' },
  { value: 'NUMBER', label: 'Número' },
  { value: 'BOOLEAN', label: 'Sim / Não' },
  { value: 'SINGLE_CHOICE', label: 'Escolha única' },
  { value: 'MULTIPLE_CHOICE', label: 'Múltipla escolha' },
  { value: 'DATE', label: 'Data' },
  { value: 'TIME', label: 'Hora' },
  { value: 'GPS', label: 'Localização (GPS)' },
];

// RF11 — reaproveitar valor durante a sessão de coleta. Só faz sentido para
// perguntas de contexto (não sobre o entrevistado) — ver 1.4 na spec.
export const SESSION_SCOPABLE_TYPES: QuestionType[] = ['TEXT', 'SINGLE_CHOICE', 'NUMBER'];

export interface QuestionDraft {
  id: string;
  type: QuestionType;
  label: string;
  required: boolean;
  sessionScoped: boolean;
  config: Record<string, unknown>;
}

export interface SectionDraft {
  id: string;
  title: string;
  // Seção cabeçalho: respondida uma única vez por sessão de coleta no
  // Mobile (reaproveitada nas próximas respostas da mesma pesquisa) e exigida
  // antes de liberar as demais seções — sempre a primeira do formulário.
  // No máximo uma seção pode ser marcada como cabeçalho.
  isHeader: boolean;
  questions: QuestionDraft[];
}

// GPS é específico de cada resposta (localização é capturada
// automaticamente ao concluir) — não faz sentido dentro da seção cabeçalho.
export const HEADER_INCOMPATIBLE_TYPES: QuestionType[] = ['GPS'];

function randomId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function defaultConfigFor(type: QuestionType): Record<string, unknown> {
  switch (type) {
    case 'TEXT':
      return { maxLength: 200 };
    case 'SINGLE_CHOICE':
    case 'MULTIPLE_CHOICE':
      return { options: ['Opção 1', 'Opção 2'] };
    case 'DATE':
      return { format: 'DD/MM/AAAA' };
    case 'TIME':
      return { format: 'HH:mm' };
    case 'GPS':
      return { precisionThreshold: 20 };
    default:
      return {};
  }
}

export function newQuestion(type: QuestionType = 'TEXT'): QuestionDraft {
  return {
    id: randomId(),
    type,
    label: '',
    required: false,
    sessionScoped: false,
    config: defaultConfigFor(type),
  };
}

export function newSection(): SectionDraft {
  return { id: randomId(), title: '', isHeader: false, questions: [] };
}

interface RawQuestion {
  id: string;
  type: QuestionType;
  label: string;
  required?: boolean;
  config?: Record<string, unknown> & { sessionScoped?: boolean };
}

interface RawSection {
  id: string;
  title?: string;
  isHeader?: boolean;
  questions?: RawQuestion[];
}

// Converte um schema já publicado (GET /surveys/:id/versions/:version) de
// volta para o formato do construtor, para permitir editar antes de
// republicar.
export function schemaToSections(schema: { sections?: RawSection[] } | null | undefined): SectionDraft[] {
  if (!schema?.sections) return [];
  return schema.sections.map((section) => ({
    id: section.id,
    title: section.title ?? '',
    isHeader: !!section.isHeader,
    questions: (section.questions ?? []).map((question) => {
      const { sessionScoped, ...config } = question.config ?? {};
      return {
        id: question.id,
        type: question.type,
        label: question.label,
        required: !!question.required,
        sessionScoped: !!sessionScoped,
        config,
      };
    }),
  }));
}

// Converte de volta para o formato aceito por POST /surveys/:id/publish
// (Contrato C1).
export function sectionsToSchema(sections: SectionDraft[]) {
  return {
    sections: sections.map((section, sectionIndex) => ({
      id: section.id,
      title: section.title || `Seção ${sectionIndex + 1}`,
      isHeader: section.isHeader,
      questions: section.questions.map((question, questionIndex) => ({
        id: question.id,
        type: question.type,
        label: question.label,
        required: question.required,
        orderIndex: questionIndex,
        config: {
          ...question.config,
          ...(question.sessionScoped ? { sessionScoped: true } : {}),
        },
      })),
    })),
  };
}
