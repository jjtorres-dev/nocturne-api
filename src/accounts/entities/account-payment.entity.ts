import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/decimal.transformer.js';
import { Moneda } from '../../sales/moneda.enum.js';
import { AccountPaymentType } from '../account-payment-type.enum.js';
import { Account } from './account.entity.js';

// Pago al proveedor por una cuenta (Bloque — Renovación con el proveedor):
// la compra inicial y cada renovación. Es lo que Contabilidad suma como
// "inversión" según `fecha` (cuándo se pagó), y lo que la rentabilidad de
// la cuenta usa como costo total. Sin ownerId propio: el dueño se deriva de
// la cuenta, igual que Payment con Sale.
//
// Cada cuenta tiene exactamente un pago COMPRA_INICIAL, que AccountsService
// mantiene sincronizado con Account.costo/fechaInicio/metodoPago (Account.
// costo está siempre en PEN, así que ese pago es PEN con tasa 1).
@Entity({ name: 'account_payments' })
export class AccountPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Sin ON DELETE CASCADE (mismo criterio que Payment.ventaId): la app
  // nunca borra cuentas (soft delete con `activo`), y un borrado físico no
  // debe llevarse en silencio el historial de pagos al proveedor.
  @Index()
  @Column({ type: 'uuid', name: 'cuenta_id' })
  cuentaId: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'cuenta_id' })
  cuenta: Account;

  @Column({ type: 'date' })
  fecha: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  monto: number;

  @Column({ type: 'enum', enum: Moneda })
  moneda: Moneda;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    name: 'tasa_cambio',
    default: 1,
    transformer: decimalTransformer,
  })
  tasaCambio: number;

  // monto × tasaCambio redondeado a 2 decimales: lo calcula siempre el
  // backend (ver AccountsService), nunca viene del cliente.
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    name: 'monto_pen',
    transformer: decimalTransformer,
  })
  montoPEN: number;

  @Column({ type: 'varchar', name: 'metodo_pago' })
  metodoPago: string;

  @Column({ type: 'enum', enum: AccountPaymentType })
  tipo: AccountPaymentType;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
