// Paleta "Azul Operacional" do FieldSync — mesma identidade e mesmas cores
// semânticas de status (sincronizado/pendente/conflito/erro) usadas no
// Painel Web (ver apps/web/src/app/globals.css), convertidas para hex porque
// React Native não aceita oklch() em StyleSheet. Centraliza aqui os valores
// que antes estavam duplicados (e levemente inconsistentes, ex: '#007aff'
// da LoginScreen) em cada tela.
export const colors = {
  background: '#fafaf9',
  surface: '#ffffff',
  foreground: '#1c2033',
  mutedForeground: '#6b7280',
  border: '#e5e5e5',

  primary: '#2563eb',
  primaryForeground: '#ffffff',
  accentSoft: '#eff6ff',

  success: '#15803d',
  successSoft: '#e6f4ec',
  warning: '#b45309',
  warningSoft: '#fdf1e2',
  destructive: '#c0392b',
  destructiveSoft: '#fbeae7',
  conflict: '#7c3aed',
  conflictSoft: '#f1eafe',
} as const;

export const radius = {
  sm: 8,
  md: 11,
  lg: 14,
  pill: 999,
} as const;
