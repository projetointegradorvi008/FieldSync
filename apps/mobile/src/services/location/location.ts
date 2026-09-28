import * as Location from 'expo-location';

export interface CapturedLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

// Registra a localização da coleta (ver 4.5 na spec). Retorna null se a
// permissão for negada OU se o dispositivo não conseguir prover uma
// localização (configurações do sistema) — quem chama decide se isso
// bloqueia a finalização (só bloqueia quando existe uma pergunta GPS
// obrigatória no formulário).
export async function captureLocation(): Promise<CapturedLocation | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

  try {
    // Android: getCurrentPositionAsync falha com "Location request failed
    // due to unsatisfied device settings" quando o modo de localização do
    // sistema (ex: "Economia de bateria", sem GPS) não atende ao nível de
    // precisão pedido. enableNetworkProviderAsync dispara o prompt nativo
    // para o usuário corrigir isso antes de capturar — no-op/rejeita no
    // iOS, por isso o try/catch (segue tentando capturar mesmo assim).
    await Location.enableNetworkProviderAsync();
  } catch {
    // Usuário recusou o prompt, ou plataforma sem suporte — sem ação aqui.
  }

  try {
    const position = await Location.getCurrentPositionAsync({});
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    };
  } catch {
    // Sem GPS disponível mesmo após o prompt — trata como localização
    // indisponível (mesmo caminho da permissão negada, ver comentário acima).
    return null;
  }
}

// Hash de coordenadas arredondadas — usado pelo Backend na detecção de
// conflito por proximidade (Contrato C2).
export function computeLocationHash(latitude: number, longitude: number): string {
  return `${latitude.toFixed(3)}:${longitude.toFixed(3)}`;
}
