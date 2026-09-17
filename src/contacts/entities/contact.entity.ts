import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ContactType } from '../contact-type.enum.js';
import { User } from '../../users/entities/user.entity.js';

@Entity({ name: 'contacts' })
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Dueño del contacto (Multi-usuario — Fase B2, mismo patrón que
  // Service.ownerId en Fase B1): un REVENDEDOR solo ve/toca los suyos, el
  // admin ve todos. Ver ContactsService.findAllOwned/findOneOwned.
  @Column({ type: 'uuid', name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ type: 'varchar' })
  nombre: string;

  @Column({ type: 'varchar' })
  whatsapp: string;

  @Column({ type: 'enum', enum: ContactType })
  tipo: ContactType;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
