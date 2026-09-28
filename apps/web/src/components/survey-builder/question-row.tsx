import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ConfigEditor } from './config-editor';
import { HEADER_INCOMPATIBLE_TYPES, QUESTION_TYPES, QuestionDraft, SESSION_SCOPABLE_TYPES } from './types';

// Uma pergunta dentro do construtor: campo de rótulo, seletor de tipo,
// configuração específica do tipo (ConfigEditor) e os checkboxes
// obrigatória/reaproveitar-na-sessão (RF11). `useSortable` é o que permite
// arrastar para reordenar dentro da seção.
interface QuestionRowProps {
  question: QuestionDraft;
  isHeaderSection: boolean;
  onChange: (question: QuestionDraft) => void;
  onRemove: () => void;
}

export function QuestionRow({ question, isHeaderSection, onChange, onRemove }: QuestionRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex flex-col gap-3 rounded-md border bg-background p-3">
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label="Arrastar para reordenar"
          className="mt-1.5 cursor-grab select-none px-1 text-muted-foreground"
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>

        <div className="flex flex-1 flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Pergunta</Label>
              <Input
                value={question.label}
                onChange={(e) => onChange({ ...question, label: e.target.value })}
                placeholder="Ex: Nome do entrevistado"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Tipo</Label>
              <select
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                value={question.type}
                onChange={(e) =>
                  onChange({
                    ...question,
                    type: e.target.value as QuestionDraft['type'],
                    sessionScoped: false,
                  })
                }
              >
                {QUESTION_TYPES.filter(
                  (t) => !isHeaderSection || !HEADER_INCOMPATIBLE_TYPES.includes(t.value),
                ).map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <ConfigEditor
            type={question.type}
            config={question.config}
            onChange={(config) => onChange({ ...question, config })}
          />

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={question.required}
                onChange={(e) => onChange({ ...question, required: e.target.checked })}
              />
              Obrigatória
            </label>
            {SESSION_SCOPABLE_TYPES.includes(question.type) && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={question.sessionScoped}
                  onChange={(e) => onChange({ ...question, sessionScoped: e.target.checked })}
                />
                Reaproveitar valor durante a sessão de coleta
              </label>
            )}
            <Button type="button" variant="destructive" size="sm" onClick={onRemove} className="ml-auto">
              Excluir pergunta
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
