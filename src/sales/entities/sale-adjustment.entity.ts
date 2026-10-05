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
import { Account } from '../../accounts/entities/account.entity.js';
import { VentaCombo } from '../../combo-sales/entities/venta-combo.entity.js';
import { SaleAdjustmentType } from '../sale-adjustment-type.enum.js';
import { Sale } from './sale.entity.js';

// Ajuste a la fecha de vencimiento de una venta que NO es un pago (Bloque —
// Cuentas caídas): hoy solo `compensacion`, los días que se le suman al
// cliente porque la cuenta estuvo caída hasta que el proveedor la repuso
// (ver AccountsService.restore). Sin ownerId propio: el dueño sale de la
// venta/combo, igual que Payment.
@Entity({ name: 'sale_adjustments' })
export class SaleAdjustment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Un ajuste pertenece a una Sale O a una VentaCombo, nunca ambas ni
  // ninguna (CHECK a nivel de DB, mismo criterio que Payment). El de un
  // combo cubre a todas sus ventas hijas: no se crea uno por hija.
  @Index()
  @Column({ type: 'uuid', name: 'venta_id', nullable: true })
  ventaId: string | null;

  @ManyToOne(() => Sale, { nullable: true })
  @JoinColumn({ name: 'venta_id' })
  venta: Sale | null;

  @Index()
  @Column({ type: 'uuid', name: 'venta_combo_id', nullable: true })
  ventaComboId: string | null;

  @ManyToOne(() => VentaCombo, { nullable: true })
  @JoinColumn({ name: 'venta_combo_id' })
  ventaCombo: VentaCombo | null;

  // La cuenta que se cayó y originó el ajuste.
  @Index()
  @Column({ type: 'uuid', name: 'cuenta_id' })
  cuentaId: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'cuenta_id' })
  cuenta: Account;

  @Column({ type: 'enum', enum: SaleAdjustmentType })
  tipo: SaleAdjustmentType;

  // Días sumados a fechaFin.
  @Column({ type: 'int' })
  dias: number;

  @Column({ type: 'date', name: 'fecha_caida' })
  fechaCaida: string;

  @Column({ type: 'date', name: 'fecha_reposicion' })
  fechaReposicion: string;

  @Column({ type: 'varchar', nullable: true })
  motivo: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
