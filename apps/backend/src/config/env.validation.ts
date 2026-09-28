import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';

// Senha de desenvolvimento conhecida (ver prisma/seed.ts) — nunca aceita
// como ADMIN_PASSWORD em produção, mesmo que atenda aos critérios de força
// abaixo por coincidência.
export const KNOWN_DEV_ADMIN_PASSWORD = 'admin123456';

const ADMIN_PASSWORD_MIN_LENGTH = 16;
// Ao menos uma letra minúscula, uma maiúscula e um dígito ou símbolo —
// suficiente para um único operador digitar uma vez e guardar, sem exigir
// as 4 classes de caractere (evita casos extremos só-símbolo).
const ADMIN_PASSWORD_STRENGTH_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[\d\W]).+$/;

// Compartilhado entre `validate()` (boot do Nest) e prisma/seed.ts: o seed
// roda via `ts-node` fora do ConfigModule/`validate()` do Nest (ex:
// `npx prisma db seed` chamado direto), então não pode assumir que a
// validação de boot já rodou — precisa checar a força da senha de novo,
// de forma independente, com a mesma regra.
export function validateAdminPasswordStrength(
  password: string | undefined,
): string | null {
  if (!password) {
    return 'ADMIN_PASSWORD é obrigatório em produção.';
  }
  if (password === KNOWN_DEV_ADMIN_PASSWORD) {
    return 'ADMIN_PASSWORD não pode ser a senha de desenvolvimento conhecida (admin123456).';
  }
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return `ADMIN_PASSWORD deve ter pelo menos ${ADMIN_PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (!ADMIN_PASSWORD_STRENGTH_REGEX.test(password)) {
    return 'ADMIN_PASSWORD deve conter letras maiúsculas, minúsculas e pelo menos um número ou símbolo.';
  }
  return null;
}

// Lido pelo ConfigModule.forRoot({ validate }) em app.module.ts: a
// aplicação recusa subir se alguma destas variáveis obrigatórias faltar ou
// tiver formato inválido (ex: JWT_SECRET curto demais) — falha rápido, no
// boot, em vez de falhar de forma confusa mais tarde em runtime.
class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  @IsOptional()
  NODE_ENV?: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  @IsString()
  DATABASE_URL: string;

  // Obrigatório (sem @IsOptional): antes caía silenciosamente em
  // 'http://localhost:3000' dentro de main.ts se ausente/mal configurado —
  // agora um valor ausente falha no boot em vez de produzir um CORS confuso
  // em runtime.
  @IsString()
  CORS_ORIGIN: string;
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(validated);
  if (errors.length > 0) {
    throw new Error(`Variáveis de ambiente inválidas:\n${errors}`);
  }

  // ADMIN_PASSWORD só é exigido em produção (ver prisma/seed.ts) — checado
  // aqui de forma imperativa (não como decorator) porque a regra depende de
  // NODE_ENV e de múltiplos critérios de força, não só de tipo/tamanho.
  if (validated.NODE_ENV === 'production') {
    const adminPasswordError = validateAdminPasswordStrength(
      config.ADMIN_PASSWORD as string | undefined,
    );
    if (adminPasswordError) {
      throw new Error(
        `Variáveis de ambiente inválidas:\nADMIN_PASSWORD: ${adminPasswordError}`,
      );
    }
  }

  return validated;
}
