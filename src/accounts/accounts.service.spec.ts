import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { AccountsService } from './accounts.service.js';
import { Account } from './entities/account.entity.js';
import { Profile } from './profiles/entities/profile.entity.js';
import { ServiceType } from '../services/service-type.enum.js';
import type { ServicesService } from '../services/services.service.js';
import type { ContactsService } from '../contacts/contacts.service.js';

describe('AccountsService', () => {
  const baseAccount: Account = {
    id: 'account-1',
    servicioId: 'service-1',
    servicio: undefined as unknown as Account['servicio'],
    proveedorId: null,
    proveedor: null,
    correo: 'cuenta@nocturne.dev',
    claveServicio: 'clave-servicio',
    claveCorreo: null,
    fechaInicio: '2026-01-01',
    fechaFin: '2026-02-01',
    costo: 10,
    metodoPago: 'transferencia',
    url: null,
    renovacionAutomatica: false,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const service = {
    id: 'service-1',
    nombre: 'Netflix',
    tipo: ServiceType.CON_PERFILES,
    duracionMeses: 1,
    pantallasMax: 4,
    precioBase: 10,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let accountsRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let profilesRepo: {
    createQueryBuilder: ReturnType<typeof vi.fn>;
  };
  let queryBuilder: {
    select: ReturnType<typeof vi.fn>;
    addSelect: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    andWhere: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
    getRawMany: ReturnType<typeof vi.fn>;
  };
  let servicesService: { findOne: ReturnType<typeof vi.fn> };
  let contactsService: { findOne: ReturnType<typeof vi.fn> };
  let accountsService: AccountsService;

  beforeEach(() => {
    accountsRepo = {
      create: vi.fn((dto) => ({ ...dto })),
      save: vi.fn(async (entity) => entity),
      update: vi.fn(async () => ({ affected: 1 })),
      findOne: vi.fn(),
      find: vi.fn(),
    };
    queryBuilder = {
      select: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      getRawMany: vi.fn().mockResolvedValue([]),
    };
    profilesRepo = {
      createQueryBuilder: vi.fn(() => queryBuilder),
    };
    servicesService = { findOne: vi.fn().mockResolvedValue(service) };
    contactsService = { findOne: vi.fn().mockResolvedValue({ id: 'contact-1' }) };

    accountsService = new AccountsService(
      accountsRepo as unknown as Repository<Account>,
      profilesRepo as unknown as Repository<Profile>,
      servicesService as unknown as ServicesService,
      contactsService as unknown as ContactsService,
    );
  });

  describe('create', () => {
    it('valida que el servicio exista antes de crear', async () => {
      const dto = {
        servicioId: 'service-1',
        correo: 'a@b.com',
        claveServicio: 'clave',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-02-01',
        costo: 10,
        metodoPago: 'transferencia',
      };

      await accountsService.create(dto);

      expect(servicesService.findOne).toHaveBeenCalledWith('service-1');
      expect(contactsService.findOne).not.toHaveBeenCalled();
      expect(accountsRepo.create).toHaveBeenCalledWith(dto);
    });

    it('valida también el proveedor si se envía', async () => {
      const dto = {
        servicioId: 'service-1',
        proveedorId: 'contact-1',
        correo: 'a@b.com',
        claveServicio: 'clave',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-02-01',
        costo: 10,
        metodoPago: 'transferencia',
      };

      await accountsService.create(dto);

      expect(contactsService.findOne).toHaveBeenCalledWith('contact-1');
    });

    it('propaga el 404 si el servicio no existe', async () => {
      servicesService.findOne.mockRejectedValue(
        new NotFoundException('no existe'),
      );

      await expect(
        accountsService.create({
          servicioId: 'no-existe',
          correo: 'a@b.com',
          claveServicio: 'clave',
          fechaInicio: '2026-01-01',
          fechaFin: '2026-02-01',
          costo: 10,
          metodoPago: 'transferencia',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(accountsRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('nunca selecciona claveServicio ni claveCorreo', async () => {
      accountsRepo.find.mockResolvedValue([]);

      await accountsService.findAll({});

      const callArgs = accountsRepo.find.mock.calls[0][0];
      expect(callArgs.select).not.toHaveProperty('claveServicio');
      expect(callArgs.select).not.toHaveProperty('claveCorreo');
    });

    it('agrega perfilesCount desde el conteo de perfiles activos', async () => {
      accountsRepo.find.mockResolvedValue([{ ...baseAccount }]);
      queryBuilder.getRawMany.mockResolvedValue([
        { cuentaId: 'account-1', count: '3' },
      ]);

      const result = await accountsService.findAll({});

      expect(result[0].perfilesCount).toBe(3);
    });

    it('cuentas sin perfiles quedan en 0', async () => {
      accountsRepo.find.mockResolvedValue([{ ...baseAccount }]);
      queryBuilder.getRawMany.mockResolvedValue([]);

      const result = await accountsService.findAll({});

      expect(result[0].perfilesCount).toBe(0);
    });

    it('filtra por servicioId/proveedorId/activo', async () => {
      accountsRepo.find.mockResolvedValue([]);

      await accountsService.findAll({
        servicioId: 'service-1',
        proveedorId: 'contact-1',
        activo: true,
      });

      expect(accountsRepo.find.mock.calls[0][0].where).toEqual({
        servicioId: 'service-1',
        proveedorId: 'contact-1',
        activo: true,
      });
    });
  });

  it('findOne lanza NotFoundException si no existe', async () => {
    accountsRepo.findOne.mockResolvedValue(null);

    await expect(accountsService.findOne('no-existe')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('softDelete pone activo en false', async () => {
    accountsRepo.findOne.mockResolvedValue({ ...baseAccount, activo: true });

    const result = await accountsService.softDelete(baseAccount.id);

    expect(result.activo).toBe(false);
  });

  it('reactivate pone activo en true', async () => {
    accountsRepo.findOne.mockResolvedValue({ ...baseAccount, activo: false });

    const result = await accountsService.reactivate(baseAccount.id);

    expect(result.activo).toBe(true);
  });
});
