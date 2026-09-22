import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository, SelectQueryBuilder } from 'typeorm';
import { Sale } from './entities/sale.entity.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { UpdateSaleDto } from './dto/update-sale.dto.js';
import { QuerySaleDto } from './dto/query-sale.dto.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { ProfilesService } from '../accounts/profiles/profiles.service.js';
import { ServicesService } from '../services/services.service.js';
import { ContactsService } from '../contacts/contacts.service.js';
import { ServiceType } from '../services/service-type.enum.js';
import { addMonthsToDate, todayIso } from './date.util.js';
import { VencimientoFiltro } from './vencimiento.enum.js';
import type { SalesSummary } from './sales-summary.js';
import { round2 } from '../common/round2.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PaymentType } from '../payments/payment-type.enum.js';
import type { RenewSaleDto } from './dto/renew-sale.dto.js';
import { generateCodigoVenta } from './codigo-venta.util.js';
import { UserRole } from '../users/user-role.enum.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import { resolveOwnerName, type SearchResultItem } from '../common/search-result.js';

const DIAS_ALERTA_DEFAULT = 3;

// Solo id/name/email del dueño en el join, nunca el resto de User (ni por
// accidente el password_hash) — mismo criterio que Servicios/Contactos/
// Cuentas.
const OWNER_SELECT = {
  id: true,
  name: true,
  email: true,
} as const;

const OWNED_SELECT = {
  id: true,
  ownerId: true,
  clienteId: true,
  cuentaId: true,
  perfilId: true,
  servicioId: true,
  codigoVenta: true,
  duracionMeses: true,
  fechaInicio: true,
  fechaFin: true,
  precio: true,
  moneda: true,
  tasaCambio: true,
  precioPEN: true,
  metodoPago: true,
  renovacionAutomatica: true,
  activo: true,
  ventaComboId: true,
  createdAt: true,
  updatedAt: true,
  owner: OWNER_SELECT,
} as const;

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private readonly salesRepository: Repository<Sale>,
    private readonly accountsService: AccountsService,
    private readonly profilesService: ProfilesService,
    private readonly servicesService: ServicesService,
    private readonly contactsService: ContactsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async create(
    dto: CreateSaleDto,
    currentUser: AuthenticatedUser,
  ): Promise<Sale> {
    const { cuenta, servicio } = await this.assertReferencesOwnedBy(
      dto.clienteId,
      dto.cuentaId,
      currentUser.id,
    );
    const requierePerfil =
      servicio.tipo === ServiceType.CON_PERFILES ||
      servicio.tipo === ServiceType.FAMILIAR;
    const perfilId = dto.perfilId ?? null;

    if (requierePerfil) {
      if (!perfilId) {
        throw new BadRequestException(
          `El servicio "${servicio.nombre}" requiere seleccionar un perfil.`,
        );
      }
      // También valida que el perfil pertenezca a esta cuenta (404 si no) —
      // y, por transitividad (la cuenta ya se validó arriba), que sea del
      // mismo dueño: un perfil siempre pertenece a la cuenta de su dueño.
      await this.profilesService.findOne(dto.cuentaId, perfilId);
      await this.assertPerfilLibre(perfilId);
    } else {
      if (perfilId) {
        throw new BadRequestException(
          `El servicio "${servicio.nombre}" no usa perfiles; no se debe indicar perfilId.`,
        );
      }
      await this.assertCuentaLibre(dto.cuentaId);
    }

    const tasaCambio = dto.tasaCambio ?? 1;
    const sale = this.salesRepository.create({
      ...dto,
      ownerId: currentUser.id,
      perfilId,
      servicioId: cuenta.servicioId,
      duracionMeses: servicio.duracionMeses,
      codigoVenta: await generateCodigoVenta(this.salesRepository.manager),
      tasaCambio,
      precioPEN: round2(dto.precio * tasaCambio),
      activo: true,
    });
    const saved = await this.salesRepository.save(sale);

    if (perfilId) {
      await this.profilesService.assignCliente(
        dto.cuentaId,
        perfilId,
        dto.clienteId,
      );
    } else {
      await this.accountsService.assignCliente(dto.cuentaId, dto.clienteId);
    }

    await this.paymentsService.create({
      ventaId: saved.id,
      monto: saved.precio,
      moneda: saved.moneda,
      tasaCambio: saved.tasaCambio,
      metodoPago: saved.metodoPago,
      fecha: saved.fechaInicio,
      tipo: PaymentType.VENTA_INICIAL,
    });

    return saved;
  }

  // Sin scope de ownership: no tiene caller interno hoy (a diferencia de
  // Servicios/Contactos/Cuentas), se mantiene por paridad de patrón. Nunca
  // exponer este método (ni findOne) directo en el controller — ver
  // findAllOwned/findOneOwned para eso.
  findAll(query: QuerySaleDto): Promise<Sale[]> {
    if (query.vencimiento) {
      return this.findAllByVencimiento(query);
    }
    const where: Partial<Pick<Sale, 'clienteId' | 'servicioId' | 'activo'>> =
      {};
    if (query.clienteId) {
      where.clienteId = query.clienteId;
    }
    if (query.servicioId) {
      where.servicioId = query.servicioId;
    }
    if (query.activo !== undefined) {
      where.activo = query.activo;
    }
    return this.salesRepository.find({ where, order: { createdAt: 'DESC' } });
  }

  async summary(diasAlerta = DIAS_ALERTA_DEFAULT): Promise<SalesSummary> {
    const [vencidas, porVencer, alDia] = await Promise.all([
      this.countByVencimiento(VencimientoFiltro.VENCIDA, diasAlerta),
      this.countByVencimiento(VencimientoFiltro.POR_VENCER, diasAlerta),
      this.countByVencimiento(VencimientoFiltro.AL_DIA, diasAlerta),
    ]);
    return { vencidas, porVencer, alDia };
  }

  // Punto de entrada para el controller: un REVENDEDOR SIEMPRE queda
  // acotado a lo suyo acá, en TODOS los endpoints de lectura (incluidos
  // vencimiento/summary), sin depender de que el cliente mande el filtro
  // correcto — la seguridad vive en el backend.
  findAllOwned(
    query: QuerySaleDto,
    currentUser: AuthenticatedUser,
  ): Promise<Sale[]> {
    const ownerId =
      currentUser.role === UserRole.REVENDEDOR ? currentUser.id : undefined;
    if (query.vencimiento) {
      return this.findAllByVencimientoOwned(query, ownerId);
    }
    const where: Partial<
      Pick<Sale, 'clienteId' | 'servicioId' | 'activo' | 'ownerId'>
    > = {};
    if (query.clienteId) {
      where.clienteId = query.clienteId;
    }
    if (query.servicioId) {
      where.servicioId = query.servicioId;
    }
    if (query.activo !== undefined) {
      where.activo = query.activo;
    }
    if (ownerId) {
      where.ownerId = ownerId;
    }
    return this.salesRepository.find({
      where,
      relations: { owner: true },
      select: OWNED_SELECT,
      order: { createdAt: 'DESC' },
    });
  }

  summaryOwned(
    diasAlerta: number | undefined,
    currentUser: AuthenticatedUser,
  ): Promise<SalesSummary> {
    const ownerId =
      currentUser.role === UserRole.REVENDEDOR ? currentUser.id : undefined;
    return this.summaryFor(diasAlerta ?? DIAS_ALERTA_DEFAULT, ownerId);
  }

  private async summaryFor(
    diasAlerta: number,
    ownerId: string | undefined,
  ): Promise<SalesSummary> {
    const [vencidas, porVencer, alDia] = await Promise.all([
      this.countByVencimiento(VencimientoFiltro.VENCIDA, diasAlerta, ownerId),
      this.countByVencimiento(
        VencimientoFiltro.POR_VENCER,
        diasAlerta,
        ownerId,
      ),
      this.countByVencimiento(VencimientoFiltro.AL_DIA, diasAlerta, ownerId),
    ]);
    return { vencidas, porVencer, alDia };
  }

  // vencimiento se calcula siempre sobre ventas activas (ver PROGRESS.md);
  // por eso acá se ignora a propósito query.activo en vez de combinarlo.
  private findAllByVencimiento(query: QuerySaleDto): Promise<Sale[]> {
    const qb = this.buildVencimientoQuery(query);
    return qb.orderBy('sale.createdAt', 'DESC').getMany();
  }

  // Misma query que findAllByVencimiento, sumando el filtro de ownerId (si
  // aplica) y el join restringido a id/name/email del dueño.
  private findAllByVencimientoOwned(
    query: QuerySaleDto,
    ownerId: string | undefined,
  ): Promise<Sale[]> {
    const qb = this.buildVencimientoQuery(query);
    if (ownerId) {
      qb.andWhere('sale.ownerId = :ownerId', { ownerId });
    }
    qb.leftJoin('sale.owner', 'owner').addSelect([
      'owner.id',
      'owner.name',
      'owner.email',
    ]);
    return qb.orderBy('sale.createdAt', 'DESC').getMany();
  }

  private buildVencimientoQuery(query: QuerySaleDto): SelectQueryBuilder<Sale> {
    const diasAlerta = query.diasAlerta ?? DIAS_ALERTA_DEFAULT;
    const qb = this.salesRepository
      .createQueryBuilder('sale')
      .where('sale.activo = :activo', { activo: true });

    if (query.clienteId) {
      qb.andWhere('sale.clienteId = :clienteId', {
        clienteId: query.clienteId,
      });
    }
    if (query.servicioId) {
      qb.andWhere('sale.servicioId = :servicioId', {
        servicioId: query.servicioId,
      });
    }

    this.applyVencimientoCondition(qb, query.vencimiento!, diasAlerta);
    return qb;
  }

  private countByVencimiento(
    vencimiento: VencimientoFiltro,
    diasAlerta: number,
    ownerId?: string,
  ): Promise<number> {
    const qb = this.salesRepository
      .createQueryBuilder('sale')
      .where('sale.activo = :activo', { activo: true });
    if (ownerId) {
      qb.andWhere('sale.ownerId = :ownerId', { ownerId });
    }
    this.applyVencimientoCondition(qb, vencimiento, diasAlerta);
    return qb.getCount();
  }

  // CURRENT_DATE es la fecha del servidor de Postgres, no la del cliente
  // que hace el request: evita que el reloj/zona horaria de quien llama
  // afecte qué ventas cuentan como vencidas.
  private applyVencimientoCondition(
    qb: SelectQueryBuilder<Sale>,
    vencimiento: VencimientoFiltro,
    diasAlerta: number,
  ): void {
    switch (vencimiento) {
      case VencimientoFiltro.VENCIDA:
        qb.andWhere('sale.fechaFin < CURRENT_DATE');
        break;
      case VencimientoFiltro.POR_VENCER:
        qb.andWhere(
          "sale.fechaFin BETWEEN CURRENT_DATE AND CURRENT_DATE + (:dias * INTERVAL '1 day')",
          { dias: diasAlerta },
        );
        break;
      case VencimientoFiltro.AL_DIA:
        qb.andWhere(
          "sale.fechaFin > CURRENT_DATE + (:dias * INTERVAL '1 day')",
          { dias: diasAlerta },
        );
        break;
    }
  }

  async findOne(id: string): Promise<Sale> {
    const sale = await this.salesRepository.findOne({ where: { id } });
    if (!sale) {
      throw new NotFoundException(`Venta ${id} no encontrada`);
    }
    return sale;
  }

  // Un REVENDEDOR pidiendo una venta ajena recibe 404, no 403: no hay que
  // confirmarle que el recurso existe si no es suyo.
  async findOneOwned(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<Sale> {
    const sale = await this.salesRepository.findOne({
      where: { id },
      relations: { owner: true },
      select: OWNED_SELECT,
    });
    if (
      !sale ||
      (currentUser.role === UserRole.REVENDEDOR &&
        sale.ownerId !== currentUser.id)
    ) {
      throw new NotFoundException(`Venta ${id} no encontrada`);
    }
    return sale;
  }

  // Buscador global (ver src/search/): LIMIT 5, acotado por ownerId con el
  // mismo criterio que findAllOwned — un REVENDEDOR nunca ve ventas de otro
  // dueño en los resultados.
  async search(
    term: string,
    currentUser: AuthenticatedUser,
  ): Promise<SearchResultItem[]> {
    const qb = this.salesRepository
      .createQueryBuilder('sale')
      .select(['sale.id', 'sale.codigoVenta'])
      .where('sale.codigoVenta ILIKE :term', { term: `%${term}%` })
      .orderBy('sale.codigoVenta', 'ASC')
      .limit(5);
    if (currentUser.role === UserRole.REVENDEDOR) {
      qb.andWhere('sale.ownerId = :ownerId', { ownerId: currentUser.id });
    } else {
      qb.leftJoin('sale.owner', 'owner').addSelect(['owner.name']);
    }
    const sales = await qb.getMany();
    return sales.map((s) => ({
      id: s.id,
      label: s.codigoVenta,
      ownerName: resolveOwnerName(s.owner?.name, currentUser),
    }));
  }

  async update(
    id: string,
    dto: UpdateSaleDto,
    currentUser: AuthenticatedUser,
  ): Promise<Sale> {
    // UpdateSaleDto no permite reasignar clienteId/cuentaId/perfilId (ver
    // el comentario en el DTO), así que no hay referencias que revalidar
    // acá — a diferencia de Cuentas, donde servicioId/proveedorId sí son
    // editables. findOneOwned ya cubre el 404 si la venta es ajena.
    const sale = await this.findOneOwned(id, currentUser);
    // Ver nota en ServicesService.update: nunca Object.assign(entity, dto).
    const updatePayload: Partial<Sale> = { ...dto };
    if (dto.precio !== undefined || dto.tasaCambio !== undefined) {
      const precio = dto.precio ?? sale.precio;
      const tasaCambio = dto.tasaCambio ?? sale.tasaCambio;
      updatePayload.precioPEN = round2(precio * tasaCambio);
    }
    await this.salesRepository.update(id, updatePayload);
    return this.findOneOwned(id, currentUser);
  }

  async softDelete(id: string, currentUser: AuthenticatedUser): Promise<Sale> {
    const sale = await this.findOneOwned(id, currentUser);
    this.assertNoPerteneceAUnCombo(sale);
    sale.activo = false;
    const saved = await this.salesRepository.save(sale);
    await this.liberar(sale);
    return saved;
  }

  async reactivate(id: string, currentUser: AuthenticatedUser): Promise<Sale> {
    const sale = await this.findOneOwned(id, currentUser);
    this.assertNoPerteneceAUnCombo(sale);
    // La exclusividad (assertPerfilLibre/assertCuentaLibre) mira TODA la
    // tabla `sales`, sin filtrar por dueño: un perfil/cuenta ocupado por la
    // venta de otro usuario sigue estando ocupado para cualquiera, admin
    // incluido — nadie se "salta" la exclusividad por ser admin.
    if (sale.perfilId) {
      await this.assertPerfilLibre(sale.perfilId);
    } else {
      await this.assertCuentaLibre(sale.cuentaId);
    }
    sale.activo = true;
    const saved = await this.salesRepository.save(sale);
    await this.asignar(sale);
    return saved;
  }

  async renew(
    id: string,
    dto: RenewSaleDto = {},
    currentUser: AuthenticatedUser,
  ): Promise<Sale> {
    const sale = await this.findOneOwned(id, currentUser);
    this.assertNoPerteneceAUnCombo(sale);
    const fechaFin = addMonthsToDate(sale.fechaFin, sale.duracionMeses);
    const precio = dto.precio ?? sale.precio;
    const moneda = dto.moneda ?? sale.moneda;
    const tasaCambio = dto.tasaCambio ?? sale.tasaCambio;
    const metodoPago = dto.metodoPago ?? sale.metodoPago;

    await this.salesRepository.update(id, {
      fechaFin,
      precio,
      moneda,
      tasaCambio,
      metodoPago,
      precioPEN: round2(precio * tasaCambio),
    });

    await this.paymentsService.create({
      ventaId: id,
      monto: precio,
      moneda,
      tasaCambio,
      metodoPago,
      fecha: todayIso(),
      tipo: PaymentType.RENOVACION,
    });

    return this.findOneOwned(id, currentUser);
  }

  private async liberar(sale: Sale): Promise<void> {
    if (sale.perfilId) {
      await this.profilesService.assignCliente(
        sale.cuentaId,
        sale.perfilId,
        null,
      );
    } else {
      await this.accountsService.assignCliente(sale.cuentaId, null);
    }
  }

  private async asignar(sale: Sale): Promise<void> {
    if (sale.perfilId) {
      await this.profilesService.assignCliente(
        sale.cuentaId,
        sale.perfilId,
        sale.clienteId,
      );
    } else {
      await this.accountsService.assignCliente(
        sale.cuentaId,
        sale.clienteId,
      );
    }
  }

  private async assertPerfilLibre(perfilId: string): Promise<void> {
    const existing = await this.salesRepository.findOne({
      where: { perfilId, activo: true },
    });
    if (existing) {
      throw new ConflictException(
        `Ese perfil ya tiene una venta activa (${existing.codigoVenta}).`,
      );
    }
  }

  private async assertCuentaLibre(cuentaId: string): Promise<void> {
    const existing = await this.salesRepository.findOne({
      where: { cuentaId, perfilId: IsNull(), activo: true },
    });
    if (existing) {
      throw new ConflictException(
        `Esa cuenta ya tiene una venta activa (${existing.codigoVenta}).`,
      );
    }
  }

  private assertNoPerteneceAUnCombo(sale: Sale): void {
    if (sale.ventaComboId) {
      throw new BadRequestException(
        `La venta ${sale.codigoVenta} pertenece al combo (ventaComboId=${sale.ventaComboId}); se gestiona desde /api/combo-sales, no directamente.`,
      );
    }
  }

  // Verifica que clienteId/cuentaId (y, por la cuenta, servicioId) existan
  // Y pertenezcan al `ownerId` dado. No coincide → 404, misma razón que
  // "recurso ajeno" (mismo criterio que Cuentas — ver
  // AccountsService.assertReferencesOwnedBy). Devuelve la cuenta ya
  // validada para que create() no tenga que volver a pedirla.
  private async assertReferencesOwnedBy(
    clienteId: string,
    cuentaId: string,
    ownerId: string,
  ): Promise<{
    cuenta: Awaited<ReturnType<AccountsService['findOne']>>;
    servicio: Awaited<ReturnType<ServicesService['findOne']>>;
  }> {
    const cliente = await this.contactsService.findOne(clienteId);
    if (cliente.ownerId !== ownerId) {
      throw new NotFoundException(`Contacto ${clienteId} no encontrado`);
    }
    const cuenta = await this.accountsService.findOne(cuentaId);
    if (cuenta.ownerId !== ownerId) {
      throw new NotFoundException(`Cuenta ${cuentaId} no encontrada`);
    }
    // Defensivo: por invariante de Fase B3 (AccountsService.
    // assertReferencesOwnedBy), el servicio de una cuenta SIEMPRE
    // pertenece al mismo dueño que la cuenta — así que esto no debería
    // poder fallar nunca en la práctica llegando por la API real. Se
    // valida explícitamente igual porque servicioId es una de las 4
    // referencias pedidas, y porque no cuesta nada mantenerlo si ese
    // invariante alguna vez se rompe en otro lado.
    const servicio = await this.servicesService.findOne(cuenta.servicioId);
    if (servicio.ownerId !== ownerId) {
      throw new NotFoundException(`Servicio ${cuenta.servicioId} no encontrado`);
    }
    return { cuenta, servicio };
  }
}
