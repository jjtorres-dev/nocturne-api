// `duracionMeses` admite fracciones (ver Service.duracionMeses, ej. 2.5).
// Regla única de la app (misma que `sumarMeses` en nocturne-web): la parte
// entera se suma como meses calendario con tope en el último día del mes
// destino (31/01 + 1 = 28/02, o 29/02 en bisiesto; nunca desborda a 03/03);
// después, la parte fraccionaria se suma como días asumiendo un mes de 30
// días, la única convención razonable sin una unidad de "medio mes"
// definida en el negocio.
export function addMonthsToDate(dateStr: string, months: number): string {
  const wholeMonths = Math.trunc(months);
  const fraction = months - wholeMonths;

  const [year, month, day] = dateStr.split('-').map(Number);
  const lastDayOfTarget = new Date(
    Date.UTC(year, month + wholeMonths, 0),
  ).getUTCDate();
  const date = new Date(
    Date.UTC(year, month - 1 + wholeMonths, Math.min(day, lastDayOfTarget)),
  );
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

// Días calendario entre dos fechas 'YYYY-MM-DD' (hasta - desde; negativo si
// `hasta` es anterior). En UTC para que no dependa de la zona del servidor.
export function daysBetween(desde: string, hasta: string): number {
  const utc = (fecha: string) => {
    const [year, month, day] = fecha.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((utc(hasta) - utc(desde)) / 86_400_000);
}
