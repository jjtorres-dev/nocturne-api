import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import { AccountsService } from './accounts.service.js';
import { Account } from './entities/account.entity.js';
import { Profile } from './profiles/entities/profile.entity.js';
import { AccountPayment } from './entities/account-payment.entity.js';
import { AccountPaymentType } from './account-payment-type.enum.js';
import { Moneda } from '../sales/moneda.enum.js';
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
  let transactionManager: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let dataSource: { transaction: ReturnType<typeof vi.fn> };
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
    // Simula dataSource.transaction(cb): corre el callback con un manager
    // cuyo create/save se comportan igual que los repos de arriba (crea el
    // objeto tal cual, "guarda" devolviéndolo con un id si no tiene).
    transactionManager = {
      create: vi.fn((_entity, data) => ({ ...data })),
      save: vi.fn(async (entityOrArray) => {
        if (Array.isArray(entityOrArray)) {
          return entityOrArray;
        }
        return { id: 'account-nuevo', ...entityOrArray };
      }),
      update: vi.fn(async () => ({ affected: 1 })),
    };
    dataSource = {
      transaction: vi.fn(async (cb) => cb(transactionManager)),
    };
    servicesService = { findOne: vi.fn().mockResolvedValue(service) };
    contactsService = {
      findOne: vi.fn().mockResolvedValue({ id: 'contact-1', ownerId: revendedorA.id }),
    };

    accountsService = new AccountsService(
      accountsRepo as unknown as Repository<Account>,
      profilesRepo as unknown as Repository<Profile>,
      dataSource as unknown as DataSource,
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
      expect(transactionManager.create).toHaveBeenCalledWith(Account, {
        ...dto,
        ownerId: revendedorA.id,
      });
    });

    it('crea la cuenta sin claveServicio si no se envía (proveedor que solo da un código, sin clave)', async () => {
      const dto = {
        servicioId: 'service-1',
        correo: 'a@b.com',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-02-01',
        costo: 10,
        metodoPago: 'transferencia',
      };

      const result = await accountsService.create(dto, revendedorA);

      expect(transactionManager.create).toHaveBeenCalledWith(Account, {
        ...dto,
        ownerId: revendedorA.id,
      });
      expect(result.claveServicio).toBeUndefined();
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

    it('crea la cuenta y su pago COMPRA_INICIAL (PEN, tasa 1, fecha = fechaInicio) en la misma transacción', async () => {
      const dto = {
        servicioId: 'service-1',
        correo: 'a@b.com',
        claveServicio: 'clave',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-02-01',
        costo: 12.5,
        metodoPago: 'transferencia',
      };

      await accountsService.create(dto, revendedorA);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(transactionManager.create).toHaveBeenCalledWith(AccountPayment, {
        cuentaId: 'account-nuevo',
        fecha: '2026-01-01',
        monto: 12.5,
        moneda: Moneda.PEN,
        tasaCambio: 1,
        montoPEN: 12.5,
        metodoPago: 'transferencia',
        tipo: AccountPaymentType.COMPRA_INICIAL,
      });
    });

    it('sin crearPerfiles no crea perfiles', async () => {
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

      expect(transactionManager.create).not.toHaveBeenCalledWith(
        Profile,
        expect.anything(),
      );
    });

    it('con crearPerfiles y el servicio con pantallasMax, crea "Perfil 1".."Perfil N" en la misma transacción que la cuenta', async () => {
      const dto = {
        servicioId: 'service-1',
        correo: 'a@b.com',
        claveServicio: 'clave',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-02-01',
        costo: 10,
        metodoPago: 'transferencia',
        crearPerfiles: true,
      };

      const result = await accountsService.create(dto, revendedorA);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(transactionManager.create).toHaveBeenCalledWith(
        Account,
        expect.objectContaining({ correo: 'a@b.com', ownerId: revendedorA.id }),
      );
      // service.pantallasMax es 4 (ver el fixture `service` de arriba).
      expect(transactionManager.save).toHaveBeenCalledWith([
        expect.objectContaining({ cuentaId: 'account-nuevo', nombre: 'Perfil 1' }),
        expect.objectContaining({ cuentaId: 'account-nuevo', nombre: 'Perfil 2' }),
        expect.objectContaining({ cuentaId: 'account-nuevo', nombre: 'Perfil 3' }),
        expect.objectContaining({ cuentaId: 'account-nuevo', nombre: 'Perfil 4' }),
      ]);
      expect(result.id).toBe('account-nuevo');
    });

    it('con crearPerfiles pero el servicio SIN pantallasMax (SIN_PERFILES), lo ignora en silencio y crea la cuenta sola', async () => {
      servicesService.findOne.mockResolvedValue({ ...service, pantallasMax: null });
      const dto = {
        servicioId: 'service-1',
        correo: 'a@b.com',
        claveServicio: 'clave',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-02-01',
        costo: 10,
        metodoPago: 'transferencia',
        crearPerfiles: true,
      };

      await accountsService.create(dto, revendedorA);

      expect(transactionManager.create).toHaveBeenCalledWith(
        Account,
        expect.objectContaining({ correo: 'a@b.com' }),
      );
      expect(transactionManager.create).not.toHaveBeenCalledWith(
        Profile,
        expect.anything(),
      );
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

    it('si no toca costo/fechaInicio/metodoPago, no abre transacción ni toca el pago de compra', async () => {
      accountsRepo.findOne.mockResolvedValue(baseAccount);

      await accountsService.update(baseAccount.id, { correo: 'nuevo@b.com' }, revendedorA);

      expect(accountsRepo.update).toHaveBeenCalledWith(baseAccount.id, { correo: 'nuevo@b.com' });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('al cambiar el costo, actualiza la cuenta y su pago COMPRA_INICIAL en la misma transacción (lo demás, de la cuenta)', async () => {
      accountsRepo.findOne.mockResolvedValue(baseAccount); // costo 10, 2026-01-01, transferencia

      await accountsService.update(baseAccount.id, { costo: 25 }, revendedorA);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(transactionManager.update).toHaveBeenCalledWith(Account, baseAccount.id, { costo: 25 });
      expect(transactionManager.update).toHaveBeenCalledWith(
        AccountPayment,
        { cuentaId: baseAccount.id, tipo: AccountPaymentType.COMPRA_INICIAL },
        expect.objectContaining({
          monto: 25,
          montoPEN: 25,
          fecha: '2026-01-01',
          metodoPago: 'transferencia',
        }),
      );
      expect(accountsRepo.update).not.toHaveBeenCalled();
    });

    it('al cambiar fechaInicio y metodoPago, el pago de compra toma la nueva fecha y método', async () => {
      accountsRepo.findOne.mockResolvedValue(baseAccount);

      await accountsService.update(
        baseAccount.id,
        { fechaInicio: '2025-12-15', metodoPago: 'Yape' },
        revendedorA,
      );

      expect(transactionManager.update).toHaveBeenCalledWith(
        AccountPayment,
        { cuentaId: baseAccount.id, tipo: AccountPaymentType.COMPRA_INICIAL },
        expect.objectContaining({ monto: 10, fecha: '2025-12-15', metodoPago: 'Yape' }),
      );
    });

    it('si la cuenta no tuviera pago de compra, lo crea en vez de fallar', async () => {
      accountsRepo.findOne.mockResolvedValue(baseAccount);
      transactionManager.update.mockImplementation(async (entity) =>
        entity === AccountPayment ? { affected: 0 } : { affected: 1 },
      );

      await accountsService.update(baseAccount.id, { costo: 30 }, revendedorA);

      expect(transactionManager.create).toHaveBeenCalledWith(
        AccountPayment,
        expect.objectContaining({
          cuentaId: baseAccount.id,
          monto: 30,
          tipo: AccountPaymentType.COMPRA_INICIAL,
        }),
      );
    });
  });

  describe('renewProvider', () => {
    const dto = {
      monto: 5,
      moneda: Moneda.USD,
      tasaCambio: 3.8,
      metodoPago: 'Binance',
      fechaPago: '2026-01-30',
      nuevaFechaFin: '2026-03-01',
    };

    it('crea el pago RENOVACION (montoPEN = monto × tasa) y mueve fechaFin, en una sola transacción', async () => {
      accountsRepo.findOne.mockResolvedValue(baseAccount); // fechaFin 2026-02-01

      await accountsService.renewProvider(baseAccount.id, dto, revendedorA);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(transactionManager.create).toHaveBeenCalledWith(AccountPayment, {
        cuentaId: baseAccount.id,
        fecha: '2026-01-30',
        monto: 5,
        moneda: Moneda.USD,
        tasaCambio: 3.8,
        montoPEN: 19,
        metodoPago: 'Binance',
        tipo: AccountPaymentType.RENOVACION,
      });
      expect(transactionManager.update).toHaveBeenCalledWith(Account, baseAccount.id, {
        fechaFin: '2026-03-01',
      });
    });

    it('sin fechaPago usa hoy, y sin tasaCambio usa 1', async () => {
      accountsRepo.findOne.mockResolvedValue(baseAccount);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-01-31T12:00:00Z'));
      try {
        await accountsService.renewProvider(
          baseAccount.id,
          { monto: 12, moneda: Moneda.PEN, metodoPago: 'Yape', nuevaFechaFin: '2026-03-01' },
          revendedorA,
        );
      } finally {
        vi.useRealTimers();
      }

      expect(transactionManager.create).toHaveBeenCalledWith(
        AccountPayment,
        expect.objectContaining({ fecha: '2026-01-31', tasaCambio: 1, montoPEN: 12 }),
      );
    });

    it.each(['2026-02-01', '2026-01-15'])(
      'da 400 si la nueva fecha (%s) no es posterior a la fechaFin actual, sin escribir nada',
      async (nuevaFechaFin) => {
        accountsRepo.findOne.mockResolvedValue(baseAccount); // fechaFin 2026-02-01

        await expect(
          accountsService.renewProvider(baseAccount.id, { ...dto, nuevaFechaFin }, revendedorA),
        ).rejects.toThrow(BadRequestException);
        expect(dataSource.transaction).not.toHaveBeenCalled();
      },
    );

    it('un REVENDEDOR no puede renovar una cuenta ajena (404)', async () => {
      accountsRepo.findOne.mockResolvedValue(baseAccount); // owner = revendedorA

      await expect(
        accountsService.renewProvider(baseAccount.id, dto, revendedorB),
      ).rejects.toThrow(NotFoundException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
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
