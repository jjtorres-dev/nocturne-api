import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from './entities/profile.entity.js';
import { CreateProfileDto } from './dto/create-profile.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { QueryProfileDto } from './dto/query-profile.dto.js';
import { AccountsService } from '../accounts.service.js';
import { ServicesService } from '../../services/services.service.js';
import type { AuthenticatedUser } from '../../auth/jwt.strategy.js';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(Profile)
    private readonly profilesRepository: Repository<Profile>,
    private readonly accountsService: AccountsService,
    private readonly servicesService: ServicesService,
  ) {}

  // Perfiles no tiene su propia columna ownerId: el scoping deriva SIEMPRE
  // del owner_id de la Cuenta padre. accountsService.findOneOwned() ya
  // hace ese chequeo (404 si la cuenta no existe o es ajena) — reusarlo acá
  // es "el join" pedido, sin duplicar la lógica de ownership en dos lados.
  async create(
    accountId: string,
    dto: CreateProfileDto,
    currentUser: AuthenticatedUser,
  ): Promise<Profile> {
    await this.accountsService.findOneOwned(accountId, currentUser);
    await this.assertUnderScreenLimit(accountId);
    const profile = this.profilesRepository.create({
      ...dto,
      cuentaId: accountId,
    });
    return this.profilesRepository.save(profile);
  }

  async findAllOwned(
    accountId: string,
    query: QueryProfileDto,
    currentUser: AuthenticatedUser,
  ): Promise<Profile[]> {
    await this.accountsService.findOneOwned(accountId, currentUser);
    const where: Partial<Pick<Profile, 'cuentaId' | 'activo'>> = {
      cuentaId: accountId,
    };
    if (query.activo !== undefined) {
      where.activo = query.activo;
    }
    return this.profilesRepository.find({ where, order: { nombre: 'ASC' } });
  }

  // Sin scope de ownership: uso interno de SalesService, que necesita ver
  // cualquier perfil sin importar quién hizo la request HTTP original.
  // Nunca exponer este método directo en el controller — ver
  // findOneOwned para eso.
  async findOne(accountId: string, id: string): Promise<Profile> {
    const profile = await this.profilesRepository.findOne({
      where: { id, cuentaId: accountId },
    });
    if (!profile) {
      throw new NotFoundException(
        `Perfil ${id} no encontrado en la cuenta ${accountId}`,
      );
    }
    return profile;
  }

  // Un REVENDEDOR pidiendo un perfil de una cuenta ajena recibe 404 (por la
  // cuenta, no por el perfil): no hay que confirmarle que la cuenta existe
  // si no es suya.
  async findOneOwned(
    accountId: string,
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<Profile> {
    await this.accountsService.findOneOwned(accountId, currentUser);
    return this.findOne(accountId, id);
  }

  async update(
    accountId: string,
    id: string,
    dto: UpdateProfileDto,
    currentUser: AuthenticatedUser,
  ): Promise<Profile> {
    await this.findOneOwned(accountId, id, currentUser);
    // Ver nota en ServicesService.update: nunca Object.assign(entity, dto).
    await this.profilesRepository.update(id, dto);
    return this.findOneOwned(accountId, id, currentUser);
  }

  async softDelete(
    accountId: string,
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<Profile> {
    const profile = await this.findOneOwned(accountId, id, currentUser);
    profile.activo = false;
    return this.profilesRepository.save(profile);
  }

  async reactivate(
    accountId: string,
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<Profile> {
    const profile = await this.findOneOwned(accountId, id, currentUser);
    // Reactivar también puede chocar con el límite de pantallas (si se
    // llegó al máximo con otros perfiles activos mientras este estaba
    // desactivado), así que aplica la misma validación que al crear.
    await this.assertUnderScreenLimit(accountId);
    profile.activo = true;
    return this.profilesRepository.save(profile);
  }

  // La usa SalesService para sincronizar (o liberar, con null) el cliente
  // asignado a un perfil vendido.
  async assignCliente(
    accountId: string,
    id: string,
    clienteId: string | null,
  ): Promise<void> {
    await this.profilesRepository.update(
      { id, cuentaId: accountId },
      { clienteId },
    );
  }

  private async assertUnderScreenLimit(accountId: string): Promise<void> {
    const account = await this.accountsService.findOne(accountId);
    const service = await this.servicesService.findOne(account.servicioId);
    if (service.pantallasMax === null) {
      return;
    }
    const activeCount = await this.profilesRepository.count({
      where: { cuentaId: accountId, activo: true },
    });
    if (activeCount >= service.pantallasMax) {
      throw new ConflictException(
        `La cuenta ya tiene ${activeCount} perfil(es) activo(s), el máximo para "${service.nombre}" es ${service.pantallasMax}.`,
      );
    }
  }
}
