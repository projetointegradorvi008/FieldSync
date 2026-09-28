'use client';

import { cn } from '@/lib/utils';
import { useToast } from '@/contexts/toast-context';

const VARIANT_CLASSES: Record<string, string> = {
  error: 'border-destructive/50 bg-destructive text-white',
  success: 'border-green-700/50 bg-green-600 text-white',
  info: 'border-border bg-foreground text-background',
};

// Popup de avisos fixo no canto da tela — renderizado uma única vez no
// layout raiz, empilha as mensagens ativas do ToastProvider.
export function ToastViewport() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-md border px-4 py-3 text-sm shadow-lg',
            VARIANT_CLASSES[t.variant],
          )}
        >
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            className="shrink-0 opacity-80 hover:opacity-100"
            aria-label="Fechar aviso"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
