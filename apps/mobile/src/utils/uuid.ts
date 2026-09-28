// UUID v4 simples — não precisa de força criptográfica, só de ser estável e
// único localmente (device id, rascunhos). Hermes/React Native não expõe
// `crypto.randomUUID()` sem polyfill, então geramos manualmente.
export function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
