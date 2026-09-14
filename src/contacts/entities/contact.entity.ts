import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ContactType } from '../contact-type.enum.js';

@Entity({ name: 'contacts' })
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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
