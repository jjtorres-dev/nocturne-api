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

const DIAS_ALERTA_DEFAULT = 3;

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

  async create(dto: CreateSaleDto): Promise<Sale> {
    await this.contactsService.findOne(dto.clienteId);
    const cuenta = await this.accountsService.findOne(dto.cuentaId);
    const servicio = await this.servicesService.findOne(cuenta.servicioId);
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
      // También valida que el perfil pertenezca a esta cuenta (404 si no).
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

  // vencimiento se calcula siempre sobre ventas activas (ver PROGRESS.md);
  // por eso acá se ignora a propósito query.activo en vez de combinarlo.
  private findAllByVencimiento(query: QuerySaleDto): Promise<Sale[]> {
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

    return qb.orderBy('sale.createdAt', 'DESC').getMany();
  }

  private countByVencimiento(
    vencimiento: VencimientoFiltro,
    diasAlerta: number,
  ): Promise<number> {
    const qb = this.salesRepository
      .createQueryBuilder('sale')
      .where('sale.activo = :activo', { activo: true });
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

  async update(id: string, dto: UpdateSaleDto): Promise<Sale> {
    const sale = await this.findOne(id);
    // Ver nota en ServicesService.update: nunca Object.assign(entity, dto).
    const updatePayload: Partial<Sale> = { ...dto };
    if (dto.precio !== undefined || dto.tasaCambio !== undefined) {
      const precio = dto.precio ?? sale.precio;
      const tasaCambio = dto.tasaCambio ?? sale.tasaCambio;
      updatePayload.precioPEN = round2(precio * tasaCambio);
    }
    await this.salesRepository.update(id, updatePayload);
    return this.findOne(id);
  }

  async softDelete(id: string): Promise<Sale> {
    const sale = await this.findOne(id);
    this.assertNoPerteneceAUnCombo(sale);
    sale.activo = false;
    const saved = await this.salesRepository.save(sale);
    await this.liberar(sale);
    return saved;
  }

  async reactivate(id: string): Promise<Sale> {
    const sale = await this.findOne(id);
    this.assertNoPerteneceAUnCombo(sale);
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

  async renew(id: string, dto: RenewSaleDto = {}): Promise<Sale> {
    const sale = await this.findOne(id);
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

    return this.findOne(id);
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
}
