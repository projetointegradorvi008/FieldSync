import { Alert } from 'react-native';

// Ponto único de exibição de avisos ao usuário: todo aviso do sistema
// (erro, confirmação, resultado de uma ação) deve aparecer como popup nativo
// em vez de texto inline na tela — usar esta função em vez de Alert.alert
// diretamente mantém esse comportamento consistente em todas as telas.
export function showAlert(title: string, message?: string): void {
  Alert.alert(title, message);
}

// O Backend já devolve `message` em português para qualquer erro de API (ver
// filtro global de exceções). O único texto técnico que ainda pode vazar é a
// exceção de rede crua do runtime (ex: "Network request failed"/"Failed to
// fetch") quando o dispositivo está sem conexão — normalizamos esse caso
// para PT-BR aqui, e mantemos o restante (mensagens já amigáveis, vindas do
// Backend ou escritas neste app) como está. Use em toda tela que hoje faz
// `err instanceof Error ? err.message : fallback`.
export function getFriendlyErrorMessage(
  err: unknown,
  fallback = 'Ocorreu um erro. Tente novamente.',
): string {
  if (err instanceof Error) {
    if (/network request failed|failed to fetch|network error/i.test(err.message)) {
      return 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.';
    }
    return err.message || fallback;
  }
  return fallback;
}
