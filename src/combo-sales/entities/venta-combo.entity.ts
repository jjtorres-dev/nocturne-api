import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/decimal.transformer.js';
import { Contact } from '../../contacts/entities/contact.entity.js';
import { Combo } from '../../combos/entities/combo.entity.js';
import { Moneda } from '../../sales/moneda.enum.js';
import { Sale } from '../../sales/entities/sale.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Entity({ name: 'combo_sales' })
export class VentaCombo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Dueño de la VentaCombo (Multi-usuario — Fase B5, mismo patrón que
  // Service/Contact/Account/Sale.ownerId): un REVENDEDOR solo ve/toca las
  // suyas, el admin ve todas. clienteId/comboId/cada asignación deben
  // pertenecer a este mismo owner (ver ComboSalesService.
  // assertReferencesOwnedBy). Las ventas hijas heredan este mismo ownerId
  // explícitamente (no derivado de la Cuenta, ver ComboSalesService.create).
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

  @Column({ type: 'uuid', name: 'combo_id' })
  comboId: string;

  @ManyToOne(() => Combo)
  @JoinColumn({ name: 'combo_id' })
  combo: Combo;

  @Column({ type: 'varchar', name: 'codigo_venta', unique: true })
  codigoVenta: string;

  @Column({ type: 'date', name: 'fecha_inicio' })
  fechaInicio: string;

  @Column({ type: 'date', name: 'fecha_fin' })
  fechaFin: string;

  // A diferencia de Sale.duracionMeses (que copia el catálogo de un único
  // Service), acá viene del request: un combo agrupa servicios que pueden
  // tener duraciones de catálogo distintas, así que el wrapper necesita su
  // propia duración explícita para saber cuánto extender en renew().
  @Column({
    type: 'decimal',
    precision: 4,
    scale: 1,
    name: 'duracion_meses',
    transformer: decimalTransformer,
  })
  duracionMeses: number;

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

  // Las ventas hijas (una por servicio del combo, ver ComboSalesService).
  @OneToMany(() => Sale, (sale) => sale.ventaCombo)
  ventas: Sale[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
