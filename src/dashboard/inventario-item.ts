// Item de GET /dashboard/inventario (Bloque C): cuánto queda libre para
// vender de cada servicio activo.
export interface InventarioItem {
  servicioId: string;
  nombre: string;
  // true: `libres` cuenta perfiles (CON_PERFILES/FAMILIAR); false: cuentas
  // completas (SIN_PERFILES/IPTV).
  usaPerfiles: boolean;
  libres: number;
  // Solo para ADMIN (mismo criterio que el buscador global): el admin ve
  // los servicios de todos, y dos revendedores pueden tener un "Netflix".
  ownerName?: string;
}
