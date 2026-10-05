// Item de GET /accounts/caidas (Bloque — Cuentas caídas): cuentas marcadas
// como caídas que el proveedor todavía no repuso.
export interface AccountCaida {
  id: string;
  correo: string;
  servicioId: string;
  servicioNombre: string;
  fechaCaida: string;
  // CURRENT_DATE de Postgres - fechaCaida (mismo criterio que
  // AccountPorRenovar.diasRestantes).
  diasCaida: number;
  // Clientes distintos con al menos una venta activa en la cuenta (incluye
  // ventas hijas de combo): los que hoy están sin servicio.
  clientesAfectados: number;
  // Solo para ADMIN (mismo criterio que el buscador global).
  ownerName?: string;
}

// Lo que hizo POST /accounts/:id/restore, para decírselo al revendedor.
export interface AccountCompensacion {
  dias: number;
  fechaCaida: string;
  fechaReposicion: string;
  // Ventas sueltas y ventas de combo a las que se les sumaron los días.
  ventas: number;
  combos: number;
  clientes: number;
}
