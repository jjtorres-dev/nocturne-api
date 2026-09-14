import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/decimal.transformer.js';
import { Sale } from '../../sales/entities/sale.entity.js';
import { Moneda } from '../../sales/moneda.enum.js';
import { PaymentType } from '../payment-type.enum.js';

@Entity({ name: 'payments' })
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'venta_id' })
  ventaId: string;

  @ManyToOne(() => Sale)
  @JoinColumn({ name: 'venta_id' })
  venta: Sale;

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

  @Column({ type: 'date' })
  fecha: string;

  @Column({ type: 'enum', enum: PaymentType })
  tipo: PaymentType;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
