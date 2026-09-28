const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

// Converte strings simples como "15m" ou "7d" (mesmo formato usado em
// JWT_ACCESS_EXPIRES_IN / JWT_REFRESH_EXPIRES_IN) em milissegundos.
export function parseDurationMs(value: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value.trim());
  if (!match) {
    throw new Error(
      `Formato de duração inválido: "${value}" (use algo como "15m", "7d")`,
    );
  }
  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit];
}
