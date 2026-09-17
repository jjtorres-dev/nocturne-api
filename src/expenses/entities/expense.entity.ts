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
import { Moneda } from '../../sales/moneda.enum.js';
import { User } from '../../users/entities/user.entity.js';

@Entity({ name: 'expenses' })
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Dueño del gasto (Multi-usuario — Fase B6, mismo patrón que
  // Service/Contact/Account/Sale/Combo.ownerId): un REVENDEDOR solo ve/
  // toca los suyos, el admin ve todos. Ver ExpensesService.findAllOwned/
  // findOneOwned — nunca se confía en un filtro que mande el cliente.
  @Column({ type: 'uuid', name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ type: 'varchar' })
  descripcion: string;

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

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
