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
import { Contact } from '../../contacts/entities/contact.entity.js';
import { Account } from '../../accounts/entities/account.entity.js';
import { Profile } from '../../accounts/profiles/entities/profile.entity.js';
import { Service } from '../../services/entities/service.entity.js';
import { Moneda } from '../moneda.enum.js';
import { VentaCombo } from '../../combo-sales/entities/venta-combo.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Entity({ name: 'sales' })
export class Sale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Dueño de la venta (Multi-usuario — Fase B4, mismo patrón que
  // Service/Contact/Account.ownerId): un REVENDEDOR solo ve/toca las
  // suyas, el admin ve todas. Ver SalesService.findAllOwned/findOneOwned.
  // clienteId/cuentaId/perfilId/servicioId referenciados deben pertenecer
  // a este mismo owner (ver assertReferencesOwnedBy). Las ventas hijas de
  // un combo (ver ventaComboId) también necesitan este campo — como
  // ComboSalesService no está scopeado por dueño todavía, las crea con el
  // ownerId de la Cuenta a la que quedan asignadas (ver comentario ahí).
  @Column({ type: 'uuid', name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ type: 'uuid', name: 'cliente_id' })
  clienteId: string;

  @ManyToOne(() => Contact)
  @JoinColumn({ name: 'cliente_id' })
  cliente: Contact;

  @Column({ type: 'uuid', name: 'cuenta_id' })
  cuentaId: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'cuenta_id' })
  cuenta: Account;

  @Column({ type: 'uuid', name: 'perfil_id', nullable: true })
  perfilId: string | null;

  @ManyToOne(() => Profile, { nullable: true })
  @JoinColumn({ name: 'perfil_id' })
  perfil: Profile | null;

  // Copiado de la cuenta al crear: si la cuenta cambia de servicio más
  // adelante, la venta ya emitida no debe cambiar de servicio con ella.
  @Column({ type: 'uuid', name: 'servicio_id' })
  servicioId: string;

  @ManyToOne(() => Service)
  @JoinColumn({ name: 'servicio_id' })
  servicio: Service;

  @Column({ type: 'varchar', name: 'codigo_venta', unique: true })
  codigoVenta: string;

  // Snapshot de Service.duracionMeses al momento de la venta: la usa
  // `renew()` para no verse afectada si el catálogo cambia después.
  @Column({
    type: 'decimal',
    precision: 4,
    scale: 1,
    name: 'duracion_meses',
    transformer: decimalTransformer,
  })
  duracionMeses: number;

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
  precio: number;

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
    name: 'precio_pen',
    transformer: decimalTransformer,
  })
  precioPEN: number;

  @Column({ type: 'varchar', name: 'metodo_pago' })
  metodoPago: string;

  @Column({ type: 'boolean', name: 'renovacion_automatica', default: false })
  renovacionAutomatica: boolean;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  // No nula solo cuando esta venta es la "hija" de un combo (ver
  // ComboSalesService.create): en ese caso precio=0 y el dinero real se
  // registra en el Payment de la VentaCombo, no acá. SalesService bloquea
  // reactivate/deactivate/renew directos sobre estas filas (ver
  // assertNoPerteneceAUnCombo) — se gestionan desde /api/combo-sales.
  @Column({ type: 'uuid', name: 'venta_combo_id', nullable: true })
  ventaComboId: string | null;

  @ManyToOne(() => VentaCombo, { nullable: true })
  @JoinColumn({ name: 'venta_combo_id' })
  ventaCombo: VentaCombo | null;

  // No es una columna: lo completan SalesService/ComboSalesService en sus
  // respuestas. true si la cuenta de la venta está caída (Account.
  // fechaCaida no es null) — el cliente está sin servicio y no hay que
  // cobrarle hasta que el proveedor la reponga.
  cuentaCaida?: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
