'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

// Sistema central de avisos da aplicação: todo erro/sucesso/aviso mostrado
// ao usuário passa por aqui como um popup (toast) no canto da tela, em vez
// de texto inline espalhado em cada página — mais fácil do usuário perceber.
export type ToastVariant = 'error' | 'success' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (message: string, variant?: ToastVariant) => void;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const AUTO_DISMISS_MS = 6000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, variant }]);
      setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
    },
    [dismissToast],
  );

  const value = useMemo(() => ({ toasts, showToast, dismissToast }), [toasts, showToast, dismissToast]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

// Atalhos convenientes: toast.error(msg) / toast.success(msg) / toast.info(msg).
export function useToast(): {
  toasts: ToastItem[];
  dismissToast: (id: number) => void;
  toast: { error: (message: string) => void; success: (message: string) => void; info: (message: string) => void };
} {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast deve ser usado dentro de um <ToastProvider>');
  }
  const { showToast, toasts, dismissToast } = ctx;
  const toast = useMemo(
    () => ({
      error: (message: string) => showToast(message, 'error'),
      success: (message: string) => showToast(message, 'success'),
      info: (message: string) => showToast(message, 'info'),
    }),
    [showToast],
  );
  return { toasts, dismissToast, toast };
}
