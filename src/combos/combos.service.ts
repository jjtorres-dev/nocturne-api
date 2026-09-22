import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Combo } from './entities/combo.entity.js';
import { CreateComboDto } from './dto/create-combo.dto.js';
import { UpdateComboDto } from './dto/update-combo.dto.js';
import { QueryComboDto } from './dto/query-combo.dto.js';
import { ServicesService } from '../services/services.service.js';
import { Service } from '../services/entities/service.entity.js';
import { UserRole } from '../users/user-role.enum.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import type { SearchResultItem } from '../common/search-result.js';

// Se agrega siempre a las respuestas de findOneOwned/findAllOwned (admin o
// REVENDEDOR, sin condicional por rol): solo id/name/email del dueño, nunca
// el resto de User (ni por accidente el password_hash) — mismo criterio que
// Servicios/Contactos/Cuentas/Ventas.
const OWNED_SELECT = {
  id: true,
  ownerId: true,
  nombre: true,
  descripcion: true,
  precioCombo: true,
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
export class CombosService {
  constructor(
    @InjectRepository(Combo)
    private readonly combosRepository: Repository<Combo>,
    private readonly servicesService: ServicesService,
  ) {}

  async create(dto: CreateComboDto, currentUser: AuthenticatedUser): Promise<Combo> {
    const servicios = await this.resolveServicios(dto.servicioIds);
    this.assertServiciosOwnedBy(servicios, currentUser.id);
    const combo = this.combosRepository.create({
      nombre: dto.nombre,
      descripcion: dto.descripcion ?? null,
      precioCombo: dto.precioCombo,
      activo: dto.activo ?? true,
      ownerId: currentUser.id,
      servicios,
    });
    return this.combosRepository.save(combo);
  }

  // Sin scope de ownership: uso interno de otros módulos (ComboSalesService)
  // que necesitan ver cualquier combo para validar FKs, sin importar quién
  // hizo la request HTTP original. Nunca exponer este método directo en el
  // controller — ver findAllOwned/findOneOwned para eso.
  findAll(query: QueryComboDto): Promise<Combo[]> {
    const where: Partial<Pick<Combo, 'activo'>> = {};
    if (query.activo !== undefined) {
      where.activo = query.activo;
    }
    return this.combosRepository.find({
      where,
      relations: { servicios: true },
      order: { nombre: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Combo> {
    const combo = await this.combosRepository.findOne({
      where: { id },
      relations: { servicios: true },
    });
    if (!combo) {
      throw new NotFoundException(`Combo ${id} no encontrado`);
    }
    return combo;
  }

  // Punto de entrada para el controller: un REVENDEDOR SIEMPRE queda
  // acotado a lo suyo acá, sin depender de que el cliente mande el filtro
  // correcto — la seguridad vive en el backend.
  findAllOwned(
    query: QueryComboDto,
    currentUser: AuthenticatedUser,
  ): Promise<Combo[]> {
    const where: Partial<Pick<Combo, 'activo' | 'ownerId'>> = {};
    if (query.activo !== undefined) {
      where.activo = query.activo;
    }
    if (currentUser.role === UserRole.REVENDEDOR) {
      where.ownerId = currentUser.id;
    }
    return this.combosRepository.find({
      where,
      relations: { servicios: true, owner: true },
      select: OWNED_SELECT,
      order: { nombre: 'ASC' },
    });
  }

  // Un REVENDEDOR pidiendo un combo ajeno recibe 404, no 403: no hay que
  // confirmarle que el recurso existe si no es suyo.
  async findOneOwned(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<Combo> {
    const combo = await this.combosRepository.findOne({
      where: { id },
      relations: { servicios: true, owner: true },
      select: OWNED_SELECT,
    });
    if (
      !combo ||
      (currentUser.role === UserRole.REVENDEDOR &&
        combo.ownerId !== currentUser.id)
    ) {
      throw new NotFoundException(`Combo ${id} no encontrado`);
    }
    return combo;
  }

  // Buscador global (ver src/search/): LIMIT 5, acotado por ownerId con el
  // mismo criterio que findAllOwned — un REVENDEDOR nunca ve combos de otro
  // dueño en los resultados.
  async search(
    term: string,
    currentUser: AuthenticatedUser,
  ): Promise<SearchResultItem[]> {
    const qb = this.combosRepository
      .createQueryBuilder('combo')
      .select(['combo.id', 'combo.nombre'])
      .where('combo.nombre ILIKE :term', { term: `%${term}%` })
      .orderBy('combo.createdAt', 'DESC')
      .limit(5);
    if (currentUser.role === UserRole.REVENDEDOR) {
      qb.andWhere('combo.ownerId = :ownerId', { ownerId: currentUser.id });
    }
    const combos = await qb.getMany();
    return combos.map((c) => ({ id: c.id, label: c.nombre }));
  }

  async update(
    id: string,
    dto: UpdateComboDto,
    currentUser: AuthenticatedUser,
  ): Promise<Combo> {
    const combo = await this.findOneOwned(id, currentUser);
    if (dto.servicioIds) {
      const servicios = await this.resolveServicios(dto.servicioIds);
      // El servicio referenciado tiene que pertenecer al MISMO dueño que el
      // combo ya tiene, sin importar quién esté editando — así el admin
      // puede editar un combo ajeno sin poder "cruzarle" el catálogo de
      // otro revendedor (mismo criterio que AccountsService.update con
      // servicioId/proveedorId).
      this.assertServiciosOwnedBy(servicios, combo.ownerId);
      combo.servicios = servicios;
    }
    if (dto.nombre !== undefined) {
      combo.nombre = dto.nombre;
    }
    if (dto.descripcion !== undefined) {
      combo.descripcion = dto.descripcion;
    }
    if (dto.precioCombo !== undefined) {
      combo.precioCombo = dto.precioCombo;
    }
    if (dto.activo !== undefined) {
      combo.activo = dto.activo;
    }
    // A diferencia del resto (repository.update()), acá se guarda la
    // entidad completa con save(): es la forma en que TypeORM sincroniza
    // la relación many-to-many (combo_servicios) cuando cambia servicios.
    return this.combosRepository.save(combo);
  }

  async softDelete(id: string, currentUser: AuthenticatedUser): Promise<Combo> {
    const combo = await this.findOneOwned(id, currentUser);
    combo.activo = false;
    return this.combosRepository.save(combo);
  }

  async reactivate(id: string, currentUser: AuthenticatedUser): Promise<Combo> {
    const combo = await this.findOneOwned(id, currentUser);
    combo.activo = true;
    return this.combosRepository.save(combo);
  }

  private async resolveServicios(servicioIds: string[]): Promise<Service[]> {
    return Promise.all(
      servicioIds.map((id) => this.servicesService.findOne(id)),
    );
  }

  // Cada Service del many-to-many debe pertenecer al mismo `ownerId` que el
  // Combo — un combo no puede mezclar servicios de dueños distintos. No
  // coincide → 404, misma razón que "recurso ajeno" (mismo criterio que
  // AccountsService.assertReferencesOwnedBy).
  private assertServiciosOwnedBy(servicios: Service[], ownerId: string): void {
    for (const servicio of servicios) {
      if (servicio.ownerId !== ownerId) {
        throw new NotFoundException(`Servicio ${servicio.id} no encontrado`);
      }
    }
  }
}
