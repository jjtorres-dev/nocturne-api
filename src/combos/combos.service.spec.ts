import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { CombosService } from './combos.service.js';
import { Combo } from './entities/combo.entity.js';
import { ServiceType } from '../services/service-type.enum.js';
import type { ServicesService } from '../services/services.service.js';
import { UserRole } from '../users/user-role.enum.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

describe('CombosService', () => {
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

  const servicioNetflix = {
    id: 'srv-1',
    ownerId: revendedorA.id,
    nombre: 'Netflix',
    tipo: ServiceType.SIN_PERFILES,
    duracionMeses: 1,
    pantallasMax: null,
    precioBase: 20,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const servicioDisney = {
    ...servicioNetflix,
    id: 'srv-2',
    nombre: 'Disney+',
  };
  // Mismo catálogo, pero de otro dueño — usado para el caso de mezclar
  // servicios de dueños distintos en un combo.
  const servicioAjeno = {
    ...servicioNetflix,
    id: 'srv-ajeno',
    ownerId: revendedorB.id,
    nombre: 'Crunchyroll (de B)',
  };

  const baseCombo: Combo = {
    id: 'combo-1',
    ownerId: revendedorA.id,
    owner: { id: revendedorA.id, name: revendedorA.name, email: revendedorA.email },
    nombre: 'Combo Netflix + Disney',
    descripcion: null,
    servicios: [servicioNetflix, servicioDisney],
    precioCombo: 30,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Combo;

  const OWNED_SELECT = {
    id: true,
    ownerId: true,
    nombre: true,
    descripcion: true,
    precioCombo: true,
    activo: true,
    createdAt: true,
    updatedAt: true,
    owner: { id: true, name: true, email: true },
  };

  let repo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  let servicesService: { findOne: ReturnType<typeof vi.fn> };
  let combosService: CombosService;

  beforeEach(() => {
    repo = {
      create: vi.fn((dto) => ({ ...dto })),
      save: vi.fn(async (entity) => entity),
      find: vi.fn(),
      findOne: vi.fn(),
    };
    const serviciosById: Record<string, unknown> = {
      'srv-1': servicioNetflix,
      'srv-2': servicioDisney,
      'srv-ajeno': servicioAjeno,
    };
    servicesService = {
      findOne: vi.fn((id: string) => Promise.resolve(serviciosById[id])),
    };
    combosService = new CombosService(
      repo as unknown as Repository<Combo>,
      servicesService as unknown as ServicesService,
    );
  });

  it('crea un combo resolviendo servicioIds a Service completos, con ownerId del usuario autenticado', async () => {
    const result = await combosService.create(
      {
        nombre: 'Combo Netflix + Disney',
        servicioIds: ['srv-1', 'srv-2'],
        precioCombo: 30,
      },
      revendedorA,
    );

    expect(servicesService.findOne).toHaveBeenCalledWith('srv-1');
    expect(servicesService.findOne).toHaveBeenCalledWith('srv-2');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'Combo Netflix + Disney',
        servicios: [servicioNetflix, servicioDisney],
        precioCombo: 30,
        activo: true,
        ownerId: revendedorA.id,
      }),
    );
    expect(result.servicios).toEqual([servicioNetflix, servicioDisney]);
  });

  it('create: mezclar un servicio propio con uno ajeno da NotFoundException, no se crea nada', async () => {
    await expect(
      combosService.create(
        { nombre: 'Combo mixto', servicioIds: ['srv-1', 'srv-ajeno'], precioCombo: 30 },
        revendedorA,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('filtra por activo al listar (sin scope), con la relación servicios cargada', async () => {
    repo.find.mockResolvedValue([baseCombo]);

    await combosService.findAll({ activo: true });

    expect(repo.find).toHaveBeenCalledWith({
      where: { activo: true },
      relations: { servicios: true },
      order: { nombre: 'ASC' },
    });
  });

  it('lanza NotFoundException si el combo no existe (findOne sin scope)', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(combosService.findOne('no-existe')).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('findAllOwned', () => {
    it('un REVENDEDOR queda acotado a su propio ownerId, sin importar el query', async () => {
      repo.find.mockResolvedValue([baseCombo]);

      await combosService.findAllOwned({ activo: true }, revendedorA);

      expect(repo.find).toHaveBeenCalledWith({
        where: { activo: true, ownerId: revendedorA.id },
        relations: { servicios: true, owner: true },
        select: OWNED_SELECT,
        order: { nombre: 'ASC' },
      });
    });

    it('un ADMIN ve todo, sin filtro de ownerId', async () => {
      repo.find.mockResolvedValue([baseCombo]);

      await combosService.findAllOwned({}, admin);

      expect(repo.find).toHaveBeenCalledWith({
        where: {},
        relations: { servicios: true, owner: true },
        select: OWNED_SELECT,
        order: { nombre: 'ASC' },
      });
    });
  });

  describe('findOneOwned', () => {
    it('el dueño puede ver su propio combo, con el owner {id, name, email} poblado', async () => {
      repo.findOne.mockResolvedValue(baseCombo);

      const result = await combosService.findOneOwned(baseCombo.id, revendedorA);

      expect(result).toBe(baseCombo);
      expect(result.owner).toEqual({
        id: revendedorA.id,
        name: revendedorA.name,
        email: revendedorA.email,
      });
    });

    it('otro REVENDEDOR recibe NotFoundException (404, no 403) sobre un combo ajeno', async () => {
      repo.findOne.mockResolvedValue(baseCombo);

      await expect(
        combosService.findOneOwned(baseCombo.id, revendedorB),
      ).rejects.toThrow(NotFoundException);
    });

    it('el ADMIN puede ver el combo de cualquiera', async () => {
      repo.findOne.mockResolvedValue(baseCombo);

      const result = await combosService.findOneOwned(baseCombo.id, admin);

      expect(result).toBe(baseCombo);
    });
  });

  it('update reemplaza servicios solo si viene servicioIds', async () => {
    repo.findOne.mockResolvedValue({ ...baseCombo });

    await combosService.update('combo-1', { precioCombo: 35 }, revendedorA);

    expect(servicesService.findOne).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ precioCombo: 35, servicios: baseCombo.servicios }),
    );
  });

  it('update resuelve y reemplaza servicios cuando viene servicioIds', async () => {
    repo.findOne.mockResolvedValue({ ...baseCombo });

    await combosService.update('combo-1', { servicioIds: ['srv-1'] }, revendedorA);

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ servicios: [servicioNetflix] }),
    );
  });

  it('update: un REVENDEDOR no puede tocar un combo ajeno (404)', async () => {
    repo.findOne.mockResolvedValue(baseCombo);

    await expect(
      combosService.update('combo-1', { precioCombo: 99 }, revendedorB),
    ).rejects.toThrow(NotFoundException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('update: reasignar un servicio ajeno da NotFoundException, sin importar quién edite', async () => {
    repo.findOne.mockResolvedValue({ ...baseCombo });

    // El admin edita un combo de A intentando meterle un servicio de B: el
    // criterio de ownership es el dueño del COMBO (A), no quien edita.
    await expect(
      combosService.update('combo-1', { servicioIds: ['srv-ajeno'] }, admin),
    ).rejects.toThrow(NotFoundException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('softDelete pone activo en false sin borrar el registro', async () => {
    repo.findOne.mockResolvedValue({ ...baseCombo, activo: true });

    const result = await combosService.softDelete('combo-1', revendedorA);

    expect(result.activo).toBe(false);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ activo: false }),
    );
  });

  it('softDelete: un REVENDEDOR no puede desactivar un combo ajeno (404)', async () => {
    repo.findOne.mockResolvedValue(baseCombo);

    await expect(combosService.softDelete('combo-1', revendedorB)).rejects.toThrow(
      NotFoundException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('reactivate pone activo en true', async () => {
    repo.findOne.mockResolvedValue({ ...baseCombo, activo: false });

    const result = await combosService.reactivate('combo-1', revendedorA);

    expect(result.activo).toBe(true);
  });

  it('reactivate: un REVENDEDOR no puede reactivar un combo ajeno (404)', async () => {
    repo.findOne.mockResolvedValue(baseCombo);

    await expect(combosService.reactivate('combo-1', revendedorB)).rejects.toThrow(
      NotFoundException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });
});
