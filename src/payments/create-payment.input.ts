import { Moneda } from '../sales/moneda.enum.js';
import { PaymentType } from './payment-type.enum.js';

// No es un DTO de HTTP (Payment no tiene endpoints propios): lo arma
// SalesService al crear o renovar una venta. `montoPEN` no se incluye acá
// a propósito, lo calcula PaymentsService.create() (ver nota ahí).
export interface CreatePaymentInput {
  ventaId: string;
  monto: number;
  moneda: Moneda;
  tasaCambio: number;
  metodoPago: string;
  fecha: string;
  tipo: PaymentType;
}
