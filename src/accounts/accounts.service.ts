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

const LIST_SELECT = {
  id: true,
  servicioId: true,
  proveedorId: true,
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
  // claveServicio / claveCorreo quedan afuera a propósito: el listado
  // nunca debe exponer credenciales, solo el detalle (findOne).
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

  async create(dto: CreateAccountDto): Promise<Account> {
    await this.assertReferencesExist(dto.servicioId, dto.proveedorId);
    const account = this.accountsRepository.create(dto);
    return this.accountsRepository.save(account);
  }

  async findAll(query: QueryAccountDto): Promise<AccountListItem[]> {
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

    const accounts = await this.accountsRepository.find({
      where,
      select: LIST_SELECT,
      order: { createdAt: 'DESC' },
    });

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

  async findOne(id: string): Promise<Account> {
    const account = await this.accountsRepository.findOne({ where: { id } });
    if (!account) {
      throw new NotFoundException(`Cuenta ${id} no encontrada`);
    }
    return account;
  }

  async update(id: string, dto: UpdateAccountDto): Promise<Account> {
    await this.findOne(id);
    await this.assertReferencesExist(dto.servicioId, dto.proveedorId);
    // Ver nota en ServicesService.update: nunca Object.assign(entity, dto).
    await this.accountsRepository.update(id, dto);
    return this.findOne(id);
  }

  async softDelete(id: string): Promise<Account> {
    const account = await this.findOne(id);
    account.activo = false;
    return this.accountsRepository.save(account);
  }

  async reactivate(id: string): Promise<Account> {
    const account = await this.findOne(id);
    account.activo = true;
    return this.accountsRepository.save(account);
  }

  private async assertReferencesExist(
    servicioId?: string,
    proveedorId?: string,
  ): Promise<void> {
    if (servicioId) {
      await this.servicesService.findOne(servicioId);
    }
    if (proveedorId) {
      await this.contactsService.findOne(proveedorId);
    }
  }
}
