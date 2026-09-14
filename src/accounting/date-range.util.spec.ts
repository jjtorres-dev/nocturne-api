import { resolveRango } from './date-range.util.js';

describe('resolveRango', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T18:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sin desde/hasta usa el mes calendario actual completo', () => {
    expect(resolveRango()).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
  });

  it('respeta desde/hasta explícitos', () => {
    expect(resolveRango('2026-01-01', '2026-01-31')).toEqual({
      desde: '2026-01-01',
      hasta: '2026-01-31',
    });
  });

  it('cada extremo se resuelve por separado si solo viene uno', () => {
    expect(resolveRango('2026-01-10')).toEqual({
      desde: '2026-01-10',
      hasta: '2026-02-28',
    });
    expect(resolveRango(undefined, '2026-03-05')).toEqual({
      desde: '2026-02-01',
      hasta: '2026-03-05',
    });
  });

  it('calcula bien el último día de un mes de 31 días y de un año bisiesto', () => {
    vi.setSystemTime(new Date('2026-01-15T00:00:00Z'));
    expect(resolveRango().hasta).toBe('2026-01-31');

    vi.setSystemTime(new Date('2028-02-10T00:00:00Z')); // 2028 es bisiesto
    expect(resolveRango().hasta).toBe('2028-02-29');
  });
});
