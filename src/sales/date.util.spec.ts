import { addMonthsToDate } from './date.util.js';

describe('addMonthsToDate', () => {
  it('suma meses enteros', () => {
    expect(addMonthsToDate('2026-01-05', 1)).toBe('2026-02-05');
    expect(addMonthsToDate('2026-01-05', 12)).toBe('2027-01-05');
  });

  it('aproxima la parte fraccionaria a días (mes de 30 días)', () => {
    expect(addMonthsToDate('2026-01-05', 0.5)).toBe('2026-01-20');
    expect(addMonthsToDate('2026-01-05', 2.5)).toBe('2026-03-20');
  });

  it('no suma nada con 0 meses', () => {
    expect(addMonthsToDate('2026-01-05', 0)).toBe('2026-01-05');
  });
});
