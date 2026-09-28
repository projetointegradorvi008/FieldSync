import { computeLocationHash } from './location';

// 6.3: "cálculo de location_hash" é citado explicitamente na
// especificação como um dos poucos testes unitários de Mobile que valem a
// pena automatizar sem precisar de um dispositivo real. É a mesma regra de
// arredondamento usada pelo Backend na detecção de conflito (Contrato C2).
describe('computeLocationHash', () => {
  it('rounds latitude and longitude to 3 decimal places', () => {
    expect(computeLocationHash(-23.550519, -46.633308)).toBe('-23.551:-46.633');
  });

  it('produces the same hash for two points that round to the same 3rd decimal (proximity detection)', () => {
    const a = computeLocationHash(-23.55051, -46.63331);
    const b = computeLocationHash(-23.55052, -46.63329);
    expect(a).toBe(b);
  });

  it('produces different hashes for points that differ beyond the 3rd decimal', () => {
    const a = computeLocationHash(-23.5505, -46.6333);
    const b = computeLocationHash(-23.5605, -46.6333);
    expect(a).not.toBe(b);
  });

  it('handles positive coordinates and zero', () => {
    expect(computeLocationHash(0, 0)).toBe('0.000:0.000');
    expect(computeLocationHash(23.5, 46.6)).toBe('23.500:46.600');
  });
});
