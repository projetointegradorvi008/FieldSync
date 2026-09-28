import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utilitário padrão do shadcn/ui: combina classes condicionais (clsx) e
// resolve conflitos de classes Tailwind (twMerge, ex: "p-2" vs "p-4").
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
