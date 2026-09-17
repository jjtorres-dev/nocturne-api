import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
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
import { Service } from '../services/entities/service.entity.js';
import { ServiceType } from '../services/service-type.enum.js';
import { Payment } from '../payments/entities/payment.entity.js';
import { PaymentType } from '../payments/payment-type.enum.js';
import { generateCodigoVenta } from '../sales/codigo-venta.util.js';
import { addMonthsToDate, todayIso } from '../sales/date.util.js';
import { round2 } from '../common/round2.js';

interface AsignacionValidada {
  asignacion: ComboSaleAsignacionDto;
  servicio: Service;
  perfilId: string | null;
  ownerId: string;
}

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

  async create(dto: CreateComboSaleDto): Promise<VentaCombo> {
    await this.contactsService.findOne(dto.clienteId);
    const combo = await this.combosService.findOne(dto.comboId);
    this.assertAsignacionesCubrenCombo(combo, dto.asignaciones);

    const precio = dto.precio ?? combo.precioCombo;
    const tasaCambio = dto.tasaCambio ?? 1;

    const ventaComboId = await this.dataSource.transaction(
      async (manager) => {
        // Fase 1: validar TODO (existencia + exclusividad) antes de
        // escribir una sola fila — si cualquier asignación falla acá, la
        // transacción todavía no tocó la base de datos.
        const validadas: AsignacionValidada[] = [];
        for (const asignacion of dto.asignaciones) {
          validadas.push(
            await this.validarAsignacion(manager, combo, asignacion),
          );
        }

        // Fase 2: recién acá se crea algo.
        const codigoVenta = await this.generateCodigoVentaCombo(manager);
        const ventaCombo = manager.create(VentaCombo, {
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

        for (const { asignacion, servicio, perfilId, ownerId } of validadas) {
          const child = manager.create(Sale, {
            ownerId,
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
    return ventaCombo;
  }

  async update(id: string, dto: UpdateComboSaleDto): Promise<VentaCombo> {
    const ventaCombo = await this.findEntity(id);
    // Ver nota en ServicesService.update: nunca Object.assign(entity, dto).
    const updatePayload: Partial<VentaCombo> = { ...dto };
    if (dto.precio !== undefined || dto.tasaCambio !== undefined) {
      const precio = dto.precio ?? ventaCombo.precio;
      const tasaCambio = dto.tasaCambio ?? ventaCombo.tasaCambio;
      updatePayload.precioPEN = round2(precio * tasaCambio);
    }
    await this.ventaCombosRepository.update(id, updatePayload);
    return this.findOne(id);
  }

  async softDelete(id: string): Promise<VentaCombo> {
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

  async reactivate(id: string): Promise<VentaCombo> {
    await this.dataSource.transaction(async (manager) => {
      const ventaCombo = await manager.findOne(VentaCombo, { where: { id } });
      if (!ventaCombo) {
        throw new NotFoundException(`VentaCombo ${id} no encontrada`);
      }
      const ventas = await manager.find(Sale, { where: { ventaComboId: id } });

      // Fase 1: revalidar exclusividad de TODAS las ventas hijas antes de
      // reactivar ninguna.
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

  async renew(id: string): Promise<VentaCombo> {
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

  private async findEntity(id: string): Promise<VentaCombo> {
    const ventaCombo = await this.ventaCombosRepository.findOne({
      where: { id },
    });
    if (!ventaCombo) {
      throw new NotFoundException(`VentaCombo ${id} no encontrada`);
    }
    return ventaCombo;
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
  private async validarAsignacion(
    manager: EntityManager,
    combo: Combo,
    asignacion: ComboSaleAsignacionDto,
  ): Promise<AsignacionValidada> {
    const servicio = combo.servicios.find(
      (s) => s.id === asignacion.servicioId,
    )!;
    const cuenta = await manager.findOne(Account, {
      where: { id: asignacion.cuentaId },
    });
    if (!cuenta) {
      throw new NotFoundException(`Cuenta ${asignacion.cuentaId} no encontrada`);
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

    // ComboSales todavía no está scopeado por dueño (fuera de alcance de
    // Fase B4 — solo "Ventas"/SalesService); las ventas hijas heredan el
    // ownerId de la Cuenta a la que quedan asignadas, mismo criterio que
    // SalesService.create() usaría si esto pasara por ahí.
    return { asignacion, servicio, perfilId, ownerId: cuenta.ownerId };
  }

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
}
