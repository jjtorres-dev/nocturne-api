import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/decimal.transformer.js';
import { Service } from '../../services/entities/service.entity.js';

@Entity({ name: 'combos' })
export class Combo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  nombre: string;

  @Column({ type: 'varchar', nullable: true })
  descripcion: string | null;

  @ManyToMany(() => Service)
  @JoinTable({
    name: 'combo_servicios',
    joinColumn: { name: 'combo_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'servicio_id', referencedColumnName: 'id' },
  })
  servicios: Service[];

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    name: 'precio_combo',
    transformer: decimalTransformer,
  })
  precioCombo: number;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
