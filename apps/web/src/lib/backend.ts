// Só deve ser importado em código server-side (Route Handlers). Nunca em
// Client Components — evita vazar BACKEND_INTERNAL_URL para o bundle do browser.
const BACKEND_INTERNAL_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BACKEND_INTERNAL_URL}/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
  });
}
