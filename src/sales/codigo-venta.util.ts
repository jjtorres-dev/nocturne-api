import type { EntityManager } from 'typeorm';

// Compartido entre SalesService y ComboSalesService (las ventas hijas de un
// combo son filas normales de "sales" y usan la misma secuencia). Recibe un
// EntityManager (no un Repository) para poder correr dentro de la
// transacción de ComboSalesService.create() cuando corresponde.
export async function generateCodigoVenta(
  manager: EntityManager,
): Promise<string> {
  const [{ nextval }] = await manager.query(
    "SELECT nextval('sales_codigo_venta_seq') AS nextval",
  );
  return `V-${String(nextval).padStart(5, '0')}`;
}
