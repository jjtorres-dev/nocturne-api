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
import { encryptedColumnTransformer } from '../../common/encryption/encrypted-column.transformer.js';
import { Service } from '../../services/entities/service.entity.js';
import { Contact } from '../../contacts/entities/contact.entity.js';

@Entity({ name: 'accounts' })
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'servicio_id' })
  servicioId: string;

  @ManyToOne(() => Service)
  @JoinColumn({ name: 'servicio_id' })
  servicio: Service;

  @Column({ type: 'uuid', name: 'proveedor_id', nullable: true })
  proveedorId: string | null;

  @ManyToOne(() => Contact, { nullable: true })
  @JoinColumn({ name: 'proveedor_id' })
  proveedor: Contact | null;

  // Mismo propósito que Profile.clienteId: para servicios SIN_PERFILES/IPTV
  // donde se vende la cuenta completa en vez de un perfil individual
  // (Fase 3 — Ventas). Lo sincroniza SalesService, no se edita directo acá.
  @Column({ type: 'uuid', name: 'cliente_id', nullable: true })
  clienteId: string | null;

  @ManyToOne(() => Contact, { nullable: true })
  @JoinColumn({ name: 'cliente_id' })
  cliente: Contact | null;

  @Column({ type: 'varchar' })
  correo: string;

  @Column({
    type: 'varchar',
    name: 'clave_servicio',
    transformer: encryptedColumnTransformer,
  })
  claveServicio: string;

  @Column({
    type: 'varchar',
    name: 'clave_correo',
    nullable: true,
    transformer: encryptedColumnTransformer,
  })
  claveCorreo: string | null;

  @Column({ type: 'date', name: 'fecha_inicio' })
  fechaInicio: string;

  @Column({ type: 'date', name: 'fecha_fin' })
  fechaFin: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  costo: number;

  @Column({ type: 'varchar', name: 'metodo_pago' })
  metodoPago: string;

  @Column({ type: 'varchar', nullable: true })
  url: string | null;

  @Column({ type: 'boolean', name: 'renovacion_automatica', default: false })
  renovacionAutomatica: boolean;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
