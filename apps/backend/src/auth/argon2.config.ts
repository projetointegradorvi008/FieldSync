import { HashOptions, argon2id } from 'argon2';

// Parâmetros recomendados pela OWASP para argon2id — ver seção 2.2 da spec.
// Centralizado aqui para nunca ficar hardcoded em mais de um lugar.
export const ARGON2_OPTIONS: HashOptions = {
  type: argon2id,
  memoryCost: 19456, // ≈ 19 MB
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
};
