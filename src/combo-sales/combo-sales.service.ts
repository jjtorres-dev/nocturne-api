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
import { round2 } from '../common/round2.js';

interface AsignacionValidada {
  asignacion: ComboSaleAsignacionDto;
  servicio: Service;
  perfilId: string | null;
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

        for (const { asignacion, servicio, perfilId } of validadas) {
          const child = manager.create(Sale, {
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

    return { asignacion, servicio, perfilId };
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
