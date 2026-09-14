import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from './entities/profile.entity.js';
import { CreateProfileDto } from './dto/create-profile.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { QueryProfileDto } from './dto/query-profile.dto.js';
import { AccountsService } from '../accounts.service.js';
import { ServicesService } from '../../services/services.service.js';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(Profile)
    private readonly profilesRepository: Repository<Profile>,
    private readonly accountsService: AccountsService,
    private readonly servicesService: ServicesService,
  ) {}

  async create(accountId: string, dto: CreateProfileDto): Promise<Profile> {
    await this.assertUnderScreenLimit(accountId);
    const profile = this.profilesRepository.create({
      ...dto,
      cuentaId: accountId,
    });
    return this.profilesRepository.save(profile);
  }

  async findAllByAccount(
    accountId: string,
    query: QueryProfileDto,
  ): Promise<Profile[]> {
    await this.accountsService.findOne(accountId);
    const where: Partial<Pick<Profile, 'cuentaId' | 'activo'>> = {
      cuentaId: accountId,
    };
    if (query.activo !== undefined) {
      where.activo = query.activo;
    }
    return this.profilesRepository.find({ where, order: { nombre: 'ASC' } });
  }

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

  async update(
    accountId: string,
    id: string,
    dto: UpdateProfileDto,
  ): Promise<Profile> {
    await this.findOne(accountId, id);
    // Ver nota en ServicesService.update: nunca Object.assign(entity, dto).
    await this.profilesRepository.update(id, dto);
    return this.findOne(accountId, id);
  }

  async softDelete(accountId: string, id: string): Promise<Profile> {
    const profile = await this.findOne(accountId, id);
    profile.activo = false;
    return this.profilesRepository.save(profile);
  }

  async reactivate(accountId: string, id: string): Promise<Profile> {
    const profile = await this.findOne(accountId, id);
    // Reactivar también puede chocar con el límite de pantallas (si se
    // llegó al máximo con otros perfiles activos mientras este estaba
    // desactivado), así que aplica la misma validación que al crear.
    await this.assertUnderScreenLimit(accountId);
    profile.activo = true;
    return this.profilesRepository.save(profile);
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
