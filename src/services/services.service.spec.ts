import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { ServicesService } from './services.service.js';
import { Service } from './entities/service.entity.js';
import { ServiceType } from './service-type.enum.js';
import { UserRole } from '../users/user-role.enum.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

describe('ServicesService', () => {
  const admin: AuthenticatedUser = {
    id: 'admin-1',
    email: 'admin@nocturne.dev',
    name: 'Admin',
    role: UserRole.ADMIN,
  };
  const revendedorA: AuthenticatedUser = {
    id: 'revendedor-a',
    email: 'a@nocturne.dev',
    name: 'Revendedor A',
    role: UserRole.REVENDEDOR,
  };
  const revendedorB: AuthenticatedUser = {
    id: 'revendedor-b',
    email: 'b@nocturne.dev',
    name: 'Revendedor B',
    role: UserRole.REVENDEDOR,
  };

  const baseService: Service = {
    id: 'service-1',
    ownerId: revendedorA.id,
    owner: { id: revendedorA.id, name: revendedorA.name, email: revendedorA.email },
    nombre: 'Netflix Premium',
    tipo: ServiceType.CON_PERFILES,
    duracionMeses: 1,
    pantallasMax: 4,
    precioBase: 10,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Service;

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
    owner: { id: true, name: true, email: true },
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

  it('crea un servicio a partir del DTO, con ownerId del usuario autenticado (no del body)', async () => {
    const dto = {
      nombre: 'Disney+',
      tipo: ServiceType.FAMILIAR,
      duracionMeses: 2.5,
      precioBase: 8,
    };

    const result = await servicesService.create(dto, revendedorA);

    expect(repo.create).toHaveBeenCalledWith({ ...dto, ownerId: revendedorA.id });
    expect(result).toMatchObject({ ...dto, ownerId: revendedorA.id });
  });

  describe('findAllOwned', () => {
    it('un REVENDEDOR queda acotado a su propio ownerId, sin importar el query', async () => {
      repo.find.mockResolvedValue([baseService]);

      await servicesService.findAllOwned(
        { tipo: ServiceType.CON_PERFILES, activo: true },
        revendedorA,
      );

      expect(repo.find).toHaveBeenCalledWith({
        where: { tipo: ServiceType.CON_PERFILES, activo: true, ownerId: revendedorA.id },
        relations: { owner: true },
        select: OWNED_SELECT,
        order: { nombre: 'ASC' },
      });
    });

    it('un ADMIN ve todo, sin filtro de ownerId', async () => {
      repo.find.mockResolvedValue([baseService]);

      await servicesService.findAllOwned({}, admin);

      expect(repo.find).toHaveBeenCalledWith({
        where: {},
        relations: { owner: true },
        select: OWNED_SELECT,
        order: { nombre: 'ASC' },
      });
    });

    it('siempre incluye el owner {id, name, email}, para admin y para revendedor por igual', async () => {
      repo.find.mockResolvedValue([baseService]);

      const [resultAdmin] = await servicesService.findAllOwned({}, admin);
      const [resultRevendedor] = await servicesService.findAllOwned({}, revendedorA);

      expect(resultAdmin.owner).toEqual({
        id: revendedorA.id,
        name: revendedorA.name,
        email: revendedorA.email,
      });
      expect(resultRevendedor.owner).toEqual(resultAdmin.owner);
    });
  });

  describe('findOneOwned', () => {
    it('el dueño puede ver su propio servicio, con el owner {id, name, email} poblado', async () => {
      repo.findOne.mockResolvedValue(baseService);

      const result = await servicesService.findOneOwned(baseService.id, revendedorA);

      expect(result).toBe(baseService);
      expect(result.owner).toEqual({
        id: revendedorA.id,
        name: revendedorA.name,
        email: revendedorA.email,
      });
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: baseService.id },
        relations: { owner: true },
        select: OWNED_SELECT,
      });
    });

    it('otro REVENDEDOR recibe NotFoundException (404, no 403) sobre un servicio ajeno', async () => {
      repo.findOne.mockResolvedValue(baseService);

      await expect(
        servicesService.findOneOwned(baseService.id, revendedorB),
      ).rejects.toThrow(NotFoundException);
    });

    it('el ADMIN puede ver el servicio de cualquiera, con el mismo owner poblado que ve el dueño', async () => {
      repo.findOne.mockResolvedValue(baseService);

      const result = await servicesService.findOneOwned(baseService.id, admin);

      expect(result).toBe(baseService);
      expect(result.owner).toEqual({
        id: revendedorA.id,
        name: revendedorA.name,
        email: revendedorA.email,
      });
    });

    it('lanza NotFoundException si el servicio no existe', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(servicesService.findOneOwned('no-existe', admin)).rejects.toThrow(
        NotFoundException,
      );
    });
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
      revendedorA,
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

  it('update: un REVENDEDOR no puede tocar un servicio ajeno (404)', async () => {
    repo.findOne.mockResolvedValue(baseService);

    await expect(
      servicesService.update(baseService.id, { precioBase: 99 }, revendedorB),
    ).rejects.toThrow(NotFoundException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('softDelete pone activo en false sin borrar el registro', async () => {
    repo.findOne.mockResolvedValue({ ...baseService, activo: true });

    const result = await servicesService.softDelete(baseService.id, revendedorA);

    expect(result.activo).toBe(false);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ activo: false }),
    );
  });

  it('softDelete: un REVENDEDOR no puede desactivar un servicio ajeno (404)', async () => {
    repo.findOne.mockResolvedValue(baseService);

    await expect(servicesService.softDelete(baseService.id, revendedorB)).rejects.toThrow(
      NotFoundException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('reactivate pone activo en true', async () => {
    repo.findOne.mockResolvedValue({ ...baseService, activo: false });

    const result = await servicesService.reactivate(baseService.id, revendedorA);

    expect(result.activo).toBe(true);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ activo: true }),
    );
  });

  it('reactivate: un REVENDEDOR no puede reactivar un servicio ajeno (404)', async () => {
    repo.findOne.mockResolvedValue(baseService);

    await expect(servicesService.reactivate(baseService.id, revendedorB)).rejects.toThrow(
      NotFoundException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('reactivate lanza NotFoundException si el servicio no existe', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(servicesService.reactivate('no-existe', admin)).rejects.toThrow(
      NotFoundException,
    );
  });
});
