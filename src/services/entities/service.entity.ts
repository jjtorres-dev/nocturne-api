import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/decimal.transformer.js';
import { ServiceType } from '../service-type.enum.js';

@Entity({ name: 'services' })
export class Service {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  nombre: string;

  @Column({ type: 'enum', enum: ServiceType })
  tipo: ServiceType;

  @Column({
    type: 'decimal',
    precision: 4,
    scale: 1,
    name: 'duracion_meses',
    transformer: decimalTransformer,
  })
  duracionMeses: number;

  @Column({ type: 'int', name: 'pantallas_max', nullable: true })
  pantallasMax: number | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    name: 'precio_base',
    transformer: decimalTransformer,
  })
  precioBase: number;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
