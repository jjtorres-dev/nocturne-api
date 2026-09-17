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
import { ServiceType } from '../service-type.enum.js';
import { User } from '../../users/entities/user.entity.js';

@Entity({ name: 'services' })
export class Service {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Dueño del servicio (Multi-usuario — Fase B1): un REVENDEDOR solo ve/
  // toca los suyos, el admin ve todos. Ver ServicesService.findAllOwned/
  // findOneOwned — nunca se confía en un filtro que mande el cliente.
  @Column({ type: 'uuid', name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

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
