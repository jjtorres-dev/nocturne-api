// `duracionMeses` admite fracciones (ver Service.duracionMeses, ej. 2.5),
// así que la renovación no puede usar solo `setMonth`. La parte entera se
// suma como meses calendario (respeta longitudes de mes distintas); la
// parte fraccionaria se aproxima a días asumiendo un mes de 30 días, que es
// la única convención razonable sin una unidad de "medio mes" definida en
// el negocio.
export function addMonthsToDate(dateStr: string, months: number): string {
  const wholeMonths = Math.trunc(months);
  const fraction = months - wholeMonths;

  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + wholeMonths);
  if (fraction !== 0) {
    date.setUTCDate(date.getUTCDate() + Math.round(fraction * 30));
  }

  return date.toISOString().slice(0, 10);
}

// Fecha "de hoy" para el Payment que genera un renew(): a diferencia de
// vencimiento (que usa CURRENT_DATE de Postgres para no depender del reloj
// de quien llama), acá sí es el reloj del propio servidor el que emite el
// pago, igual que createdAt en el resto de las entidades.
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
