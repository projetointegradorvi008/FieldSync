import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { QuestionType } from './types';

// Editor das opções específicas de cada tipo de pergunta (ex: lista de
// alternativas de uma escolha única/múltipla, limite de tamanho de um
// texto, threshold de precisão de GPS) — um formulário condicional por tipo.
interface ConfigEditorProps {
  type: QuestionType;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function ConfigEditor({ type, config, onChange }: ConfigEditorProps) {
  function set(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  if (type === 'TEXT') {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>Tamanho máximo</Label>
        <Input
          type="number"
          min={1}
          value={(config.maxLength as number) ?? ''}
          onChange={(e) => set('maxLength', Number(e.target.value) || undefined)}
        />
      </div>
    );
  }

  if (type === 'NUMBER') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Mínimo</Label>
          <Input
            type="number"
            value={(config.min as number) ?? ''}
            onChange={(e) => set('min', e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Máximo</Label>
          <Input
            type="number"
            value={(config.max as number) ?? ''}
            onChange={(e) => set('max', e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </div>
      </div>
    );
  }

  if (type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE') {
    const options = (config.options as string[] | undefined) ?? [];
    return (
      <div className="flex flex-col gap-2">
        <Label>Opções</Label>
        {options.map((option, index) => (
          <div key={index} className="flex gap-2">
            <Input
              value={option}
              onChange={(e) => {
                const next = [...options];
                next[index] = e.target.value;
                set('options', next);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => set('options', options.filter((_, i) => i !== index))}
            >
              Remover
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => set('options', [...options, `Opção ${options.length + 1}`])}
        >
          + Adicionar opção
        </Button>
        {type === 'MULTIPLE_CHOICE' && (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Mínimo de seleções</Label>
              <Input
                type="number"
                value={(config.minSelect as number) ?? ''}
                onChange={(e) =>
                  set('minSelect', e.target.value === '' ? undefined : Number(e.target.value))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Máximo de seleções</Label>
              <Input
                type="number"
                value={(config.maxSelect as number) ?? ''}
                onChange={(e) =>
                  set('maxSelect', e.target.value === '' ? undefined : Number(e.target.value))
                }
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (type === 'GPS') {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>Precisão mínima exigida (metros)</Label>
        <Input
          type="number"
          min={1}
          value={(config.precisionThreshold as number) ?? ''}
          onChange={(e) => set('precisionThreshold', Number(e.target.value) || undefined)}
        />
      </div>
    );
  }

  // BOOLEAN, DATE e TIME não têm configuração adicional relevante no MVP
  // (DATE tinha data mínima/máxima, removido por não ser aplicado em lugar
  // nenhum — nem no Mobile nem no Backend — e por complicar sem necessidade
  // um campo que deve ser só a data).
  return null;
}
