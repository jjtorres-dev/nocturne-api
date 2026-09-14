import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { CombosService } from './combos.service.js';
import { Combo } from './entities/combo.entity.js';
import { ServiceType } from '../services/service-type.enum.js';
import type { ServicesService } from '../services/services.service.js';

describe('CombosService', () => {
  const servicioNetflix = {
    id: 'srv-1',
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

  const baseCombo: Combo = {
    id: 'combo-1',
    nombre: 'Combo Netflix + Disney',
    descripcion: null,
    servicios: [servicioNetflix, servicioDisney],
    precioCombo: 30,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
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
    servicesService = {
      findOne: vi.fn((id: string) =>
        Promise.resolve(id === 'srv-1' ? servicioNetflix : servicioDisney),
      ),
    };
    combosService = new CombosService(
      repo as unknown as Repository<Combo>,
      servicesService as unknown as ServicesService,
    );
  });

  it('crea un combo resolviendo servicioIds a Service completos', async () => {
    const result = await combosService.create({
      nombre: 'Combo Netflix + Disney',
      servicioIds: ['srv-1', 'srv-2'],
      precioCombo: 30,
    });

    expect(servicesService.findOne).toHaveBeenCalledWith('srv-1');
    expect(servicesService.findOne).toHaveBeenCalledWith('srv-2');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'Combo Netflix + Disney',
        servicios: [servicioNetflix, servicioDisney],
        precioCombo: 30,
        activo: true,
      }),
    );
    expect(result.servicios).toEqual([servicioNetflix, servicioDisney]);
  });

  it('filtra por activo al listar, con la relación servicios cargada', async () => {
    repo.find.mockResolvedValue([baseCombo]);

    await combosService.findAll({ activo: true });

    expect(repo.find).toHaveBeenCalledWith({
      where: { activo: true },
      relations: { servicios: true },
      order: { nombre: 'ASC' },
    });
  });

  it('lanza NotFoundException si el combo no existe', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(combosService.findOne('no-existe')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('update reemplaza servicios solo si viene servicioIds', async () => {
    repo.findOne.mockResolvedValue({ ...baseCombo });

    await combosService.update('combo-1', { precioCombo: 35 });

    expect(servicesService.findOne).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ precioCombo: 35, servicios: baseCombo.servicios }),
    );
  });

  it('update resuelve y reemplaza servicios cuando viene servicioIds', async () => {
    repo.findOne.mockResolvedValue({ ...baseCombo });

    await combosService.update('combo-1', { servicioIds: ['srv-1'] });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ servicios: [servicioNetflix] }),
    );
  });

  it('softDelete pone activo en false sin borrar el registro', async () => {
    repo.findOne.mockResolvedValue({ ...baseCombo, activo: true });

    const result = await combosService.softDelete('combo-1');

    expect(result.activo).toBe(false);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ activo: false }),
    );
  });

  it('reactivate pone activo en true', async () => {
    repo.findOne.mockResolvedValue({ ...baseCombo, activo: false });

    const result = await combosService.reactivate('combo-1');

    expect(result.activo).toBe(true);
  });
});
