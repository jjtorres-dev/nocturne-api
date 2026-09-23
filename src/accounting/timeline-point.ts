// ganancia = ingresos - inversion - gastos, igual que en el summary (hasta
// el Bloque de Renovación con el proveedor el timeline no incluía la
// inversión y su ganancia era ingresos - gastos).
export interface TimelinePoint {
  periodo: string;
  ingresos: number;
  inversion: number;
  gastos: number;
  ganancia: number;
}
