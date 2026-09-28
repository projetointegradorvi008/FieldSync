import { Input } from '@/components/ui/input';
import { QuestionDraft, SectionDraft } from './types';

// Pré-visualização ao vivo de como o formulário vai aparecer no app Mobile
// — todos os campos ficam desabilitados (disabled), é só uma prévia visual.

function PreviewField({ question }: { question: QuestionDraft }) {
  switch (question.type) {
    case 'TEXT':
      return <Input disabled placeholder="Texto livre" className="max-w-xs" />;
    case 'NUMBER':
      return <Input disabled type="number" placeholder="0" className="max-w-xs" />;
    case 'BOOLEAN':
      return (
        <div className="flex gap-4 text-sm text-muted-foreground">
          <label className="flex items-center gap-1">
            <input type="radio" disabled /> Sim
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" disabled /> Não
          </label>
        </div>
      );
    case 'SINGLE_CHOICE':
      return (
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          {((question.config.options as string[]) ?? []).map((option) => (
            <label key={option} className="flex items-center gap-1">
              <input type="radio" disabled /> {option}
            </label>
          ))}
        </div>
      );
    case 'MULTIPLE_CHOICE':
      return (
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          {((question.config.options as string[]) ?? []).map((option) => (
            <label key={option} className="flex items-center gap-1">
              <input type="checkbox" disabled /> {option}
            </label>
          ))}
        </div>
      );
    case 'DATE':
      return <Input disabled type="date" className="max-w-xs" />;
    case 'TIME':
      return <Input disabled type="time" className="max-w-xs" />;
    case 'GPS':
      return (
        <span className="text-sm text-muted-foreground">
          📍 Localização será capturada automaticamente pelo dispositivo.
        </span>
      );
    default:
      return null;
  }
}

export function SurveyPreview({ sections }: { sections: SectionDraft[] }) {
  if (sections.length === 0) {
    return <p className="text-sm text-muted-foreground">Adicione seções e perguntas para ver a prévia.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <div key={section.id} className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold">
            {section.title || 'Seção sem título'}
            {section.isHeader && (
              <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-normal text-primary">
                Cabeçalho
              </span>
            )}
          </h3>
          {section.questions.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma pergunta nesta seção ainda.</p>
          ) : (
            section.questions.map((question) => (
              <div key={question.id} className="flex flex-col gap-1.5">
                <span className="text-sm">
                  {question.label || '(pergunta sem rótulo)'}
                  {question.required && <span className="text-destructive"> *</span>}
                  {question.sessionScoped && (
                    <span className="ml-2 text-xs text-muted-foreground">(reaproveitada na sessão)</span>
                  )}
                </span>
                <PreviewField question={question} />
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  );
}
