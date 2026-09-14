import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Combo } from './entities/combo.entity.js';
import { CreateComboDto } from './dto/create-combo.dto.js';
import { UpdateComboDto } from './dto/update-combo.dto.js';
import { QueryComboDto } from './dto/query-combo.dto.js';
import { ServicesService } from '../services/services.service.js';
import { Service } from '../services/entities/service.entity.js';

@Injectable()
export class CombosService {
  constructor(
    @InjectRepository(Combo)
    private readonly combosRepository: Repository<Combo>,
    private readonly servicesService: ServicesService,
  ) {}

  async create(dto: CreateComboDto): Promise<Combo> {
    const servicios = await this.resolveServicios(dto.servicioIds);
    const combo = this.combosRepository.create({
      nombre: dto.nombre,
      descripcion: dto.descripcion ?? null,
      precioCombo: dto.precioCombo,
      activo: dto.activo ?? true,
      servicios,
    });
    return this.combosRepository.save(combo);
  }

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

  async update(id: string, dto: UpdateComboDto): Promise<Combo> {
    const combo = await this.findOne(id);
    if (dto.servicioIds) {
      combo.servicios = await this.resolveServicios(dto.servicioIds);
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

  async softDelete(id: string): Promise<Combo> {
    const combo = await this.findOne(id);
    combo.activo = false;
    return this.combosRepository.save(combo);
  }

  async reactivate(id: string): Promise<Combo> {
    const combo = await this.findOne(id);
    combo.activo = true;
    return this.combosRepository.save(combo);
  }

  private async resolveServicios(servicioIds: string[]): Promise<Service[]> {
    return Promise.all(
      servicioIds.map((id) => this.servicesService.findOne(id)),
    );
  }
}
