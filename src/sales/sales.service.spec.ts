import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Repository } from 'typeorm';
import { SalesService } from './sales.service.js';
import { Sale } from './entities/sale.entity.js';
import { Moneda } from './moneda.enum.js';
import { VencimientoFiltro } from './vencimiento.enum.js';
import { ServiceType } from '../services/service-type.enum.js';
import type { AccountsService } from '../accounts/accounts.service.js';
import type { ProfilesService } from '../accounts/profiles/profiles.service.js';
import type { ServicesService } from '../services/services.service.js';
import type { ContactsService } from '../contacts/contacts.service.js';
import type { PaymentsService } from '../payments/payments.service.js';
import { PaymentType } from '../payments/payment-type.enum.js';
import { UserRole } from '../users/user-role.enum.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

describe('SalesService', () => {
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

  const baseSale: Sale = {
    id: 'sale-1',
    ownerId: revendedorA.id,
    owner: { id: revendedorA.id, name: revendedorA.name, email: revendedorA.email },
    clienteId: 'contact-1',
    cliente: undefined as unknown as Sale['cliente'],
    cuentaId: 'account-1',
    cuenta: undefined as unknown as Sale['cuenta'],
    perfilId: 'profile-1',
    perfil: undefined as unknown as Sale['perfil'],
    servicioId: 'service-1',
    servicio: undefined as unknown as Sale['servicio'],
    codigoVenta: 'V-00001',
    duracionMeses: 1,
    fechaInicio: '2026-01-05',
    fechaFin: '2026-02-05',
    precio: 10,
    moneda: Moneda.PEN,
    tasaCambio: 1,
    precioPEN: 10,
    metodoPago: 'Yape',
    renovacionAutomatica: false,
    activo: true,
    ventaComboId: null,
    ventaCombo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Sale;

  const cuenta = { id: 'account-1', ownerId: revendedorA.id, servicioId: 'service-1' };

  const servicioConPerfiles = {
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

  const servicioSinPerfiles = {
    ...servicioConPerfiles,
    tipo: ServiceType.SIN_PERFILES,
  };

  const perfil = {
    id: 'profile-1',
    cuentaId: 'account-1',
    nombre: 'Perfil 1',
    pin: null,
    clienteId: null,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createDto = {
    clienteId: 'contact-1',
    cuentaId: 'account-1',
    perfilId: 'profile-1',
    fechaInicio: '2026-01-05',
    fechaFin: '2026-02-05',
    precio: 10,
    moneda: Moneda.PEN,
    metodoPago: 'Yape',
  };

  let salesRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    createQueryBuilder: ReturnType<typeof vi.fn>;
    manager: { query: ReturnType<typeof vi.fn> };
  };
  let queryBuilder: {
    where: ReturnType<typeof vi.fn>;
    andWhere: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
    leftJoin: ReturnType<typeof vi.fn>;
    addSelect: ReturnType<typeof vi.fn>;
    getMany: ReturnType<typeof vi.fn>;
    getCount: ReturnType<typeof vi.fn>;
  };
  let accountsService: {
    findOne: ReturnType<typeof vi.fn>;
    assignCliente: ReturnType<typeof vi.fn>;
  };
  let profilesService: {
    findOne: ReturnType<typeof vi.fn>;
    assignCliente: ReturnType<typeof vi.fn>;
  };
  let servicesService: { findOne: ReturnType<typeof vi.fn> };
  let contactsService: { findOne: ReturnType<typeof vi.fn> };
  let paymentsService: { create: ReturnType<typeof vi.fn> };
  let salesService: SalesService;

  beforeEach(() => {
    queryBuilder = {
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue([]),
      getCount: vi.fn().mockResolvedValue(0),
    };
    salesRepo = {
      create: vi.fn((dto) => ({ ...dto })),
      save: vi.fn(async (entity) => entity),
      update: vi.fn(async () => ({ affected: 1 })),
      findOne: vi.fn(),
      find: vi.fn(),
      query: vi.fn().mockResolvedValue([{ nextval: '1' }]),
      createQueryBuilder: vi.fn(() => queryBuilder),
      manager: { query: vi.fn().mockResolvedValue([{ nextval: '1' }]) },
    };
    accountsService = {
      findOne: vi.fn().mockResolvedValue(cuenta),
      assignCliente: vi.fn().mockResolvedValue(undefined),
    };
    profilesService = {
      findOne: vi.fn().mockResolvedValue(perfil),
      assignCliente: vi.fn().mockResolvedValue(undefined),
    };
    servicesService = { findOne: vi.fn().mockResolvedValue(servicioConPerfiles) };
    contactsService = {
      findOne: vi.fn().mockResolvedValue({ id: 'contact-1', ownerId: revendedorA.id }),
    };
    paymentsService = { create: vi.fn().mockResolvedValue(undefined) };

    salesService = new SalesService(
      salesRepo as unknown as Repository<Sale>,
      accountsService as unknown as AccountsService,
      profilesService as unknown as ProfilesService,
      servicesService as unknown as ServicesService,
      contactsService as unknown as ContactsService,
      paymentsService as unknown as PaymentsService,
    );
  });

  describe('create', () => {
    it('exige perfilId si el servicio es CON_PERFILES', async () => {
      await expect(
        salesService.create({ ...createDto, perfilId: undefined }, revendedorA),
      ).rejects.toThrow(BadRequestException);
      expect(salesRepo.create).not.toHaveBeenCalled();
    });

    it('exige perfilId si el servicio es FAMILIAR', async () => {
      servicesService.findOne.mockResolvedValue({
        ...servicioConPerfiles,
        tipo: ServiceType.FAMILIAR,
      });

      await expect(
        salesService.create({ ...createDto, perfilId: undefined }, revendedorA),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza perfilId si el servicio es SIN_PERFILES', async () => {
      servicesService.findOne.mockResolvedValue(servicioSinPerfiles);

      await expect(salesService.create(createDto, revendedorA)).rejects.toThrow(
        BadRequestException,
      );
      expect(salesRepo.create).not.toHaveBeenCalled();
    });

    it('rechaza perfilId si el servicio es IPTV', async () => {
      servicesService.findOne.mockResolvedValue({
        ...servicioConPerfiles,
        tipo: ServiceType.IPTV,
      });

      await expect(salesService.create(createDto, revendedorA)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('409 si el perfil ya tiene una venta activa', async () => {
      salesRepo.findOne.mockResolvedValue({ ...baseSale, codigoVenta: 'V-00002' });

      await expect(salesService.create(createDto, revendedorA)).rejects.toThrow(
        ConflictException,
      );
      expect(salesRepo.create).not.toHaveBeenCalled();
    });

    it('409 si la cuenta ya tiene una venta activa (servicio sin perfiles)', async () => {
      servicesService.findOne.mockResolvedValue(servicioSinPerfiles);
      salesRepo.findOne.mockResolvedValue({
        ...baseSale,
        perfilId: null,
        codigoVenta: 'V-00002',
      });

      await expect(
        salesService.create({ ...createDto, perfilId: undefined }, revendedorA),
      ).rejects.toThrow(ConflictException);
    });

    it('genera codigoVenta desde la secuencia con formato V-00001', async () => {
      salesRepo.manager.query.mockResolvedValue([{ nextval: '7' }]);

      await salesService.create(createDto, revendedorA);

      expect(salesRepo.manager.query).toHaveBeenCalledWith(
        "SELECT nextval('sales_codigo_venta_seq') AS nextval",
      );
      expect(salesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ codigoVenta: 'V-00007' }),
      );
    });

    it('calcula precioPEN = precio * tasaCambio', async () => {
      await salesService.create(
        { ...createDto, precio: 10, tasaCambio: 3.5 },
        revendedorA,
      );

      expect(salesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ precioPEN: 35, tasaCambio: 3.5 }),
      );
    });

    it('usa tasaCambio=1 por defecto si no se envía', async () => {
      await salesService.create(createDto, revendedorA);

      expect(salesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ precioPEN: 10, tasaCambio: 1 }),
      );
    });

    it('guarda ownerId del usuario autenticado (no del body)', async () => {
      await salesService.create(createDto, revendedorA);

      expect(salesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: revendedorA.id }),
      );
    });

    it('sincroniza clienteId en el perfil al crear con perfilId', async () => {
      await salesService.create(createDto, revendedorA);

      expect(profilesService.assignCliente).toHaveBeenCalledWith(
        'account-1',
        'profile-1',
        'contact-1',
      );
      expect(accountsService.assignCliente).not.toHaveBeenCalled();
    });

    it('sincroniza clienteId en la cuenta al crear sin perfilId', async () => {
      servicesService.findOne.mockResolvedValue(servicioSinPerfiles);

      await salesService.create(
        { ...createDto, perfilId: undefined },
        revendedorA,
      );

      expect(accountsService.assignCliente).toHaveBeenCalledWith(
        'account-1',
        'contact-1',
      );
      expect(profilesService.assignCliente).not.toHaveBeenCalled();
    });

    it('crea el Pago inicial (tipo=venta_inicial) con los datos de precio de la venta', async () => {
      salesRepo.save.mockImplementationOnce(async (entity) => ({
        ...entity,
        id: 'sale-1',
      }));

      await salesService.create(
        { ...createDto, precio: 10, tasaCambio: 3.5 },
        revendedorA,
      );

      expect(paymentsService.create).toHaveBeenCalledWith({
        ventaId: 'sale-1',
        monto: 10,
        moneda: Moneda.PEN,
        tasaCambio: 3.5,
        metodoPago: 'Yape',
        fecha: '2026-01-05',
        tipo: PaymentType.VENTA_INICIAL,
      });
    });

    describe('assertReferencesOwnedBy — las 4 referencias', () => {
      it('404 si el clienteId (Contacto) es de otro dueño', async () => {
        contactsService.findOne.mockResolvedValue({
          id: 'contact-1',
          ownerId: revendedorB.id,
        });

        await expect(salesService.create(createDto, revendedorA)).rejects.toThrow(
          NotFoundException,
        );
        expect(salesRepo.create).not.toHaveBeenCalled();
      });

      it('404 si la cuentaId es de otro dueño', async () => {
        accountsService.findOne.mockResolvedValue({ ...cuenta, ownerId: revendedorB.id });

        await expect(salesService.create(createDto, revendedorA)).rejects.toThrow(
          NotFoundException,
        );
        expect(salesRepo.create).not.toHaveBeenCalled();
      });

      it('404 si el servicioId derivado de la cuenta es de otro dueño (defensivo: no debería pasar en la práctica gracias al invariante de Fase B3, pero el código lo valida igual)', async () => {
        servicesService.findOne.mockResolvedValue({
          ...servicioConPerfiles,
          ownerId: revendedorB.id,
        });

        await expect(salesService.create(createDto, revendedorA)).rejects.toThrow(
          NotFoundException,
        );
        expect(salesRepo.create).not.toHaveBeenCalled();
      });

      it('404 si el perfilId no pertenece a la cuenta indicada (perfil de otra cuenta/dueño)', async () => {
        profilesService.findOne.mockRejectedValue(new NotFoundException());

        await expect(salesService.create(createDto, revendedorA)).rejects.toThrow(
          NotFoundException,
        );
        expect(salesRepo.create).not.toHaveBeenCalled();
      });
    });
  });

  describe('findOneOwned', () => {
    it('el dueño puede ver su propia venta, con owner poblado', async () => {
      salesRepo.findOne.mockResolvedValue(baseSale);

      const result = await salesService.findOneOwned(baseSale.id, revendedorA);

      expect(result).toBe(baseSale);
      expect(result.owner).toEqual(baseSale.owner);
    });

    it('otro REVENDEDOR recibe NotFoundException (404, no 403) sobre una venta ajena', async () => {
      salesRepo.findOne.mockResolvedValue(baseSale);

      await expect(
        salesService.findOneOwned(baseSale.id, revendedorB),
      ).rejects.toThrow(NotFoundException);
    });

    it('el ADMIN puede ver la venta de cualquiera', async () => {
      salesRepo.findOne.mockResolvedValue(baseSale);

      const result = await salesService.findOneOwned(baseSale.id, admin);

      expect(result).toBe(baseSale);
    });
  });

  describe('softDelete', () => {
    it('pone activo en false y libera el perfil', async () => {
      salesRepo.findOne.mockResolvedValue({ ...baseSale });

      const result = await salesService.softDelete('sale-1', revendedorA);

      expect(result.activo).toBe(false);
      expect(profilesService.assignCliente).toHaveBeenCalledWith(
        'account-1',
        'profile-1',
        null,
      );
    });

    it('libera la cuenta si la venta no tiene perfil', async () => {
      salesRepo.findOne.mockResolvedValue({ ...baseSale, perfilId: null });

      await salesService.softDelete('sale-1', revendedorA);

      expect(accountsService.assignCliente).toHaveBeenCalledWith(
        'account-1',
        null,
      );
      expect(profilesService.assignCliente).not.toHaveBeenCalled();
    });

    it('rechaza desactivar directo una venta hija de un combo', async () => {
      salesRepo.findOne.mockResolvedValue({
        ...baseSale,
        ventaComboId: 'combo-venta-1',
      });

      await expect(salesService.softDelete('sale-1', revendedorA)).rejects.toThrow(
        BadRequestException,
      );
      expect(salesRepo.save).not.toHaveBeenCalled();
    });

    it('un REVENDEDOR no puede desactivar una venta ajena (404)', async () => {
      salesRepo.findOne.mockResolvedValue(baseSale);

      await expect(salesService.softDelete('sale-1', revendedorB)).rejects.toThrow(
        NotFoundException,
      );
      expect(salesRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('reactivate', () => {
    it('rechaza reactivar directo una venta hija de un combo', async () => {
      salesRepo.findOne.mockResolvedValue({
        ...baseSale,
        activo: false,
        ventaComboId: 'combo-venta-1',
      });

      await expect(salesService.reactivate('sale-1', revendedorA)).rejects.toThrow(
        BadRequestException,
      );
      expect(salesRepo.save).not.toHaveBeenCalled();
    });

    it('reasigna el perfil si sigue libre', async () => {
      salesRepo.findOne
        .mockResolvedValueOnce({ ...baseSale, activo: false }) // findOneOwned(id)
        .mockResolvedValueOnce(null); // assertPerfilLibre: sin ocupar

      const result = await salesService.reactivate('sale-1', revendedorA);

      expect(result.activo).toBe(true);
      expect(profilesService.assignCliente).toHaveBeenCalledWith(
        'account-1',
        'profile-1',
        'contact-1',
      );
    });

    it('rechaza reactivar si el perfil ya no está libre', async () => {
      salesRepo.findOne
        .mockResolvedValueOnce({ ...baseSale, activo: false })
        .mockResolvedValueOnce({ ...baseSale, id: 'sale-2', codigoVenta: 'V-00002' });

      await expect(salesService.reactivate('sale-1', revendedorA)).rejects.toThrow(
        ConflictException,
      );
      expect(salesRepo.save).not.toHaveBeenCalled();
    });

    it('rechaza reactivar si la cuenta ya no está libre (venta sin perfil)', async () => {
      salesRepo.findOne
        .mockResolvedValueOnce({ ...baseSale, activo: false, perfilId: null })
        .mockResolvedValueOnce({
          ...baseSale,
          id: 'sale-2',
          perfilId: null,
          codigoVenta: 'V-00002',
        });

      await expect(salesService.reactivate('sale-1', revendedorA)).rejects.toThrow(
        ConflictException,
      );
    });

    it('un REVENDEDOR no puede reactivar una venta ajena (404)', async () => {
      salesRepo.findOne.mockResolvedValue({ ...baseSale, activo: false });

      await expect(salesService.reactivate('sale-1', revendedorB)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('la exclusividad no distingue quién pregunta: el ADMIN tampoco puede reactivar si el perfil está ocupado por la venta de otro usuario', async () => {
      salesRepo.findOne
        .mockResolvedValueOnce({ ...baseSale, activo: false }) // findOneOwned como admin: pasa igual
        .mockResolvedValueOnce({
          ...baseSale,
          id: 'sale-2',
          ownerId: revendedorB.id,
          codigoVenta: 'V-00002',
        }); // assertPerfilLibre: ocupado por la venta de B

      await expect(salesService.reactivate('sale-1', admin)).rejects.toThrow(
        ConflictException,
      );
      expect(salesRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('renew', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-10T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('rechaza renovar directo una venta hija de un combo', async () => {
      salesRepo.findOne.mockResolvedValue({
        ...baseSale,
        ventaComboId: 'combo-venta-1',
      });

      await expect(
        salesService.renew('sale-1', {}, revendedorA),
      ).rejects.toThrow(BadRequestException);
      expect(salesRepo.update).not.toHaveBeenCalled();
    });

    it('extiende fechaFin sumando duracionMeses (snapshot de la venta)', async () => {
      salesRepo.findOne.mockResolvedValue({
        ...baseSale,
        fechaFin: '2026-02-05',
        duracionMeses: 1,
      });

      await salesService.renew('sale-1', {}, revendedorA);

      expect(salesRepo.update).toHaveBeenCalledWith('sale-1', {
        fechaFin: '2026-03-05',
        precio: baseSale.precio,
        moneda: baseSale.moneda,
        tasaCambio: baseSale.tasaCambio,
        metodoPago: baseSale.metodoPago,
        precioPEN: baseSale.precioPEN,
      });
    });

    it('sin body: crea el Pago de renovación con los valores actuales de la venta y fecha de hoy', async () => {
      salesRepo.findOne.mockResolvedValue({ ...baseSale });

      await salesService.renew('sale-1', {}, revendedorA);

      expect(paymentsService.create).toHaveBeenCalledWith({
        ventaId: 'sale-1',
        monto: baseSale.precio,
        moneda: baseSale.moneda,
        tasaCambio: baseSale.tasaCambio,
        metodoPago: baseSale.metodoPago,
        fecha: '2026-02-10',
        tipo: PaymentType.RENOVACION,
      });
    });

    it('con body: usa los valores enviados, recalcula precioPEN y crea el Pago con ellos', async () => {
      salesRepo.findOne.mockResolvedValue({ ...baseSale });

      await salesService.renew(
        'sale-1',
        { precio: 20, tasaCambio: 3.5, metodoPago: 'Plin' },
        revendedorA,
      );

      expect(salesRepo.update).toHaveBeenCalledWith(
        'sale-1',
        expect.objectContaining({
          precio: 20,
          tasaCambio: 3.5,
          metodoPago: 'Plin',
          moneda: baseSale.moneda,
          precioPEN: 70,
        }),
      );
      expect(paymentsService.create).toHaveBeenCalledWith({
        ventaId: 'sale-1',
        monto: 20,
        moneda: baseSale.moneda,
        tasaCambio: 3.5,
        metodoPago: 'Plin',
        fecha: '2026-02-10',
        tipo: PaymentType.RENOVACION,
      });
    });

    it('un REVENDEDOR no puede renovar una venta ajena (404)', async () => {
      salesRepo.findOne.mockResolvedValue(baseSale);

      await expect(
        salesService.renew('sale-1', {}, revendedorB),
      ).rejects.toThrow(NotFoundException);
      expect(salesRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('recalcula precioPEN si cambia el precio', async () => {
      salesRepo.findOne.mockResolvedValue({ ...baseSale });

      await salesService.update('sale-1', { precio: 20 }, revendedorA);

      expect(salesRepo.update).toHaveBeenCalledWith(
        'sale-1',
        expect.objectContaining({ precioPEN: 20 }),
      );
    });

    it('recalcula precioPEN si cambia la tasaCambio', async () => {
      salesRepo.findOne.mockResolvedValue({ ...baseSale, precio: 10 });

      await salesService.update('sale-1', { tasaCambio: 2 }, revendedorA);

      expect(salesRepo.update).toHaveBeenCalledWith(
        'sale-1',
        expect.objectContaining({ precioPEN: 20 }),
      );
    });

    it('no toca precioPEN si no cambian precio ni tasaCambio', async () => {
      salesRepo.findOne.mockResolvedValue({ ...baseSale });

      await salesService.update('sale-1', { metodoPago: 'Plin' }, revendedorA);

      const payload = salesRepo.update.mock.calls[0][1];
      expect(payload).not.toHaveProperty('precioPEN');
    });

    it('un REVENDEDOR no puede editar una venta ajena (404)', async () => {
      salesRepo.findOne.mockResolvedValue(baseSale);

      await expect(
        salesService.update('sale-1', { metodoPago: 'Plin' }, revendedorB),
      ).rejects.toThrow(NotFoundException);
      expect(salesRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('findAll con vencimiento (sin scope, uso interno)', () => {
    it('sin vencimiento sigue usando find() simple (no QueryBuilder)', async () => {
      salesRepo.find.mockResolvedValue([]);

      await salesService.findAll({});

      expect(salesRepo.find).toHaveBeenCalled();
      expect(salesRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('vencida: filtra activo=true y fechaFin < CURRENT_DATE', async () => {
      await salesService.findAll({ vencimiento: VencimientoFiltro.VENCIDA });

      expect(queryBuilder.where).toHaveBeenCalledWith('sale.activo = :activo', {
        activo: true,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'sale.fechaFin < CURRENT_DATE',
      );
    });

    it('por_vencer: usa diasAlerta=3 por defecto', async () => {
      await salesService.findAll({
        vencimiento: VencimientoFiltro.POR_VENCER,
      });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        "sale.fechaFin BETWEEN CURRENT_DATE AND CURRENT_DATE + (:dias * INTERVAL '1 day')",
        { dias: 3 },
      );
    });

    it('al_dia: respeta un diasAlerta explícito', async () => {
      await salesService.findAll({
        vencimiento: VencimientoFiltro.AL_DIA,
        diasAlerta: 7,
      });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        "sale.fechaFin > CURRENT_DATE + (:dias * INTERVAL '1 day')",
        { dias: 7 },
      );
    });

    it('combina vencimiento con clienteId y servicioId', async () => {
      await salesService.findAll({
        vencimiento: VencimientoFiltro.VENCIDA,
        clienteId: 'contact-1',
        servicioId: 'service-1',
      });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'sale.clienteId = :clienteId',
        { clienteId: 'contact-1' },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'sale.servicioId = :servicioId',
        { servicioId: 'service-1' },
      );
    });

    it('ignora query.activo a propósito: siempre fuerza activo=true', async () => {
      await salesService.findAll({
        vencimiento: VencimientoFiltro.VENCIDA,
        activo: false,
      });

      expect(queryBuilder.where).toHaveBeenCalledWith('sale.activo = :activo', {
        activo: true,
      });
    });
  });

  describe('findAllOwned', () => {
    it('un REVENDEDOR queda acotado a su propio ownerId (filtro simple, sin vencimiento)', async () => {
      salesRepo.find.mockResolvedValue([]);

      await salesService.findAllOwned({}, revendedorA);

      expect(salesRepo.find.mock.calls[0][0].where).toEqual({
        ownerId: revendedorA.id,
      });
      expect(salesRepo.find.mock.calls[0][0].relations).toEqual({ owner: true });
    });

    it('un ADMIN ve todo, sin filtro de ownerId', async () => {
      salesRepo.find.mockResolvedValue([]);

      await salesService.findAllOwned({}, admin);

      expect(salesRepo.find.mock.calls[0][0].where).toEqual({});
    });

    it('con vencimiento, un REVENDEDOR también queda acotado a su ownerId en el QueryBuilder', async () => {
      await salesService.findAllOwned(
        { vencimiento: VencimientoFiltro.VENCIDA },
        revendedorA,
      );

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('sale.ownerId = :ownerId', {
        ownerId: revendedorA.id,
      });
      expect(queryBuilder.leftJoin).toHaveBeenCalledWith('sale.owner', 'owner');
    });

    it('con vencimiento, un ADMIN no queda acotado por ownerId', async () => {
      await salesService.findAllOwned(
        { vencimiento: VencimientoFiltro.VENCIDA },
        admin,
      );

      const llamadasOwnerId = queryBuilder.andWhere.mock.calls.filter(
        ([sql]) => sql === 'sale.ownerId = :ownerId',
      );
      expect(llamadasOwnerId).toHaveLength(0);
    });
  });

  describe('summaryOwned', () => {
    it('un REVENDEDOR: los 3 conteos quedan acotados a su ownerId', async () => {
      await salesService.summaryOwned(5, revendedorA);

      const llamadasOwnerId = queryBuilder.andWhere.mock.calls.filter(
        ([sql]) => sql === 'sale.ownerId = :ownerId',
      );
      expect(llamadasOwnerId).toHaveLength(3); // vencidas, porVencer, alDia
      expect(llamadasOwnerId[0][1]).toEqual({ ownerId: revendedorA.id });
    });

    it('un ADMIN: los 3 conteos no tienen filtro de ownerId', async () => {
      await salesService.summaryOwned(5, admin);

      const llamadasOwnerId = queryBuilder.andWhere.mock.calls.filter(
        ([sql]) => sql === 'sale.ownerId = :ownerId',
      );
      expect(llamadasOwnerId).toHaveLength(0);
    });

    it('usa diasAlerta=3 por defecto', async () => {
      await salesService.summaryOwned(undefined, admin);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('BETWEEN'),
        { dias: 3 },
      );
    });
  });

  describe('summary (sin scope, uso interno)', () => {
    it('cuenta vencidas, por vencer y al día con el mismo diasAlerta', async () => {
      queryBuilder.getCount
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(9);

      const result = await salesService.summary(5);

      expect(result).toEqual({ vencidas: 2, porVencer: 5, alDia: 9 });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'sale.fechaFin < CURRENT_DATE',
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        "sale.fechaFin BETWEEN CURRENT_DATE AND CURRENT_DATE + (:dias * INTERVAL '1 day')",
        { dias: 5 },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        "sale.fechaFin > CURRENT_DATE + (:dias * INTERVAL '1 day')",
        { dias: 5 },
      );
    });

    it('usa diasAlerta=3 por defecto', async () => {
      await salesService.summary();

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('BETWEEN'),
        { dias: 3 },
      );
    });
  });
});
