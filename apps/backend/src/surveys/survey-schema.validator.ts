import { BadRequestException } from '@nestjs/common';
import { QuestionType } from '@prisma/client';

// Validação estrutural do Contrato C1 (ver docs/FieldSync_Especificacao_Tecnica.md).
// A validação SEMÂNTICA completa (ex: desnormalização em Question/QuestionOption)
// é feita em SurveysService.publish — aqui garantimos apenas que o formato
// aceito pelo Backend/Mobile está correto antes de gravar o JSONB da SurveyVersion.

export interface ValidatedQuestion {
  id: string;
  type: QuestionType;
  label: string;
  required: boolean;
  orderIndex: number;
  config?: Record<string, unknown>;
}

export interface ValidatedSection {
  id: string;
  title?: string;
  // Seção "cabeçalho": respondida uma única vez por sessão de coleta no
  // Mobile (reaproveitada nas respostas seguintes da mesma pesquisa),
  // sempre a primeira seção do formulário — ver FormRendererScreen. No
  // máximo uma seção pode ser isHeader (validado abaixo).
  isHeader?: boolean;
  questions: ValidatedQuestion[];
}

export interface ValidatedSurveySchema {
  title?: string;
  sections: ValidatedSection[];
}

export const CHOICE_TYPES = new Set<string>([
  QuestionType.SINGLE_CHOICE,
  QuestionType.MULTIPLE_CHOICE,
]);

function invalid(message: string): never {
  throw new BadRequestException({ code: 'SCHEMA_INVALID', message });
}

export function validateSurveySchema(input: unknown): ValidatedSurveySchema {
  if (typeof input !== 'object' || input === null) {
    invalid('O schema deve ser um objeto.');
  }
  const raw = input as Record<string, unknown>;

  if (!Array.isArray(raw.sections) || raw.sections.length === 0) {
    invalid('O schema deve conter ao menos uma seção em "sections".');
  }

  const seenQuestionIds = new Set<string>();

  const sections: ValidatedSection[] = (raw.sections as unknown[]).map(
    (rawSection, sectionIndex) => {
      if (typeof rawSection !== 'object' || rawSection === null) {
        invalid(`Seção no índice ${sectionIndex} deve ser um objeto.`);
      }
      const section = rawSection as Record<string, unknown>;

      if (typeof section.id !== 'string' || !section.id) {
        invalid(`Seção no índice ${sectionIndex} precisa de um "id".`);
      }
      if (!Array.isArray(section.questions) || section.questions.length === 0) {
        invalid(`Seção "${section.id}" deve conter ao menos uma pergunta.`);
      }
      const isHeader = section.isHeader === true;

      const questions: ValidatedQuestion[] = (
        section.questions as unknown[]
      ).map((rawQuestion, questionIndex) => {
        if (typeof rawQuestion !== 'object' || rawQuestion === null) {
          invalid(
            `Pergunta no índice ${questionIndex} da seção "${section.id}" deve ser um objeto.`,
          );
        }
        const question = rawQuestion as Record<string, unknown>;

        if (typeof question.id !== 'string' || !question.id) {
          invalid(
            `Pergunta no índice ${questionIndex} da seção "${section.id}" precisa de um "id".`,
          );
        }
        const questionId = question.id as string;
        if (seenQuestionIds.has(questionId)) {
          invalid(`Id de pergunta duplicado: "${questionId}".`);
        }
        seenQuestionIds.add(questionId);

        if (
          typeof question.type !== 'string' ||
          !(question.type in QuestionType)
        ) {
          invalid(
            `Tipo de pergunta inválido em "${questionId}": ${String(question.type)}.`,
          );
        }
        if (typeof question.label !== 'string' || !question.label) {
          invalid(`Pergunta "${questionId}" precisa de um "label".`);
        }
        if (typeof question.required !== 'boolean') {
          invalid(`Pergunta "${questionId}" precisa de "required" booleano.`);
        }
        if (typeof question.orderIndex !== 'number') {
          invalid(`Pergunta "${questionId}" precisa de "orderIndex" numérico.`);
        }

        const type = question.type as QuestionType;
        const config = question.config as Record<string, unknown> | undefined;

        if (isHeader && type === QuestionType.GPS) {
          invalid(
            `Pergunta "${questionId}" do tipo ${type} não pode estar na seção cabeçalho — localização é específica de cada resposta, não faz sentido reaproveitada por sessão.`,
          );
        }

        if (CHOICE_TYPES.has(type)) {
          if (
            !config ||
            !Array.isArray(config.options) ||
            config.options.length === 0
          ) {
            invalid(
              `Pergunta "${questionId}" do tipo ${type} precisa de "config.options" não vazio.`,
            );
          }
        }

        return {
          id: questionId,
          type,
          label: question.label as string,
          required: question.required as boolean,
          orderIndex: question.orderIndex as number,
          config,
        };
      });

      return {
        id: section.id as string,
        title: typeof section.title === 'string' ? section.title : undefined,
        isHeader,
        questions,
      };
    },
  );

  const headerSections = sections.filter((section) => section.isHeader);
  if (headerSections.length > 1) {
    invalid('No máximo uma seção pode ser marcada como cabeçalho.');
  }

  // A seção cabeçalho é sempre a primeira exibida no Mobile, independente da
  // ordem em que foi desenhada no construtor — ver FormRendererScreen.
  const orderedSections =
    headerSections.length === 1
      ? [headerSections[0], ...sections.filter((section) => !section.isHeader)]
      : sections;

  return {
    title: typeof raw.title === 'string' ? raw.title : undefined,
    sections: orderedSections,
  };
}
