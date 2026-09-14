// Redondeo a 2 decimales compartido por todos los cálculos de *PEN
// (Sale.precioPEN, Payment.montoPEN, Expense.montoPEN): evita el drift de
// punto flotante de operar montos * tasaCambio directamente.
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
