import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptedColumnTransformer } from '../../../common/encryption/encrypted-column.transformer.js';
import { Account } from '../../entities/account.entity.js';
import { Contact } from '../../../contacts/entities/contact.entity.js';

@Entity({ name: 'profiles' })
export class Profile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'cuenta_id' })
  cuentaId: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'cuenta_id' })
  cuenta: Account;

  @Column({ type: 'varchar' })
  nombre: string;

  @Column({
    type: 'varchar',
    nullable: true,
    transformer: encryptedColumnTransformer,
  })
  pin: string | null;

  @Column({ type: 'uuid', name: 'cliente_id', nullable: true })
  clienteId: string | null;

  @ManyToOne(() => Contact, { nullable: true })
  @JoinColumn({ name: 'cliente_id' })
  cliente: Contact | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
