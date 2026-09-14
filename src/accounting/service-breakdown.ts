// ganancia acá es ingresos - inversion, sin gastos (los gastos operativos
// no se atribuyen a un servicio en particular, ver AccountingService).
export interface ServiceBreakdown {
  servicioId: string;
  nombre: string;
  inversion: number;
  ingresos: number;
  ganancia: number;
}
