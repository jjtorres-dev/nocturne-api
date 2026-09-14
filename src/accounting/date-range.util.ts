// Sin desde/hasta, cada extremo cae por separado al mes calendario actual
// (día 1 al último día del mes), calculado en UTC. Se resuelve en el
// proceso de Node (no con CURRENT_DATE de Postgres, a diferencia de
// vencimiento en SalesService) porque acá el resultado son strings de
// fecha que después se reparten entre varias queries distintas, y así se
// puede testear como función pura sin levantar una base de datos.
export function resolveRango(
  desde?: string,
  hasta?: string,
): { desde: string; hasta: string } {
  const hoy = new Date();
  const inicioMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const finMes = new Date(
    Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 0),
  )
    .toISOString()
    .slice(0, 10);
  return { desde: desde ?? inicioMes, hasta: hasta ?? finMes };
}
