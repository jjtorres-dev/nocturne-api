import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service } from './entities/service.entity.js';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';
import { QueryServiceDto } from './dto/query-service.dto.js';

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service)
    private readonly servicesRepository: Repository<Service>,
  ) {}

  create(dto: CreateServiceDto): Promise<Service> {
    const service = this.servicesRepository.create(dto);
    return this.servicesRepository.save(service);
  }

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

  async update(id: string, dto: UpdateServiceDto): Promise<Service> {
    // No usar Object.assign(entity, dto): el dto que arma el ValidationPipe
    // trae como propiedades propias TODOS los campos declarados en la clase
    // (los no enviados quedan en `undefined`), y Object.assign pisaría en
    // memoria los valores ya cargados de la entidad. repository.update()
    // ignora las propiedades undefined al armar el UPDATE, así que solo
    // toca las columnas que realmente vinieron en el body.
    await this.findOne(id);
    await this.servicesRepository.update(id, dto);
    return this.findOne(id);
  }

  async softDelete(id: string): Promise<Service> {
    const service = await this.findOne(id);
    service.activo = false;
    return this.servicesRepository.save(service);
  }
}
