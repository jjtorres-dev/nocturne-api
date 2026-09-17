import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from './entities/account.entity.js';
import { Profile } from './profiles/entities/profile.entity.js';
import { CreateAccountDto } from './dto/create-account.dto.js';
import { UpdateAccountDto } from './dto/update-account.dto.js';
import { QueryAccountDto } from './dto/query-account.dto.js';
import type { AccountListItem } from './account-list-item.js';
import { ServicesService } from '../services/services.service.js';
import { ContactsService } from '../contacts/contacts.service.js';
import { round2 } from '../common/round2.js';
import { UserRole } from '../users/user-role.enum.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

export interface ServicioInversion {
  servicioId: string;
  inversion: number;
}

// Solo id/name/email del dueño en el join, nunca el resto de User (ni por
// accidente el password_hash) — mismo criterio que Servicios/Contactos.
const OWNER_SELECT = {
  id: true,
  name: true,
  email: true,
} as const;

// Sin ownerId/owner: shape del `findAll` sin scope (uso interno, ver más
// abajo), igual que antes de Fase B3. claveServicio/claveCorreo quedan
// afuera a propósito: el listado nunca debe exponer credenciales.
const LIST_SELECT = {
  id: true,
  servicioId: true,
  proveedorId: true,
  clienteId: true,
  correo: true,
  fechaInicio: true,
  fechaFin: true,
  costo: true,
  metodoPago: true,
  url: true,
  renovacionAutomatica: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Usado por findAllOwned: agrega ownerId/owner (con el `select` anidado
// restringido a id/name/email — sin esto TypeORM trae el User completo,
// password_hash incluido, apenas se pide la relación).
const OWNED_LIST_SELECT = {
  ...LIST_SELECT,
  ownerId: true,
  owner: OWNER_SELECT,
} as const;

// Usado por findOneOwned: a diferencia del listado, el detalle sí devuelve
// las credenciales (claveServicio/claveCorreo) — mismo comportamiento de
// siempre (Fase 2), ahora con ownerId/owner también.
const OWNED_DETAIL_SELECT = {
  ...OWNED_LIST_SELECT,
  claveServicio: true,
  claveCorreo: true,
} as const;

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly accountsRepository: Repository<Account>,
    @InjectRepository(Profile)
    private readonly profilesRepository: Repository<Profile>,
    private readonly servicesService: ServicesService,
    private readonly contactsService: ContactsService,
  ) {}

  async create(
    dto: CreateAccountDto,
    currentUser: AuthenticatedUser,
  ): Promise<Account> {
    await this.assertReferencesOwnedBy(
      dto.servicioId,
      dto.proveedorId,
      currentUser.id,
    );
    const account = this.accountsRepository.create({
      ...dto,
      ownerId: currentUser.id,
    });
    return this.accountsRepository.save(account);
  }

  // Sin scope de ownership: uso interno de otros módulos (ProfilesService,
  // SalesService, AccountingService) que necesitan ver cualquier cuenta sin
  // importar quién hizo la request HTTP original. Nunca exponer este
  // método (ni findOne) directo en el controller — ver findAllOwned/
  // findOneOwned para eso. No trae ownerId/owner ni perfilesCount: ningún
  // caller interno de hoy los necesita (a diferencia de findAllOwned, que
  // sí es un endpoint HTTP real).
  findAll(query: QueryAccountDto): Promise<Account[]> {
    const where: Partial<{
      servicioId: string;
      proveedorId: string;
      activo: boolean;
    }> = {};
    if (query.servicioId) {
      where.servicioId = query.servicioId;
    }
    if (query.proveedorId) {
      where.proveedorId = query.proveedorId;
    }
    if (query.activo !== undefined) {
      where.activo = query.activo;
    }

    return this.accountsRepository.find({
      where,
      select: LIST_SELECT,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Account> {
    const account = await this.accountsRepository.findOne({ where: { id } });
    if (!account) {
      throw new NotFoundException(`Cuenta ${id} no encontrada`);
    }
    return account;
  }

  // Punto de entrada para el controller: un REVENDEDOR SIEMPRE queda
  // acotado a lo suyo acá, sin depender de que el cliente mande el filtro
  // correcto — la seguridad vive en el backend.
  async findAllOwned(
    query: QueryAccountDto,
    currentUser: AuthenticatedUser,
  ): Promise<AccountListItem[]> {
    const where: Partial<{
      servicioId: string;
      proveedorId: string;
      activo: boolean;
      ownerId: string;
    }> = {};
    if (query.servicioId) {
      where.servicioId = query.servicioId;
    }
    if (query.proveedorId) {
      where.proveedorId = query.proveedorId;
    }
    if (query.activo !== undefined) {
      where.activo = query.activo;
    }
    if (currentUser.role === UserRole.REVENDEDOR) {
      where.ownerId = currentUser.id;
    }

    const accounts = await this.accountsRepository.find({
      where,
      relations: { owner: true },
      select: OWNED_LIST_SELECT,
      order: { createdAt: 'DESC' },
    });

    return this.withPerfilesCount(accounts);
  }

  // Un REVENDEDOR pidiendo una cuenta ajena recibe 404, no 403: no hay que
  // confirmarle que el recurso existe si no es suyo.
  async findOneOwned(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<Account> {
    const account = await this.accountsRepository.findOne({
      where: { id },
      relations: { owner: true },
      select: OWNED_DETAIL_SELECT,
    });
    if (
      !account ||
      (currentUser.role === UserRole.REVENDEDOR &&
        account.ownerId !== currentUser.id)
    ) {
      throw new NotFoundException(`Cuenta ${id} no encontrada`);
    }
    return account;
  }

  async update(
    id: string,
    dto: UpdateAccountDto,
    currentUser: AuthenticatedUser,
  ): Promise<Account> {
    const existing = await this.findOneOwned(id, currentUser);
    // El servicio/proveedor referenciado tiene que pertenecer al MISMO
    // dueño que la cuenta ya tiene, sin importar quién esté editando — así
    // el admin puede editar una cuenta ajena sin poder "cruzarle" el
    // catálogo de otro revendedor.
    await this.assertReferencesOwnedBy(
      dto.servicioId,
      dto.proveedorId,
      existing.ownerId,
    );
    // Ver nota en ServicesService.update: nunca Object.assign(entity, dto).
    await this.accountsRepository.update(id, dto);
    return this.findOneOwned(id, currentUser);
  }

  async softDelete(id: string, currentUser: AuthenticatedUser): Promise<Account> {
    const account = await this.findOneOwned(id, currentUser);
    account.activo = false;
    return this.accountsRepository.save(account);
  }

  async reactivate(id: string, currentUser: AuthenticatedUser): Promise<Account> {
    const account = await this.findOneOwned(id, currentUser);
    account.activo = true;
    return this.accountsRepository.save(account);
  }

  // La usa SalesService para sincronizar (o liberar, con null) el cliente
  // asignado a una cuenta vendida completa (servicios SIN_PERFILES/IPTV).
  async assignCliente(id: string, clienteId: string | null): Promise<void> {
    await this.accountsRepository.update(id, { clienteId });
  }

  // "inversion" en Fase 5 (Contabilidad): la fecha relevante es cuándo se
  // compró la cuenta (createdAt), no fechaInicio/fechaFin del período de
  // uso. Incluye cuentas desactivadas a propósito: el costo ya se pagó
  // aunque la cuenta luego se haya dado de baja.
  async sumCosto(desde: string, hasta: string): Promise<number> {
    const result = await this.accountsRepository
      .createQueryBuilder('account')
      .select('COALESCE(SUM(account.costo), 0)', 'total')
      .where('CAST(account.createdAt AS date) BETWEEN :desde AND :hasta', {
        desde,
        hasta,
      })
      .getRawOne<{ total: string }>();
    return round2(parseFloat(result?.total ?? '0'));
  }

  async sumCostoByServicio(
    desde: string,
    hasta: string,
  ): Promise<ServicioInversion[]> {
    const rows = await this.accountsRepository
      .createQueryBuilder('account')
      .select('account.servicioId', 'servicioId')
      .addSelect('SUM(account.costo)', 'inversion')
      .where('CAST(account.createdAt AS date) BETWEEN :desde AND :hasta', {
        desde,
        hasta,
      })
      .groupBy('account.servicioId')
      .getRawMany<{ servicioId: string; inversion: string }>();
    return rows.map((row) => ({
      servicioId: row.servicioId,
      inversion: round2(parseFloat(row.inversion)),
    }));
  }

  private async withPerfilesCount<T extends { id: string }>(
    accounts: T[],
  ): Promise<(T & { perfilesCount: number })[]> {
    if (accounts.length === 0) {
      return [];
    }

    const counts = await this.profilesRepository
      .createQueryBuilder('profile')
      .select('profile.cuentaId', 'cuentaId')
      .addSelect('COUNT(*)', 'count')
      .where('profile.cuentaId IN (:...ids)', {
        ids: accounts.map((a) => a.id),
      })
      .andWhere('profile.activo = true')
      .groupBy('profile.cuentaId')
      .getRawMany<{ cuentaId: string; count: string }>();
    const countByAccountId = new Map(
      counts.map((c) => [c.cuentaId, parseInt(c.count, 10)]),
    );

    return accounts.map((account) => ({
      ...account,
      perfilesCount: countByAccountId.get(account.id) ?? 0,
    }));
  }

  // Verifica que el servicio y/o proveedor referenciados por una cuenta
  // existan Y pertenezcan al `ownerId` dado. No coincide → 404, misma razón
  // que "recurso ajeno": referenciar algo que no es tuyo no es un caso
  // válido, no hace falta un 409/403 distinto.
  private async assertReferencesOwnedBy(
    servicioId: string | undefined,
    proveedorId: string | undefined,
    ownerId: string,
  ): Promise<void> {
    if (servicioId) {
      const servicio = await this.servicesService.findOne(servicioId);
      if (servicio.ownerId !== ownerId) {
        throw new NotFoundException(`Servicio ${servicioId} no encontrado`);
      }
    }
    if (proveedorId) {
      const proveedor = await this.contactsService.findOne(proveedorId);
      if (proveedor.ownerId !== ownerId) {
        throw new NotFoundException(`Contacto ${proveedorId} no encontrado`);
      }
    }
  }
}
