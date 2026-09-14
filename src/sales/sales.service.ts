import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Sale } from './entities/sale.entity.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { UpdateSaleDto } from './dto/update-sale.dto.js';
import { QuerySaleDto } from './dto/query-sale.dto.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { ProfilesService } from '../accounts/profiles/profiles.service.js';
import { ServicesService } from '../services/services.service.js';
import { ContactsService } from '../contacts/contacts.service.js';
import { ServiceType } from '../services/service-type.enum.js';
import { addMonthsToDate } from './date.util.js';

const round2 = (value: number) => Math.round(value * 100) / 100;

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private readonly salesRepository: Repository<Sale>,
    private readonly accountsService: AccountsService,
    private readonly profilesService: ProfilesService,
    private readonly servicesService: ServicesService,
    private readonly contactsService: ContactsService,
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
      codigoVenta: await this.generateCodigoVenta(),
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

    return saved;
  }

  findAll(query: QuerySaleDto): Promise<Sale[]> {
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
    sale.activo = false;
    const saved = await this.salesRepository.save(sale);
    await this.liberar(sale);
    return saved;
  }

  async reactivate(id: string): Promise<Sale> {
    const sale = await this.findOne(id);
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

  async renew(id: string): Promise<Sale> {
    const sale = await this.findOne(id);
    const fechaFin = addMonthsToDate(sale.fechaFin, sale.duracionMeses);
    await this.salesRepository.update(id, { fechaFin });
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

  private async generateCodigoVenta(): Promise<string> {
    const [{ nextval }] = await this.salesRepository.query(
      "SELECT nextval('sales_codigo_venta_seq') AS nextval",
    );
    return `V-${String(nextval).padStart(5, '0')}`;
  }
}
