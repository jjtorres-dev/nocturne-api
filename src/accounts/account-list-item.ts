// Forma de cada item del listado de cuentas: nunca incluye claveServicio
// ni claveCorreo (eso solo se expone en el detalle, GET /accounts/:id).
export interface AccountListItem {
  id: string;
  ownerId: string;
  owner: { id: string; name: string; email: string };
  servicioId: string;
  proveedorId: string | null;
  clienteId: string | null;
  correo: string;
  fechaInicio: string;
  fechaFin: string;
  costo: number;
  metodoPago: string;
  url: string | null;
  renovacionAutomatica: boolean;
  activo: boolean;
  fechaCaida: string | null;
  perfilesCount: number;
  createdAt: Date;
  updatedAt: Date;
}
