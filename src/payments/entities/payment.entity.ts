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
import { VentaCombo } from '../../combo-sales/entities/venta-combo.entity.js';

@Entity({ name: 'payments' })
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Un Payment pertenece a una Sale O a una VentaCombo, nunca ambas ni
  // ninguna (CHECK constraint a nivel de DB, ver la migración
  // AddCombos). SalesService crea con ventaId; ComboSalesService con
  // ventaComboId.
  @Column({ type: 'uuid', name: 'venta_id', nullable: true })
  ventaId: string | null;

  @ManyToOne(() => Sale, { nullable: true })
  @JoinColumn({ name: 'venta_id' })
  venta: Sale | null;

  @Column({ type: 'uuid', name: 'venta_combo_id', nullable: true })
  ventaComboId: string | null;

  @ManyToOne(() => VentaCombo, { nullable: true })
  @JoinColumn({ name: 'venta_combo_id' })
  ventaCombo: VentaCombo | null;

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
