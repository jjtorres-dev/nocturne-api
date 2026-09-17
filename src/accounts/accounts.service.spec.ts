import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { AccountsService } from './accounts.service.js';
import { Account } from './entities/account.entity.js';
import { Profile } from './profiles/entities/profile.entity.js';
import { ServiceType } from '../services/service-type.enum.js';
import type { ServicesService } from '../services/services.service.js';
import type { ContactsService } from '../contacts/contacts.service.js';
import { UserRole } from '../users/user-role.enum.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

describe('AccountsService', () => {
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

  const baseAccount: Account = {
    id: 'account-1',
    ownerId: revendedorA.id,
    owner: { id: revendedorA.id, name: revendedorA.name, email: revendedorA.email },
    servicioId: 'service-1',
    servicio: undefined as unknown as Account['servicio'],
    proveedorId: null,
    proveedor: null,
    clienteId: null,
    cliente: null,
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
  } as Account;

  const service = {
    id: 'service-1',
    ownerId: revendedorA.id,
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
    contactsService = {
      findOne: vi.fn().mockResolvedValue({ id: 'contact-1', ownerId: revendedorA.id }),
    };

    accountsService = new AccountsService(
      accountsRepo as unknown as Repository<Account>,
      profilesRepo as unknown as Repository<Profile>,
      servicesService as unknown as ServicesService,
      contactsService as unknown as ContactsService,
    );
  });

  describe('create', () => {
    it('crea la cuenta con ownerId del usuario autenticado si el servicio referenciado es suyo', async () => {
      const dto = {
        servicioId: 'service-1',
        correo: 'a@b.com',
        claveServicio: 'clave',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-02-01',
        costo: 10,
        metodoPago: 'transferencia',
      };

      await accountsService.create(dto, revendedorA);

      expect(servicesService.findOne).toHaveBeenCalledWith('service-1');
      expect(contactsService.findOne).not.toHaveBeenCalled();
      expect(accountsRepo.create).toHaveBeenCalledWith({
        ...dto,
        ownerId: revendedorA.id,
      });
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

      await accountsService.create(dto, revendedorA);

      expect(contactsService.findOne).toHaveBeenCalledWith('contact-1');
    });

    it('propaga el 404 si el servicio no existe', async () => {
      servicesService.findOne.mockRejectedValue(
        new NotFoundException('no existe'),
      );

      await expect(
        accountsService.create(
          {
            servicioId: 'no-existe',
            correo: 'a@b.com',
            claveServicio: 'clave',
            fechaInicio: '2026-01-01',
            fechaFin: '2026-02-01',
            costo: 10,
            metodoPago: 'transferencia',
          },
          revendedorA,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(accountsRepo.create).not.toHaveBeenCalled();
    });

    it('da 404 si el servicio referenciado es de otro dueño (no del usuario que crea la cuenta)', async () => {
      servicesService.findOne.mockResolvedValue({ ...service, ownerId: revendedorB.id });

      await expect(
        accountsService.create(
          {
            servicioId: 'service-1',
            correo: 'a@b.com',
            claveServicio: 'clave',
            fechaInicio: '2026-01-01',
            fechaFin: '2026-02-01',
            costo: 10,
            metodoPago: 'transferencia',
          },
          revendedorA,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(accountsRepo.create).not.toHaveBeenCalled();
    });

    it('da 404 si el proveedor referenciado es de otro dueño', async () => {
      contactsService.findOne.mockResolvedValue({ id: 'contact-1', ownerId: revendedorB.id });

      await expect(
        accountsService.create(
          {
            servicioId: 'service-1',
            proveedorId: 'contact-1',
            correo: 'a@b.com',
            claveServicio: 'clave',
            fechaInicio: '2026-01-01',
            fechaFin: '2026-02-01',
            costo: 10,
            metodoPago: 'transferencia',
          },
          revendedorA,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(accountsRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll (sin scope, uso interno)', () => {
    it('nunca selecciona claveServicio ni claveCorreo, ni pide el owner', async () => {
      accountsRepo.find.mockResolvedValue([]);

      await accountsService.findAll({});

      const callArgs = accountsRepo.find.mock.calls[0][0];
      expect(callArgs.select).not.toHaveProperty('claveServicio');
      expect(callArgs.select).not.toHaveProperty('claveCorreo');
      expect(callArgs.select).not.toHaveProperty('owner');
      expect(callArgs.relations).toBeUndefined();
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

  describe('findAllOwned', () => {
    it('un REVENDEDOR queda acotado a su propio ownerId', async () => {
      accountsRepo.find.mockResolvedValue([]);

      await accountsService.findAllOwned({}, revendedorA);

      expect(accountsRepo.find.mock.calls[0][0].where).toEqual({
        ownerId: revendedorA.id,
      });
      expect(accountsRepo.find.mock.calls[0][0].relations).toEqual({ owner: true });
    });

    it('un ADMIN ve todo, sin filtro de ownerId', async () => {
      accountsRepo.find.mockResolvedValue([]);

      await accountsService.findAllOwned({}, admin);

      expect(accountsRepo.find.mock.calls[0][0].where).toEqual({});
    });

    it('agrega perfilesCount desde el conteo de perfiles activos, y siempre incluye owner', async () => {
      accountsRepo.find.mockResolvedValue([{ ...baseAccount }]);
      queryBuilder.getRawMany.mockResolvedValue([
        { cuentaId: 'account-1', count: '3' },
      ]);

      const result = await accountsService.findAllOwned({}, admin);

      expect(result[0].perfilesCount).toBe(3);
      expect(result[0].owner).toEqual(baseAccount.owner);
    });

    it('cuentas sin perfiles quedan en 0', async () => {
      accountsRepo.find.mockResolvedValue([{ ...baseAccount }]);
      queryBuilder.getRawMany.mockResolvedValue([]);

      const result = await accountsService.findAllOwned({}, admin);

      expect(result[0].perfilesCount).toBe(0);
    });
  });

  describe('findOneOwned', () => {
    it('el dueño puede ver su propia cuenta, con owner y credenciales', async () => {
      accountsRepo.findOne.mockResolvedValue(baseAccount);

      const result = await accountsService.findOneOwned(baseAccount.id, revendedorA);

      expect(result).toBe(baseAccount);
      expect(result.owner).toEqual(baseAccount.owner);
      expect(result.claveServicio).toBe('clave-servicio');
      expect(accountsRepo.findOne.mock.calls[0][0].select).toHaveProperty('claveServicio');
    });

    it('otro REVENDEDOR recibe NotFoundException (404, no 403) sobre una cuenta ajena', async () => {
      accountsRepo.findOne.mockResolvedValue(baseAccount);

      await expect(
        accountsService.findOneOwned(baseAccount.id, revendedorB),
      ).rejects.toThrow(NotFoundException);
    });

    it('el ADMIN puede ver la cuenta de cualquiera', async () => {
      accountsRepo.findOne.mockResolvedValue(baseAccount);

      const result = await accountsService.findOneOwned(baseAccount.id, admin);

      expect(result).toBe(baseAccount);
    });

    it('lanza NotFoundException si la cuenta no existe', async () => {
      accountsRepo.findOne.mockResolvedValue(null);

      await expect(
        accountsService.findOneOwned('no-existe', admin),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('un REVENDEDOR no puede tocar una cuenta ajena (404)', async () => {
      accountsRepo.findOne.mockResolvedValue(baseAccount);

      await expect(
        accountsService.update(baseAccount.id, { costo: 99 }, revendedorB),
      ).rejects.toThrow(NotFoundException);
      expect(accountsRepo.update).not.toHaveBeenCalled();
    });

    it('el servicio nuevo debe pertenecer al dueño que la cuenta YA tiene, sin importar quién edite', async () => {
      accountsRepo.findOne.mockResolvedValue(baseAccount); // owner = revendedorA
      servicesService.findOne.mockResolvedValue({ ...service, ownerId: revendedorA.id });

      // El admin edita una cuenta de A, poniéndole un servicio también de A: OK.
      await expect(
        accountsService.update(baseAccount.id, { servicioId: 'service-1' }, admin),
      ).resolves.toBeDefined();
      expect(accountsRepo.update).toHaveBeenCalled();
    });

    it('404 si el admin intenta ponerle a la cuenta de A un servicio que es de B', async () => {
      accountsRepo.findOne.mockResolvedValue(baseAccount); // owner = revendedorA
      servicesService.findOne.mockResolvedValue({ ...service, ownerId: revendedorB.id });

      await expect(
        accountsService.update(baseAccount.id, { servicioId: 'service-1' }, admin),
      ).rejects.toThrow(NotFoundException);
      expect(accountsRepo.update).not.toHaveBeenCalled();
    });
  });

  it('softDelete pone activo en false', async () => {
    accountsRepo.findOne.mockResolvedValue({ ...baseAccount, activo: true });

    const result = await accountsService.softDelete(baseAccount.id, revendedorA);

    expect(result.activo).toBe(false);
  });

  it('softDelete: un REVENDEDOR no puede desactivar una cuenta ajena (404)', async () => {
    accountsRepo.findOne.mockResolvedValue(baseAccount);

    await expect(
      accountsService.softDelete(baseAccount.id, revendedorB),
    ).rejects.toThrow(NotFoundException);
  });

  it('reactivate pone activo en true', async () => {
    accountsRepo.findOne.mockResolvedValue({ ...baseAccount, activo: false });

    const result = await accountsService.reactivate(baseAccount.id, revendedorA);

    expect(result.activo).toBe(true);
  });

  it('reactivate: un REVENDEDOR no puede reactivar una cuenta ajena (404)', async () => {
    accountsRepo.findOne.mockResolvedValue(baseAccount);

    await expect(
      accountsService.reactivate(baseAccount.id, revendedorB),
    ).rejects.toThrow(NotFoundException);
  });
});
