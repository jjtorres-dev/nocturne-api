// Respuesta de GET /accounts/:id/rentabilidad (Bloque C). Todo en PEN.
export interface AccountRentabilidad {
  // Todo lo pagado al proveedor por la cuenta (compra inicial +
  // renovaciones, suma de AccountPayment.montoPEN), y su desglose.
  costo: number;
  desgloseCosto: {
    compraInicial: number;
    renovaciones: number;
    cantidadRenovaciones: number;
  };
  // Perfiles activos de la cuenta / los que tienen cliente asignado.
  // Siempre 0/0 en servicios sin perfiles (SIN_PERFILES/IPTV): ver
  // `usaPerfiles`.
  perfilesTotal: number;
  perfilesVendidos: number;
  usaPerfiles: boolean;
  // Suma de Payment.montoPEN de las ventas SUELTAS de esta cuenta (venta
  // inicial + renovaciones). Las ventas hijas de combo no suman: tienen
  // precio 0 y su pago pertenece a la VentaCombo, que no se reparte por
  // cuenta.
  ingresos: number;
  ganancia: number;
  // precioBase × perfilesTotal; en servicios sin perfiles, precioBase ×
  // 1 (la cuenta completa es la única unidad vendible).
  potencial: number;
  // Cuántas ventas hijas de combo tiene la cuenta (activas o no), para
  // avisar en el frontend que esos ingresos no aparecen acá.
  ventasCombo: number;
}
