// Converte um erro de API (ou de rede) em uma mensagem amigável para o usuário.
// O backend já devolve `message` em português a partir de um filtro global de
// exceções; esta função só cobre os casos que o backend não consegue cobrir
// (falha de rede, resposta inesperada) e serve de última barreira contra
// vazar detalhes técnicos (stack trace, `TypeError: Failed to fetch`, etc.).
export function getFriendlyErrorMessage(
  err: unknown,
  fallback = 'Ocorreu um erro. Tente novamente.',
): string {
  if (err instanceof TypeError) {
    return 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.';
  }

  if (err instanceof Error) {
    const message = err.message;
    if (!message) return fallback;
    if (/^failed to fetch$/i.test(message) || /^networkerror/i.test(message)) {
      return 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.';
    }
    return message;
  }

  return fallback;
}

// Extrai a mensagem de erro de um corpo de resposta já parseado (JSON), antes
// de virar um `Error` — o campo `message` normalmente já vem amigável do
// backend, mas por segurança tratamos também o formato antigo (array de
// mensagens técnicas do class-validator) caso apareça em alguma resposta.
export function extractApiErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'message' in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
    if (Array.isArray(message) && message.length > 0 && typeof message[0] === 'string') {
      return message[0];
    }
  }
  return fallback;
}
