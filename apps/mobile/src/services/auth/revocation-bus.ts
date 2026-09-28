// Ponte simples entre o interceptor HTTP (módulo, fora de React) e o
// AuthProvider (componente): permite que uma sessão revogada detectada em
// qualquer chamada de API force o app de volta para a tela de login.
type Listener = () => void;

let listener: Listener | null = null;

export function onSessionRevoked(callback: Listener): void {
  listener = callback;
}

export function notifySessionRevoked(): void {
  listener?.();
}
