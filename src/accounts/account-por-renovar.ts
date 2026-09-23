// Item de GET /accounts/por-renovar (Bloque C): cuentas activas cuya
// suscripción con el PROVEEDOR (Account.fechaFin) ya venció o vence dentro
// de los próximos N días.
export interface AccountPorRenovar {
  id: string;
  correo: string;
  servicioId: string;
  servicioNombre: string;
  fechaFin: string;
  // fechaFin - CURRENT_DATE de Postgres: negativo si ya venció.
  diasRestantes: number;
  // Clientes distintos con al menos una venta activa en esta cuenta
  // (incluye ventas hijas de combo: el cliente igual se queda sin servicio
  // si la cuenta no se renueva).
  clientesActivos: number;
  // Solo para ADMIN (mismo criterio que el buscador global).
  ownerName?: string;
}
