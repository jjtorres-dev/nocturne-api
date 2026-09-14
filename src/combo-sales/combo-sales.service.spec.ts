import { BadRequestException, ConflictException } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import { ComboSalesService } from './combo-sales.service.js';
import { VentaCombo } from './entities/venta-combo.entity.js';
import { Moneda } from '../sales/moneda.enum.js';
import { ServiceType } from '../services/service-type.enum.js';
import { PaymentType } from '../payments/payment-type.enum.js';
import type { ContactsService } from '../contacts/contacts.service.js';
import type { CombosService } from '../combos/combos.service.js';

describe('ComboSalesService', () => {
  const servicioSinPerfiles = {
    id: 'srv-a',
    nombre: 'Netflix',
    tipo: ServiceType.SIN_PERFILES,
    duracionMeses: 1,
    pantallasMax: null,
    precioBase: 20,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const servicioConPerfiles = {
    id: 'srv-b',
    nombre: 'Disney+',
    tipo: ServiceType.CON_PERFILES,
    duracionMeses: 1,
    pantallasMax: 4,
    precioBase: 15,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const combo = {
    id: 'combo-1',
    nombre: 'Combo Netflix + Disney',
    descripcion: null,
    servicios: [servicioSinPerfiles, servicioConPerfiles],
    precioCombo: 30,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const cuentaA = { id: 'cta-a', servicioId: 'srv-a' };
  const cuentaB = { id: 'cta-b', servicioId: 'srv-b' };
  const perfilB = { id: 'per-b', cuentaId: 'cta-b' };

  const createDto = {
    clienteId: 'cli-1',
    comboId: 'combo-1',
    fechaInicio: '2026-01-05',
    fechaFin: '2026-02-05',
    duracionMeses: 1,
    moneda: Moneda.PEN,
    metodoPago: 'Yape',
    asignaciones: [
      { servicioId: 'srv-a', cuentaId: 'cta-a' },
      { servicioId: 'srv-b', cuentaId: 'cta-b', perfilId: 'per-b' },
    ],
  };

  let ventaCombosRepo: {
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let manager: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
  };
  let dataSource: { transaction: ReturnType<typeof vi.fn> };
  let contactsService: { findOne: ReturnType<typeof vi.fn> };
  let combosService: { findOne: ReturnType<typeof vi.fn> };
  let comboSalesService: ComboSalesService;

  beforeEach(() => {
    manager = {
      findOne: vi.fn(),
      find: vi.fn(),
      create: vi.fn((_entity, data) => ({ ...data })),
      save: vi.fn(async (entity: Record<string, unknown>) => {
        if ('comboId' in entity && !('servicioId' in entity)) {
          return { ...entity, id: 'venta-combo-1' };
        }
        if ('servicioId' in entity) {
          return { ...entity, id: `sale-${Math.random()}` };
        }
        return { ...entity, id: 'payment-1' };
      }),
      update: vi.fn(async () => ({ affected: 1 })),
      query: vi.fn().mockResolvedValue([{ nextval: '1' }]),
    };
    dataSource = {
      transaction: vi.fn(async (cb: (m: typeof manager) => unknown) =>
        cb(manager),
      ),
    };
    ventaCombosRepo = {
      find: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(async () => ({ affected: 1 })),
    };
    contactsService = { findOne: vi.fn().mockResolvedValue({ id: 'cli-1' }) };
    combosService = { findOne: vi.fn().mockResolvedValue(combo) };
    // Default para el findOne() final que hacen create/softDelete/reactivate/
    // renew después de la transacción (usa el repositorio, no el manager).
    ventaCombosRepo.findOne.mockResolvedValue({ id: 'venta-combo-1', ventas: [] });

    comboSalesService = new ComboSalesService(
      ventaCombosRepo as unknown as Repository<VentaCombo>,
      dataSource as unknown as DataSource,
      contactsService as unknown as ContactsService,
      combosService as unknown as CombosService,
    );
  });

  describe('create — cobertura de asignaciones', () => {
    it('rechaza si el número de asignaciones no coincide con el del combo', async () => {
      await expect(
        comboSalesService.create({
          ...createDto,
          asignaciones: [createDto.asignaciones[0]],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rechaza si una asignación referencia un servicio fuera del combo', async () => {
      await expect(
        comboSalesService.create({
          ...createDto,
          asignaciones: [
            createDto.asignaciones[0],
            { servicioId: 'srv-ajeno', cuentaId: 'cta-x' },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rechaza asignaciones duplicadas para el mismo servicio', async () => {
      await expect(
        comboSalesService.create({
          ...createDto,
          asignaciones: [
            createDto.asignaciones[0],
            { ...createDto.asignaciones[0], cuentaId: 'cta-otra' },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('create — camino feliz', () => {
    beforeEach(() => {
      manager.findOne
        .mockResolvedValueOnce(cuentaA) // cuenta de srv-a
        .mockResolvedValueOnce(null) // srv-a: cuenta libre
        .mockResolvedValueOnce(cuentaB) // cuenta de srv-b
        .mockResolvedValueOnce(perfilB) // perfil de srv-b
        .mockResolvedValueOnce(null); // srv-b: perfil libre
    });

    it('crea la VentaCombo con precioCombo por defecto y precioPEN calculado', async () => {
      const result = await comboSalesService.create(createDto);

      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          comboId: 'combo-1',
          clienteId: 'cli-1',
          precio: 30,
          precioPEN: 30,
          codigoVenta: expect.stringMatching(/^C-\d{5}$/),
          activo: true,
        }),
      );
      expect(result).toBeDefined();
    });

    it('usa el precio explícito del body si viene, en vez de precioCombo', async () => {
      await comboSalesService.create({ ...createDto, precio: 40, tasaCambio: 2 });

      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ precio: 40, tasaCambio: 2, precioPEN: 80 }),
      );
    });

    it('crea una Sale hija por cada asignación, con precio=0 y ventaComboId', async () => {
      await comboSalesService.create(createDto);

      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          cuentaId: 'cta-a',
          perfilId: null,
          servicioId: 'srv-a',
          precio: 0,
          precioPEN: 0,
          ventaComboId: 'venta-combo-1',
          codigoVenta: expect.stringMatching(/^V-\d{5}$/),
        }),
      );
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          cuentaId: 'cta-b',
          perfilId: 'per-b',
          servicioId: 'srv-b',
          precio: 0,
          ventaComboId: 'venta-combo-1',
        }),
      );
    });

    it('sincroniza clienteId en la cuenta (sin perfil) y en el perfil (con perfil)', async () => {
      await comboSalesService.create(createDto);

      expect(manager.update).toHaveBeenCalledWith(expect.anything(), 'cta-a', {
        clienteId: 'cli-1',
      });
      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'per-b', cuentaId: 'cta-b' },
        { clienteId: 'cli-1' },
      );
    });

    it('crea UN solo Payment tipo=venta_inicial ligado a la VentaCombo, no a las hijas', async () => {
      await comboSalesService.create(createDto);

      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          ventaId: null,
          ventaComboId: 'venta-combo-1',
          monto: 30,
          montoPEN: 30,
          tipo: PaymentType.VENTA_INICIAL,
        }),
      );
      const paymentSaves = manager.save.mock.calls.filter(
        ([entity]) => entity.tipo === PaymentType.VENTA_INICIAL,
      );
      expect(paymentSaves).toHaveLength(1);
    });
  });

  describe('create — validaciones por asignación', () => {
    it('rechaza si la cuenta no pertenece al servicio de la asignación', async () => {
      manager.findOne.mockResolvedValueOnce({ id: 'cta-a', servicioId: 'srv-otro' });

      await expect(comboSalesService.create(createDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('exige perfilId si el servicio de la asignación es CON_PERFILES', async () => {
      manager.findOne
        .mockResolvedValueOnce(cuentaA)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(cuentaB);

      await expect(
        comboSalesService.create({
          ...createDto,
          asignaciones: [
            createDto.asignaciones[0],
            { servicioId: 'srv-b', cuentaId: 'cta-b' },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza perfilId si el servicio de la asignación es SIN_PERFILES', async () => {
      manager.findOne.mockResolvedValueOnce(cuentaA);

      await expect(
        comboSalesService.create({
          ...createDto,
          asignaciones: [
            { servicioId: 'srv-a', cuentaId: 'cta-a', perfilId: 'per-x' },
            createDto.asignaciones[1],
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('create — rollback (el caso crítico)', () => {
    it('409 si la PRIMERA asignación ya está ocupada: no crea nada', async () => {
      manager.findOne
        .mockResolvedValueOnce(cuentaA)
        .mockResolvedValueOnce({ id: 'sale-x', codigoVenta: 'V-00099' }); // cta-a ocupada

      await expect(comboSalesService.create(createDto)).rejects.toThrow(
        ConflictException,
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('409 si la SEGUNDA asignación ya está ocupada: la primera pasó pero NO queda nada creado', async () => {
      manager.findOne
        .mockResolvedValueOnce(cuentaA) // cuenta de srv-a: ok
        .mockResolvedValueOnce(null) // srv-a: libre
        .mockResolvedValueOnce(cuentaB) // cuenta de srv-b: ok
        .mockResolvedValueOnce(perfilB) // perfil de srv-b: ok
        .mockResolvedValueOnce({ id: 'sale-y', codigoVenta: 'V-00050' }); // per-b OCUPADO

      await expect(comboSalesService.create(createDto)).rejects.toThrow(
        ConflictException,
      );

      // La aserción central de este test: aunque la primera asignación
      // validó sin problema, no se llamó a save() ni una sola vez — nada
      // de VentaCombo, Sale hija o Payment quedó creado.
      expect(manager.save).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
    });
  });

  describe('findOne / findAll', () => {
    it('findOne carga las ventas hijas con servicio/cuenta/perfil', async () => {
      ventaCombosRepo.findOne.mockResolvedValue({ id: 'venta-combo-1' });

      await comboSalesService.findOne('venta-combo-1');

      expect(ventaCombosRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'venta-combo-1' },
        relations: { ventas: { servicio: true, cuenta: true, perfil: true } },
      });
    });

    it('findAll filtra por clienteId/comboId/activo', async () => {
      ventaCombosRepo.find.mockResolvedValue([]);

      await comboSalesService.findAll({
        clienteId: 'cli-1',
        comboId: 'combo-1',
        activo: true,
      });

      expect(ventaCombosRepo.find).toHaveBeenCalledWith({
        where: { clienteId: 'cli-1', comboId: 'combo-1', activo: true },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('update', () => {
    it('recalcula precioPEN si cambia precio o tasaCambio', async () => {
      ventaCombosRepo.findOne
        .mockResolvedValueOnce({ id: 'venta-combo-1', precio: 30, tasaCambio: 1 })
        .mockResolvedValueOnce({ id: 'venta-combo-1' });

      await comboSalesService.update('venta-combo-1', { tasaCambio: 2 });

      expect(ventaCombosRepo.update).toHaveBeenCalledWith(
        'venta-combo-1',
        expect.objectContaining({ tasaCambio: 2, precioPEN: 60 }),
      );
    });
  });

  describe('softDelete', () => {
    it('desactiva el wrapper, todas las ventas hijas, y libera sus cuentas/perfiles', async () => {
      manager.findOne.mockResolvedValueOnce({ id: 'venta-combo-1' });
      manager.find.mockResolvedValueOnce([
        { id: 'sale-a', cuentaId: 'cta-a', perfilId: null },
        { id: 'sale-b', cuentaId: 'cta-b', perfilId: 'per-b' },
      ]);

      await comboSalesService.softDelete('venta-combo-1');

      expect(manager.update).toHaveBeenCalledWith(expect.anything(), 'sale-a', {
        activo: false,
      });
      expect(manager.update).toHaveBeenCalledWith(expect.anything(), 'cta-a', {
        clienteId: null,
      });
      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'per-b', cuentaId: 'cta-b' },
        { clienteId: null },
      );
      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(),
        'venta-combo-1',
        { activo: false },
      );
    });
  });

  describe('reactivate', () => {
    it('revalida exclusividad de TODAS las hijas antes de reactivar cualquiera', async () => {
      manager.findOne.mockResolvedValueOnce({ id: 'venta-combo-1' });
      manager.find.mockResolvedValueOnce([
        { id: 'sale-a', cuentaId: 'cta-a', perfilId: null, codigoVenta: 'V-1' },
        { id: 'sale-b', cuentaId: 'cta-b', perfilId: 'per-b', codigoVenta: 'V-2' },
      ]);
      // sale-a: libre; sale-b: perfil ya ocupado por otra venta.
      manager.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'sale-z', codigoVenta: 'V-99' });

      await expect(comboSalesService.reactivate('venta-combo-1')).rejects.toThrow(
        ConflictException,
      );
      // Ninguna de las dos debe haberse reactivado.
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('reactiva y resincroniza clienteId cuando todo sigue libre', async () => {
      manager.findOne.mockResolvedValueOnce({ id: 'venta-combo-1' });
      manager.find.mockResolvedValueOnce([
        { id: 'sale-a', cuentaId: 'cta-a', perfilId: null, clienteId: 'cli-1' },
      ]);
      manager.findOne.mockResolvedValueOnce(null); // libre

      await comboSalesService.reactivate('venta-combo-1');

      expect(manager.update).toHaveBeenCalledWith(expect.anything(), 'sale-a', {
        activo: true,
      });
      expect(manager.update).toHaveBeenCalledWith(expect.anything(), 'cta-a', {
        clienteId: 'cli-1',
      });
      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(),
        'venta-combo-1',
        { activo: true },
      );
    });
  });

  describe('renew', () => {
    it('extiende fechaFin del wrapper y de todas las hijas, y crea un Payment de renovación', async () => {
      manager.findOne.mockResolvedValueOnce({
        id: 'venta-combo-1',
        fechaFin: '2026-02-05',
        duracionMeses: 1,
        precio: 30,
        moneda: Moneda.PEN,
        tasaCambio: 1,
        precioPEN: 30,
        metodoPago: 'Yape',
      });

      await comboSalesService.renew('venta-combo-1');

      expect(manager.update).toHaveBeenCalledWith(expect.anything(), 'venta-combo-1', {
        fechaFin: '2026-03-05',
      });
      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(),
        { ventaComboId: 'venta-combo-1' },
        { fechaFin: '2026-03-05' },
      );
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          ventaId: null,
          ventaComboId: 'venta-combo-1',
          monto: 30,
          tipo: PaymentType.RENOVACION,
        }),
      );
    });
  });
});
