import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { ServicesService } from './services.service.js';
import { Service } from './entities/service.entity.js';
import { ServiceType } from './service-type.enum.js';

describe('ServicesService', () => {
  const baseService: Service = {
    id: 'service-1',
    nombre: 'Netflix Premium',
    tipo: ServiceType.CON_PERFILES,
    duracionMeses: 1,
    pantallasMax: 4,
    precioBase: 10,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let repo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let servicesService: ServicesService;

  beforeEach(() => {
    repo = {
      create: vi.fn((dto) => ({ ...dto })),
      save: vi.fn(async (entity) => entity),
      update: vi.fn(async () => ({ affected: 1 })),
      findOne: vi.fn(),
      find: vi.fn(),
    };
    servicesService = new ServicesService(repo as unknown as Repository<Service>);
  });

  it('crea un servicio a partir del DTO', async () => {
    const dto = {
      nombre: 'Disney+',
      tipo: ServiceType.FAMILIAR,
      duracionMeses: 2.5,
      precioBase: 8,
    };

    const result = await servicesService.create(dto);

    expect(repo.create).toHaveBeenCalledWith(dto);
    expect(result).toMatchObject(dto);
  });

  it('filtra por tipo y activo al listar', async () => {
    repo.find.mockResolvedValue([baseService]);

    await servicesService.findAll({ tipo: ServiceType.CON_PERFILES, activo: true });

    expect(repo.find).toHaveBeenCalledWith({
      where: { tipo: ServiceType.CON_PERFILES, activo: true },
      order: { nombre: 'ASC' },
    });
  });

  it('lanza NotFoundException si el servicio no existe', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(servicesService.findOne('no-existe')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('update no pisa en la respuesta los campos no incluidos en el PATCH', async () => {
    // Regresión: el DTO que arma el ValidationPipe trae TODAS las
    // propiedades de la clase como propias, con `undefined` en las no
    // enviadas. Un Object.assign(entity, dto) ingenuo pisaría nombre/tipo/
    // pantallasMax/activo con undefined en memoria (la DB queda bien porque
    // TypeORM ignora undefined, pero la respuesta HTTP salía incompleta).
    const dtoConCamposNoEnviadosEnUndefined = {
      nombre: undefined,
      tipo: undefined,
      duracionMeses: undefined,
      pantallasMax: undefined,
      precioBase: 12.75,
      activo: undefined,
    };
    repo.findOne.mockResolvedValue({ ...baseService, precioBase: 12.75 });

    const result = await servicesService.update(
      baseService.id,
      dtoConCamposNoEnviadosEnUndefined,
    );

    expect(repo.update).toHaveBeenCalledWith(
      baseService.id,
      dtoConCamposNoEnviadosEnUndefined,
    );
    expect(result).toMatchObject({
      nombre: baseService.nombre,
      tipo: baseService.tipo,
      pantallasMax: baseService.pantallasMax,
      activo: baseService.activo,
      precioBase: 12.75,
    });
  });

  it('softDelete pone activo en false sin borrar el registro', async () => {
    repo.findOne.mockResolvedValue({ ...baseService, activo: true });

    const result = await servicesService.softDelete(baseService.id);

    expect(result.activo).toBe(false);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ activo: false }),
    );
  });

  it('reactivate pone activo en true', async () => {
    repo.findOne.mockResolvedValue({ ...baseService, activo: false });

    const result = await servicesService.reactivate(baseService.id);

    expect(result.activo).toBe(true);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ activo: true }),
    );
  });

  it('reactivate lanza NotFoundException si el servicio no existe', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(servicesService.reactivate('no-existe')).rejects.toThrow(
      NotFoundException,
    );
  });
});
