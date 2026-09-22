import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service } from './entities/service.entity.js';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';
import { QueryServiceDto } from './dto/query-service.dto.js';
import { UserRole } from '../users/user-role.enum.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import type { SearchResultItem } from '../common/search-result.js';

// Se agrega siempre a las respuestas de findOneOwned/findAllOwned (admin o
// REVENDEDOR, sin condicional por rol): solo id/name/email del dueño, nunca
// el resto de User (ni por accidente el password_hash) — mismo criterio que
// AccountsService con las columnas cifradas, restringir a nivel de query.
const OWNED_SELECT = {
  id: true,
  ownerId: true,
  nombre: true,
  tipo: true,
  duracionMeses: true,
  pantallasMax: true,
  precioBase: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  owner: {
    id: true,
    name: true,
    email: true,
  },
} as const;

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service)
    private readonly servicesRepository: Repository<Service>,
  ) {}

  create(dto: CreateServiceDto, currentUser: AuthenticatedUser): Promise<Service> {
    const service = this.servicesRepository.create({
      ...dto,
      ownerId: currentUser.id,
    });
    return this.servicesRepository.save(service);
  }

  // Sin scope de ownership: uso interno de otros módulos (AccountsService,
  // ProfilesService, SalesService, CombosService, AccountingService) que
  // necesitan ver cualquier servicio para validar FKs o armar reportes,
  // sin importar quién hizo la request HTTP original. Nunca exponer este
  // método (ni findOne) directo en el controller — ver findAllOwned/
  // findOneOwned para eso.
  findAll(query: QueryServiceDto): Promise<Service[]> {
    const where: Partial<Pick<Service, 'tipo' | 'activo'>> = {};
    if (query.tipo) {
      where.tipo = query.tipo;
    }
    if (query.activo !== undefined) {
      where.activo = query.activo;
    }
    return this.servicesRepository.find({ where, order: { nombre: 'ASC' } });
  }

  async findOne(id: string): Promise<Service> {
    const service = await this.servicesRepository.findOne({ where: { id } });
    if (!service) {
      throw new NotFoundException(`Servicio ${id} no encontrado`);
    }
    return service;
  }

  // Punto de entrada para el controller: un REVENDEDOR SIEMPRE queda
  // acotado a lo suyo acá, sin depender de que el cliente mande el filtro
  // correcto — la seguridad vive en el backend.
  findAllOwned(
    query: QueryServiceDto,
    currentUser: AuthenticatedUser,
  ): Promise<Service[]> {
    const where: Partial<Pick<Service, 'tipo' | 'activo' | 'ownerId'>> = {};
    if (query.tipo) {
      where.tipo = query.tipo;
    }
    if (query.activo !== undefined) {
      where.activo = query.activo;
    }
    if (currentUser.role === UserRole.REVENDEDOR) {
      where.ownerId = currentUser.id;
    }
    return this.servicesRepository.find({
      where,
      relations: { owner: true },
      select: OWNED_SELECT,
      order: { nombre: 'ASC' },
    });
  }

  // Un REVENDEDOR pidiendo un servicio ajeno recibe 404, no 403: no hay que
  // confirmarle que el recurso existe si no es suyo.
  async findOneOwned(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<Service> {
    const service = await this.servicesRepository.findOne({
      where: { id },
      relations: { owner: true },
      select: OWNED_SELECT,
    });
    if (
      !service ||
      (currentUser.role === UserRole.REVENDEDOR &&
        service.ownerId !== currentUser.id)
    ) {
      throw new NotFoundException(`Servicio ${id} no encontrado`);
    }
    return service;
  }

  // Buscador global (ver src/search/): LIMIT 5, acotado por ownerId con el
  // mismo criterio que findAllOwned — un REVENDEDOR nunca ve servicios de
  // otro dueño en los resultados.
  async search(
    term: string,
    currentUser: AuthenticatedUser,
  ): Promise<SearchResultItem[]> {
    const qb = this.servicesRepository
      .createQueryBuilder('service')
      .select(['service.id', 'service.nombre'])
      .where('service.nombre ILIKE :term', { term: `%${term}%` })
      .orderBy('service.createdAt', 'DESC')
      .limit(5);
    if (currentUser.role === UserRole.REVENDEDOR) {
      qb.andWhere('service.ownerId = :ownerId', { ownerId: currentUser.id });
    }
    const services = await qb.getMany();
    return services.map((s) => ({ id: s.id, label: s.nombre }));
  }

  async update(
    id: string,
    dto: UpdateServiceDto,
    currentUser: AuthenticatedUser,
  ): Promise<Service> {
    // No usar Object.assign(entity, dto): el dto que arma el ValidationPipe
    // trae como propiedades propias TODOS los campos declarados en la clase
    // (los no enviados quedan en `undefined`), y Object.assign pisaría en
    // memoria los valores ya cargados de la entidad. repository.update()
    // ignora las propiedades undefined al armar el UPDATE, así que solo
    // toca las columnas que realmente vinieron en el body.
    await this.findOneOwned(id, currentUser);
    await this.servicesRepository.update(id, dto);
    return this.findOneOwned(id, currentUser);
  }

  async softDelete(id: string, currentUser: AuthenticatedUser): Promise<Service> {
    const service = await this.findOneOwned(id, currentUser);
    service.activo = false;
    return this.servicesRepository.save(service);
  }

  async reactivate(id: string, currentUser: AuthenticatedUser): Promise<Service> {
    const service = await this.findOneOwned(id, currentUser);
    service.activo = true;
    return this.servicesRepository.save(service);
  }
}
