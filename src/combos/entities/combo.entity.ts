import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/decimal.transformer.js';
import { Service } from '../../services/entities/service.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Entity({ name: 'combos' })
export class Combo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Dueño del combo (Multi-usuario — Fase B5, mismo patrón que
  // Service/Contact/Account/Sale.ownerId): un REVENDEDOR solo ve/toca los
  // suyos, el admin ve todos. Cada Service dentro de `servicios` debe
  // pertenecer a este mismo owner (ver CombosService.assertServiciosOwnedBy)
  // — un combo no puede mezclar catálogo de dueños distintos.
  @Column({ type: 'uuid', name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

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
