'use client';

import { useState } from 'react';
import { DndContext, DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QuestionRow } from './question-row';
import { SurveyPreview } from './preview';
import {
  HEADER_INCOMPATIBLE_TYPES,
  QUESTION_TYPES,
  QuestionType,
  SectionDraft,
  newQuestion,
  newSection,
  sectionsToSchema,
} from './types';

// Construtor visual de formulários: gerencia o estado local das
// seções/perguntas (drag-and-drop via dnd-kit para reordenar), mostra a
// prévia ao vivo (SurveyPreview) e, ao publicar, converte tudo para o
// formato do Contrato C1 (sectionsToSchema) e delega a chamada à API para o
// componente pai (onPublish).
interface SurveyBuilderProps {
  initialSections: SectionDraft[];
  onPublish: (schema: ReturnType<typeof sectionsToSchema>) => Promise<void>;
  isPublishing: boolean;
}

export function SurveyBuilder({ initialSections, onPublish, isPublishing }: SurveyBuilderProps) {
  const [sections, setSections] = useState<SectionDraft[]>(
    initialSections.length > 0 ? initialSections : [newSection()],
  );
  const [addQuestionType, setAddQuestionType] = useState<Record<string, QuestionType>>({});

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function updateSection(sectionId: string, updater: (section: SectionDraft) => SectionDraft) {
    setSections((current) => current.map((s) => (s.id === sectionId ? updater(s) : s)));
  }

  function addSection() {
    setSections((current) => [...current, newSection()]);
  }

  function removeSection(sectionId: string) {
    setSections((current) => current.filter((s) => s.id !== sectionId));
  }

  // Só uma seção pode ser o cabeçalho — marcar uma desmarca qualquer outra.
  // Perguntas GPS não fazem sentido lá (ver HEADER_INCOMPATIBLE_TYPES),
  // então são removidas ao marcar.
  function toggleHeader(sectionId: string) {
    setSections((current) =>
      current.map((s) => {
        if (s.id !== sectionId) return { ...s, isHeader: false };
        const isHeader = !s.isHeader;
        return {
          ...s,
          isHeader,
          questions: isHeader
            ? s.questions.filter((q) => !HEADER_INCOMPATIBLE_TYPES.includes(q.type))
            : s.questions,
        };
      }),
    );
  }

  // Cria a seção de cabeçalho diretamente (sem passar por uma seção comum
  // primeiro) — usado pelo bloco dedicado "Cabeçalho da pesquisa".
  function addHeaderSection() {
    setSections((current) => [{ ...newSection(), title: 'Cabeçalho', isHeader: true }, ...current]);
  }

  function addQuestion(sectionId: string) {
    const section = sections.find((s) => s.id === sectionId);
    const type = addQuestionType[sectionId] ?? 'TEXT';
    if (section?.isHeader && HEADER_INCOMPATIBLE_TYPES.includes(type)) return;
    updateSection(sectionId, (s) => ({
      ...s,
      questions: [...s.questions, newQuestion(type)],
    }));
  }

  function handleDragEnd(sectionId: string) {
    return (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      updateSection(sectionId, (section) => {
        const oldIndex = section.questions.findIndex((q) => q.id === active.id);
        const newIndex = section.questions.findIndex((q) => q.id === over.id);
        return { ...section, questions: arrayMove(section.questions, oldIndex, newIndex) };
      });
    };
  }

  const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);
  const canPublish = sections.length > 0 && totalQuestions > 0;
  const headerSection = sections.find((s) => s.isHeader);
  const fieldSections = sections.filter((s) => !s.isHeader);

  function renderQuestions(section: SectionDraft) {
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(section.id)}>
        <SortableContext items={section.questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-3">
            {section.questions.map((question) => (
              <QuestionRow
                key={question.id}
                question={question}
                isHeaderSection={section.isHeader}
                onChange={(updated) =>
                  updateSection(section.id, (s) => ({
                    ...s,
                    questions: s.questions.map((q) => (q.id === updated.id ? updated : q)),
                  }))
                }
                onRemove={() =>
                  updateSection(section.id, (s) => ({
                    ...s,
                    questions: s.questions.filter((q) => q.id !== question.id),
                  }))
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  function renderAddQuestionRow(section: SectionDraft) {
    return (
      <div className="flex items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
          value={addQuestionType[section.id] ?? 'TEXT'}
          onChange={(e) =>
            setAddQuestionType((current) => ({
              ...current,
              [section.id]: e.target.value as QuestionType,
            }))
          }
        >
          {QUESTION_TYPES.filter(
            (t) => !section.isHeader || !HEADER_INCOMPATIBLE_TYPES.includes(t.value),
          ).map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" size="sm" onClick={() => addQuestion(section.id)}>
          + Adicionar pergunta
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div className="flex flex-col gap-6">
        {/* Bloco 1 — Cabeçalho da pesquisa: preenchido uma única vez por sessão
            de coleta e reaproveitado nas próximas respostas desta pesquisa.
            Separado visualmente das seções de campo porque tem semântica e
            regras diferentes (não aceita GPS/Foto, é sempre a primeira seção). */}
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-base">Cabeçalho da pesquisa</CardTitle>
            <p className="text-xs text-muted-foreground">
              Respondido uma única vez por sessão de coleta e reaproveitado nas próximas coletas
              desta pesquisa — sempre antes das demais perguntas. Não aceita GPS/Foto.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {headerSection ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label>Título do cabeçalho</Label>
                    <Input
                      value={headerSection.title}
                      onChange={(e) =>
                        updateSection(headerSection.id, (s) => ({ ...s, title: e.target.value }))
                      }
                      placeholder="Ex: Identificação"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="mt-6"
                    onClick={() => removeSection(headerSection.id)}
                  >
                    Remover cabeçalho
                  </Button>
                </div>
                {renderQuestions(headerSection)}
                {renderAddQuestionRow(headerSection)}
              </>
            ) : (
              <Button type="button" variant="outline" onClick={addHeaderSection}>
                + Adicionar cabeçalho da pesquisa
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Bloco 2 — Pesquisa de campo: as seções e perguntas normais,
            respondidas a cada coleta. */}
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-muted-foreground">Pesquisa de campo</h2>

          {fieldSections.map((section) => (
            <Card key={section.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label>Título da seção</Label>
                    <Input
                      value={section.title}
                      onChange={(e) =>
                        updateSection(section.id, (s) => ({ ...s, title: e.target.value }))
                      }
                      placeholder="Ex: Identificação"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="mt-6"
                    onClick={() => removeSection(section.id)}
                  >
                    Excluir seção
                  </Button>
                </div>
                {!headerSection && (
                  <button
                    type="button"
                    className="mt-2 text-left text-xs text-muted-foreground underline hover:text-foreground"
                    onClick={() => toggleHeader(section.id)}
                  >
                    Tornar esta seção o cabeçalho da pesquisa
                  </button>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {renderQuestions(section)}
                {renderAddQuestionRow(section)}
              </CardContent>
            </Card>
          ))}

          <Button type="button" variant="outline" onClick={addSection}>
            + Adicionar seção
          </Button>
        </div>

        <Button
          type="button"
          disabled={!canPublish || isPublishing}
          onClick={() => onPublish(sectionsToSchema(sections))}
        >
          {isPublishing ? 'Publicando...' : 'Publicar'}
        </Button>
        {!canPublish && (
          <p className="text-xs text-muted-foreground">
            Adicione ao menos uma pergunta em alguma seção antes de publicar.
          </p>
        )}
      </div>

      <Card className="h-fit xl:sticky xl:top-4">
        <CardHeader>
          <CardTitle className="text-base">Pré-visualização</CardTitle>
        </CardHeader>
        <CardContent>
          <SurveyPreview sections={sections} />
        </CardContent>
      </Card>
    </div>
  );
}
