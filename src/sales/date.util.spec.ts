import { addMonthsToDate } from './date.util.js';

describe('addMonthsToDate', () => {
  // Misma tabla que `sumarMeses` en nocturne-web (shared/fecha.util.spec.ts):
  // si se cambia una, cambiar la otra, para que front y back no diverjan.
  it.each([
    ['2026-01-15', 1, '2026-02-15'],
    ['2026-01-31', 1, '2026-02-28'],
    ['2028-01-31', 1, '2028-02-29'],
    ['2026-03-31', 1, '2026-04-30'],
    ['2028-02-29', 12, '2029-02-28'],
    ['2026-01-31', 2.5, '2026-04-15'],
    ['2026-12-31', 1, '2027-01-31'],
  ])('%s + %s meses = %s', (fecha, meses, esperado) => {
    expect(addMonthsToDate(fecha, meses)).toBe(esperado);
  });

  it('aproxima la parte fraccionaria a días (mes de 30 días)', () => {
    expect(addMonthsToDate('2026-01-05', 0.5)).toBe('2026-01-20');
    expect(addMonthsToDate('2026-01-05', 2.5)).toBe('2026-03-20');
  });

  it('no suma nada con 0 meses', () => {
    expect(addMonthsToDate('2026-01-05', 0)).toBe('2026-01-05');
  });
});
