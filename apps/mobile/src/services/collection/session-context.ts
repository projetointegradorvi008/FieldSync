// Contexto de Sessão de Coleta (RF11 — obrigatório, ver 1.4/4.4 na spec).
// Armazena em memória (não no SQLite — é só conveniência de digitação, não
// dado persistido) o último valor informado para cada pergunta `sessionScoped`
// da pesquisa atual, para pré-preencher a próxima resposta da mesma sessão.
// Encerra ao trocar de pesquisa ou voltar para a lista.
let currentSurveyId: string | null = null;
let values: Record<string, unknown> = {};

export function getSessionValue(surveyId: string, questionExternalId: string): unknown {
  if (currentSurveyId !== surveyId) return undefined;
  return values[questionExternalId];
}

export function setSessionValue(surveyId: string, questionExternalId: string, value: unknown): void {
  if (currentSurveyId !== surveyId) {
    currentSurveyId = surveyId;
    values = {};
  }
  values[questionExternalId] = value;
}

export function clearCollectionSession(): void {
  currentSurveyId = null;
  values = {};
}
