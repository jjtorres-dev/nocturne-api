import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Not, Repository } from 'typeorm';
import { VentaCombo } from './entities/venta-combo.entity.js';
import { CreateComboSaleDto } from './dto/create-combo-sale.dto.js';
import { UpdateComboSaleDto } from './dto/update-combo-sale.dto.js';
import { QueryComboSaleDto } from './dto/query-combo-sale.dto.js';
import type { ComboSaleAsignacionDto } from './dto/combo-sale-asignacion.dto.js';
import { ContactsService } from '../contacts/contacts.service.js';
import { CombosService } from '../combos/combos.service.js';
import { Combo } from '../combos/entities/combo.entity.js';
import { Account } from '../accounts/entities/account.entity.js';
import { Profile } from '../accounts/profiles/entities/profile.entity.js';
import { Sale } from '../sales/entities/sale.entity.js';
import { SaleAdjustment } from '../sales/entities/sale-adjustment.entity.js';
import { Service } from '../services/entities/service.entity.js';
import { ServiceType } from '../services/service-type.enum.js';
import { Payment } from '../payments/entities/payment.entity.js';
import { PaymentType } from '../payments/payment-type.enum.js';
import { generateCodigoVenta } from '../sales/codigo-venta.util.js';
import { addMonthsToDate, todayIso } from '../sales/date.util.js';
import { round2 } from '../common/round2.js';
import { UserRole } from '../users/user-role.enum.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import { resolveOwnerName, type SearchResultItem } from '../common/search-result.js';

interface AsignacionValidada {
  asignacion: ComboSaleAsignacionDto;
  servicio: Service;
  perfilId: string | null;
}

// Solo id/name/email del dueño en el join, nunca el resto de User (ni por
// accidente el password_hash) — mismo criterio que Servicios/Contactos/
// Cuentas/Ventas/Combos.
const OWNER_SELECT = {
  id: true,
  name: true,
  email: true,
} as const;

const OWNED_SELECT = {
  id: true,
  ownerId: true,
  clienteId: true,
  comboId: true,
  codigoVenta: true,
  fechaInicio: true,
  fechaFin: true,
  duracionMeses: true,
  precio: true,
  moneda: true,
  tasaCambio: true,
  precioPEN: true,
  metodoPago: true,
  renovacionAutomatica: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  owner: OWNER_SELECT,
} as const;

@Injectable()
export class ComboSalesService {
  constructor(
    @InjectRepository(VentaCombo)
    private readonly ventaCombosRepository: Repository<VentaCombo>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly contactsService: ContactsService,
    private readonly combosService: CombosService,
  ) {}

  async create(
    dto: CreateComboSaleDto,
    currentUser: AuthenticatedUser,
  ): Promise<VentaCombo> {
    const combo = await this.assertReferencesOwnedBy(
      dto.clienteId,
      dto.comboId,
      currentUser.id,
    );
    this.assertAsignacionesCubrenCombo(combo, dto.asignaciones);

    const precio = dto.precio ?? combo.precioCombo;
    const tasaCambio = dto.tasaCambio ?? 1;

    const ventaComboId = await this.dataSource.transaction(
      async (manager) => {
        // Fase 1: validar TODO (existencia + ownership + exclusividad)
        // antes de escribir una sola fila — si cualquier asignación falla
        // acá, la transacción todavía no tocó la base de datos.
        const validadas: AsignacionValidada[] = [];
        for (const asignacion of dto.asignaciones) {
          validadas.push(
            await this.validarAsignacion(
              manager,
              combo,
              asignacion,
              currentUser.id,
            ),
          );
        }

        // Fase 2: recién acá se crea algo.
        const codigoVenta = await this.generateCodigoVentaCombo(manager);
        const ventaCombo = manager.create(VentaCombo, {
          ownerId: currentUser.id,
          clienteId: dto.clienteId,
          comboId: dto.comboId,
          codigoVenta,
          fechaInicio: dto.fechaInicio,
          fechaFin: dto.fechaFin,
          duracionMeses: dto.duracionMeses,
          precio,
          moneda: dto.moneda,
          tasaCambio,
          precioPEN: round2(precio * tasaCambio),
          metodoPago: dto.metodoPago,
          renovacionAutomatica: dto.renovacionAutomatica ?? false,
          activo: true,
        });
        const savedCombo = await manager.save(ventaCombo);

        for (const { asignacion, servicio, perfilId } of validadas) {
          const child = manager.create(Sale, {
            // Explícito con el valor, no derivado de la Cuenta: en la
            // práctica siempre coincide (validarAsignacion ya exige que la
            // cuenta pertenezca a currentUser.id), pero la venta hija no
            // debería depender de esa coincidencia para tener el dueño
            // correcto.
            ownerId: currentUser.id,
            clienteId: dto.clienteId,
            cuentaId: asignacion.cuentaId,
            perfilId,
            servicioId: asignacion.servicioId,
            codigoVenta: await generateCodigoVenta(manager),
            duracionMeses: servicio.duracionMeses,
            fechaInicio: dto.fechaInicio,
            fechaFin: dto.fechaFin,
            // El dinero real se registra en el Payment de la VentaCombo,
            // no en las ventas hijas.
            precio: 0,
            moneda: dto.moneda,
            tasaCambio,
            precioPEN: 0,
            metodoPago: dto.metodoPago,
            renovacionAutomatica: dto.renovacionAutomatica ?? false,
            ventaComboId: savedCombo.id,
            activo: true,
          });
          await manager.save(child);

          if (perfilId) {
            await manager.update(
              Profile,
              { id: perfilId, cuentaId: asignacion.cuentaId },
              { clienteId: dto.clienteId },
            );
          } else {
            await manager.update(Account, asignacion.cuentaId, {
              clienteId: dto.clienteId,
            });
          }
        }

        const payment = manager.create(Payment, {
          ventaId: null,
          ventaComboId: savedCombo.id,
          monto: precio,
          moneda: dto.moneda,
          tasaCambio,
          montoPEN: round2(precio * tasaCambio),
          metodoPago: dto.metodoPago,
          fecha: dto.fechaInicio,
          tipo: PaymentType.VENTA_INICIAL,
        });
        await manager.save(payment);

        return savedCombo.id;
      },
    );

    return this.findOne(ventaComboId);
  }

  // Sin scope de ownership: no tiene caller interno hoy (a diferencia de
  // Servicios/Contactos/Cuentas), se mantiene por paridad de patrón. Nunca
  // exponer este método (ni findOne) directo en el controller — ver
  // findAllOwned/findOneOwned para eso.
  findAll(query: QueryComboSaleDto): Promise<VentaCombo[]> {
    const where: Partial<Pick<VentaCombo, 'clienteId' | 'comboId' | 'activo'>> =
      {};
    if (query.clienteId) {
      where.clienteId = query.clienteId;
    }
    if (query.comboId) {
      where.comboId = query.comboId;
    }
    if (query.activo !== undefined) {
      where.activo = query.activo;
    }
    return this.ventaCombosRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<VentaCombo> {
    const ventaCombo = await this.ventaCombosRepository.findOne({
      where: { id },
      relations: {
        ventas: { servicio: true, cuenta: true, perfil: true },
      },
    });
    if (!ventaCombo) {
      throw new NotFoundException(`VentaCombo ${id} no encontrada`);
    }
    const [conCuentaCaida] = await this.withCuentaCaida([ventaCombo]);
    return conCuentaCaida;
  }

  // Punto de entrada para el controller: un REVENDEDOR SIEMPRE queda
  // acotado a lo suyo acá, sin depender de que el cliente mande el filtro
  // correcto — la seguridad vive en el backend.
  async findAllOwned(
    query: QueryComboSaleDto,
    currentUser: AuthenticatedUser,
  ): Promise<VentaCombo[]> {
    const where: Partial<
      Pick<VentaCombo, 'clienteId' | 'comboId' | 'activo' | 'ownerId'>
    > = {};
    if (query.clienteId) {
      where.clienteId = query.clienteId;
    }
    if (query.comboId) {
      where.comboId = query.comboId;
    }
    if (query.activo !== undefined) {
      where.activo = query.activo;
    }
    if (currentUser.role === UserRole.REVENDEDOR) {
      where.ownerId = currentUser.id;
    }
    return this.withCuentaCaida(
      await this.ventaCombosRepository.find({
        where,
        relations: { owner: true },
        select: OWNED_SELECT,
        order: { createdAt: 'DESC' },
      }),
    );
  }

  // Un REVENDEDOR pidiendo una VentaCombo ajena recibe 404, no 403: no hay
  // que confirmarle que el recurso existe si no es suyo.
  async findOneOwned(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<VentaCombo> {
    const ventaCombo = await this.ventaCombosRepository.findOne({
      where: { id },
      relations: {
        owner: true,
        ventas: { servicio: true, cuenta: true, perfil: true },
      },
      select: OWNED_SELECT,
    });
    if (
      !ventaCombo ||
      (currentUser.role === UserRole.REVENDEDOR &&
        ventaCombo.ownerId !== currentUser.id)
    ) {
      throw new NotFoundException(`VentaCombo ${id} no encontrada`);
    }
    const [conCuentaCaida] = await this.withCuentaCaida([ventaCombo]);
    return conCuentaCaida;
  }

  // Historial de ajustes de la venta de combo (hoy: días compensados por
  // una cuenta caída), del más reciente al más antiguo. Mismo scoping que
  // el detalle (findOneOwned → 404 si es ajena).
  async adjustments(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<SaleAdjustment[]> {
    await this.findOneOwned(id, currentUser);
    return this.dataSource.getRepository(SaleAdjustment).find({
      where: { ventaComboId: id },
      order: { createdAt: 'DESC' },
    });
  }

  // Buscador global (ver src/search/): LIMIT 5, acotado por ownerId con el
  // mismo criterio que findAllOwned — un REVENDEDOR nunca ve ventas de
  // combo de otro dueño en los resultados.
  async search(
    term: string,
    currentUser: AuthenticatedUser,
  ): Promise<SearchResultItem[]> {
    const qb = this.ventaCombosRepository
      .createQueryBuilder('ventaCombo')
      .select(['ventaCombo.id', 'ventaCombo.codigoVenta'])
      .where('ventaCombo.codigoVenta ILIKE :term', { term: `%${term}%` })
      .orderBy('ventaCombo.createdAt', 'DESC')
      .limit(5);
    if (currentUser.role === UserRole.REVENDEDOR) {
      qb.andWhere('ventaCombo.ownerId = :ownerId', { ownerId: currentUser.id });
    } else {
      qb.leftJoin('ventaCombo.owner', 'owner').addSelect(['owner.name']);
    }
    const ventasCombo = await qb.getMany();
    return ventasCombo.map((v) => ({
      id: v.id,
      label: v.codigoVenta,
      ownerName: resolveOwnerName(v.owner?.name, currentUser),
    }));
  }

  async update(
    id: string,
    dto: UpdateComboSaleDto,
    currentUser: AuthenticatedUser,
  ): Promise<VentaCombo> {
    // UpdateComboSaleDto no permite reasignar clienteId/comboId/
    // asignaciones (ver el comentario en el DTO), así que no hay
    // referencias que revalidar acá — a diferencia de Combos/Cuentas.
    // findOneOwned ya cubre el 404 si la VentaCombo es ajena.
    const ventaCombo = await this.findOneOwned(id, currentUser);
    // Ver nota en ServicesService.update: nunca Object.assign(entity, dto).
    const updatePayload: Partial<VentaCombo> = { ...dto };
    if (dto.precio !== undefined || dto.tasaCambio !== undefined) {
      const precio = dto.precio ?? ventaCombo.precio;
      const tasaCambio = dto.tasaCambio ?? ventaCombo.tasaCambio;
      updatePayload.precioPEN = round2(precio * tasaCambio);
    }
    await this.ventaCombosRepository.update(id, updatePayload);
    return this.findOneOwned(id, currentUser);
  }

  async softDelete(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<VentaCombo> {
    await this.findOneOwned(id, currentUser);
    await this.dataSource.transaction(async (manager) => {
      const ventaCombo = await manager.findOne(VentaCombo, { where: { id } });
      if (!ventaCombo) {
        throw new NotFoundException(`VentaCombo ${id} no encontrada`);
      }
      const ventas = await manager.find(Sale, { where: { ventaComboId: id } });
      for (const venta of ventas) {
        await manager.update(Sale, venta.id, { activo: false });
        await this.liberarAsignacion(manager, venta);
      }
      await manager.update(VentaCombo, id, { activo: false });
    });
    return this.findOne(id);
  }

  async reactivate(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<VentaCombo> {
    await this.findOneOwned(id, currentUser);
    await this.dataSource.transaction(async (manager) => {
      const ventaCombo = await manager.findOne(VentaCombo, { where: { id } });
      if (!ventaCombo) {
        throw new NotFoundException(`VentaCombo ${id} no encontrada`);
      }
      const ventas = await manager.find(Sale, { where: { ventaComboId: id } });

      // Bloque — Cuentas caídas: mismo criterio que create(), con que una
      // sola cuenta del combo esté caída no se reactiva ninguna hija.
      const caidas = await manager.find(Account, {
        where: {
          id: In(ventas.map((venta) => venta.cuentaId)),
          fechaCaida: Not(IsNull()),
        },
      });
      if (caidas.length > 0) {
        throw new BadRequestException(
          'La cuenta está caída: no se puede reactivar la venta de combo hasta que el proveedor reponga todas sus cuentas.',
        );
      }

      // Fase 1: revalidar exclusividad de TODAS las ventas hijas antes de
      // reactivar ninguna. Ver assertAsignacionSigueLibre: esto corre SIN
      // scope de ownership a propósito, ni siquiera para el admin.
      for (const venta of ventas) {
        await this.assertAsignacionSigueLibre(manager, venta);
      }

      // Fase 2: reactivar y resincronizar clienteId.
      for (const venta of ventas) {
        await manager.update(Sale, venta.id, { activo: true });
        if (venta.perfilId) {
          await manager.update(
            Profile,
            { id: venta.perfilId, cuentaId: venta.cuentaId },
            { clienteId: venta.clienteId },
          );
        } else {
          await manager.update(Account, venta.cuentaId, {
            clienteId: venta.clienteId,
          });
        }
      }
      await manager.update(VentaCombo, id, { activo: true });
    });
    return this.findOne(id);
  }

  async renew(id: string, currentUser: AuthenticatedUser): Promise<VentaCombo> {
    await this.findOneOwned(id, currentUser);
    await this.dataSource.transaction(async (manager) => {
      const ventaCombo = await manager.findOne(VentaCombo, { where: { id } });
      if (!ventaCombo) {
        throw new NotFoundException(`VentaCombo ${id} no encontrada`);
      }
      const fechaFin = addMonthsToDate(
        ventaCombo.fechaFin,
        ventaCombo.duracionMeses,
      );

      await manager.update(VentaCombo, id, { fechaFin });
      await manager.update(Sale, { ventaComboId: id }, { fechaFin });

      const payment = manager.create(Payment, {
        ventaId: null,
        ventaComboId: id,
        monto: ventaCombo.precio,
        moneda: ventaCombo.moneda,
        tasaCambio: ventaCombo.tasaCambio,
        montoPEN: round2(ventaCombo.precio * ventaCombo.tasaCambio),
        metodoPago: ventaCombo.metodoPago,
        fecha: todayIso(),
        tipo: PaymentType.RENOVACION,
      });
      await manager.save(payment);
    });
    return this.findOne(id);
  }

  // Bloque — Cuentas caídas: marca cada VentaCombo con alguna venta hija
  // activa en una cuenta caída (ver Sale.cuentaCaida). Una sola consulta
  // para todo el listado.
  private async withCuentaCaida(
    ventasCombo: VentaCombo[],
  ): Promise<VentaCombo[]> {
    if (ventasCombo.length === 0) {
      return ventasCombo;
    }
    const rows = await this.dataSource
      .getRepository(Sale)
      .createQueryBuilder('sale')
      .innerJoin('sale.cuenta', 'cuenta')
      .select('DISTINCT sale.ventaComboId', 'ventaComboId')
      .where('sale.ventaComboId IN (:...ids)', {
        ids: ventasCombo.map((ventaCombo) => ventaCombo.id),
      })
      .andWhere('sale.activo = true')
      .andWhere('cuenta.fechaCaida IS NOT NULL')
      .getRawMany<{ ventaComboId: string }>();
    const caidos = new Set(rows.map((row) => row.ventaComboId));
    for (const ventaCombo of ventasCombo) {
      ventaCombo.cuentaCaida = caidos.has(ventaCombo.id);
    }
    return ventasCombo;
  }

  // Ni de más ni de menos: cada servicioId del combo debe aparecer
  // exactamente una vez entre las asignaciones.
  private assertAsignacionesCubrenCombo(
    combo: Combo,
    asignaciones: ComboSaleAsignacionDto[],
  ): void {
    if (asignaciones.length !== combo.servicios.length) {
      throw new BadRequestException(
        `El combo "${combo.nombre}" tiene ${combo.servicios.length} servicio(s); se recibieron ${asignaciones.length} asignación(es).`,
      );
    }
    const comboServicioIds = new Set(combo.servicios.map((s) => s.id));
    const vistos = new Set<string>();
    for (const asignacion of asignaciones) {
      if (!comboServicioIds.has(asignacion.servicioId)) {
        throw new BadRequestException(
          `El servicio ${asignacion.servicioId} no pertenece al combo "${combo.nombre}".`,
        );
      }
      if (vistos.has(asignacion.servicioId)) {
        throw new BadRequestException(
          `Asignación duplicada para el servicio ${asignacion.servicioId}.`,
        );
      }
      vistos.add(asignacion.servicioId);
    }
  }

  // Misma lógica de exclusividad que SalesService.create(), pero corriendo
  // sobre el EntityManager de la transacción (no los repositorios inyectados
  // de AccountsService/ProfilesService/SalesService, que usan la conexión
  // por defecto y no participarían del rollback).
  //
  // La comprobación de ownership de cuenta/servicio de acá abajo SÍ se
  // filtra por `ownerId` (404 en ajenos, ver comentario de
  // assertReferencesOwnedBy) — pero los chequeos de exclusividad
  // (`ocupado`, más abajo, y assertAsignacionSigueLibre) son la EXCEPCIÓN
  // deliberada a "todo se filtra por dueño" que rige el resto de este
  // servicio: miran TODA la tabla `sales`, nunca acotadas por ownerId de
  // quien pregunta. La razón es de negocio, no técnica: una cuenta o
  // perfil de streaming es un recurso físico compartido (una sola cuenta
  // de Netflix con sus pantallas), no algo que se duplique por usuario —
  // si esta exclusividad se filtrara por owner, dos revendedores distintos
  // (o el mismo admin) podrían vender el mismo perfil real a la vez sin
  // que el sistema lo detecte. Mismo criterio ya validado en
  // SalesService.reactivate (Fase B4).
  private async validarAsignacion(
    manager: EntityManager,
    combo: Combo,
    asignacion: ComboSaleAsignacionDto,
    ownerId: string,
  ): Promise<AsignacionValidada> {
    const servicio = combo.servicios.find(
      (s) => s.id === asignacion.servicioId,
    )!;
    // Defensivo: por invariante de CombosService.assertServiciosOwnedBy, un
    // servicio dentro de `combo.servicios` SIEMPRE pertenece al mismo dueño
    // que el combo — y el combo ya se validó contra `ownerId` en
    // assertReferencesOwnedBy. No debería poder fallar nunca en la
    // práctica llegando por la API real, se valida igual porque servicioId
    // es una de las referencias pedidas explícitamente (mismo criterio que
    // el chequeo defensivo de servicioId en SalesService.
    // assertReferencesOwnedBy).
    if (servicio.ownerId !== ownerId) {
      throw new NotFoundException(`Servicio ${servicio.id} no encontrado`);
    }

    const cuenta = await manager.findOne(Account, {
      where: { id: asignacion.cuentaId },
    });
    if (!cuenta || cuenta.ownerId !== ownerId) {
      throw new NotFoundException(`Cuenta ${asignacion.cuentaId} no encontrada`);
    }
    // Bloque — Cuentas caídas: mismo criterio que SalesService.create.
    if (cuenta.fechaCaida) {
      throw new BadRequestException(
        `El servicio "${servicio.nombre}": la cuenta está caída, no se puede vender hasta que el proveedor la reponga.`,
      );
    }
    if (cuenta.servicioId !== asignacion.servicioId) {
      throw new BadRequestException(
        `La cuenta ${asignacion.cuentaId} no pertenece al servicio "${servicio.nombre}".`,
      );
    }

    const requierePerfil =
      servicio.tipo === ServiceType.CON_PERFILES ||
      servicio.tipo === ServiceType.FAMILIAR;
    const perfilId = asignacion.perfilId ?? null;

    if (requierePerfil) {
      if (!perfilId) {
        throw new BadRequestException(
          `El servicio "${servicio.nombre}" requiere seleccionar un perfil.`,
        );
      }
      // El perfil no tiene columna ownerId propia: pertenece al dueño de
      // la cuenta, que ya se validó arriba (mismo criterio que Profiles
      // con Accounts en Fase B3).
      const perfil = await manager.findOne(Profile, {
        where: { id: perfilId, cuentaId: asignacion.cuentaId },
      });
      if (!perfil) {
        throw new NotFoundException(
          `Perfil ${perfilId} no encontrado en la cuenta ${asignacion.cuentaId}`,
        );
      }
      const ocupado = await manager.findOne(Sale, {
        where: { perfilId, activo: true },
      });
      if (ocupado) {
        throw new ConflictException(
          `El servicio "${servicio.nombre}": ese perfil ya tiene una venta activa (${ocupado.codigoVenta}).`,
        );
      }
    } else {
      if (perfilId) {
        throw new BadRequestException(
          `El servicio "${servicio.nombre}" no usa perfiles; no se debe indicar perfilId.`,
        );
      }
      const ocupado = await manager.findOne(Sale, {
        where: { cuentaId: asignacion.cuentaId, perfilId: IsNull(), activo: true },
      });
      if (ocupado) {
        throw new ConflictException(
          `El servicio "${servicio.nombre}": esa cuenta ya tiene una venta activa (${ocupado.codigoVenta}).`,
        );
      }
    }

    return { asignacion, servicio, perfilId };
  }

  // Ver el comentario extenso en validarAsignacion: esto corre SIN scope de
  // ownership a propósito, ni siquiera para el admin — la exclusividad de
  // un recurso físico compartido no depende de quién pregunta.
  private async assertAsignacionSigueLibre(
    manager: EntityManager,
    venta: Sale,
  ): Promise<void> {
    if (venta.perfilId) {
      const ocupado = await manager.findOne(Sale, {
        where: { perfilId: venta.perfilId, activo: true },
      });
      if (ocupado) {
        throw new ConflictException(
          `El perfil de la venta ${venta.codigoVenta} ya no está libre (ocupado por ${ocupado.codigoVenta}).`,
        );
      }
    } else {
      const ocupado = await manager.findOne(Sale, {
        where: { cuentaId: venta.cuentaId, perfilId: IsNull(), activo: true },
      });
      if (ocupado) {
        throw new ConflictException(
          `La cuenta de la venta ${venta.codigoVenta} ya no está libre (ocupada por ${ocupado.codigoVenta}).`,
        );
      }
    }
  }

  private async liberarAsignacion(
    manager: EntityManager,
    venta: Sale,
  ): Promise<void> {
    if (venta.perfilId) {
      await manager.update(
        Profile,
        { id: venta.perfilId, cuentaId: venta.cuentaId },
        { clienteId: null },
      );
    } else {
      await manager.update(Account, venta.cuentaId, { clienteId: null });
    }
  }

  private async generateCodigoVentaCombo(
    manager: EntityManager,
  ): Promise<string> {
    const [{ nextval }] = await manager.query(
      "SELECT nextval('combo_sales_codigo_venta_seq') AS nextval",
    );
    return `C-${String(nextval).padStart(5, '0')}`;
  }

  // Verifica que clienteId/comboId existan Y pertenezcan al `ownerId` dado.
  // No coincide → 404, misma razón que "recurso ajeno" (mismo criterio que
  // SalesService.assertReferencesOwnedBy). Devuelve el combo (con
  // `servicios` cargado) ya validado para que create() no tenga que
  // volver a pedirlo.
  private async assertReferencesOwnedBy(
    clienteId: string,
    comboId: string,
    ownerId: string,
  ): Promise<Combo> {
    const cliente = await this.contactsService.findOne(clienteId);
    if (cliente.ownerId !== ownerId) {
      throw new NotFoundException(`Contacto ${clienteId} no encontrado`);
    }
    const combo = await this.combosService.findOne(comboId);
    if (combo.ownerId !== ownerId) {
      throw new NotFoundException(`Combo ${comboId} no encontrado`);
    }
    return combo;
  }
}
