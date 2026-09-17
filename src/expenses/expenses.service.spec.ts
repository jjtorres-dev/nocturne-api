import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { ExpensesService } from './expenses.service.js';
import { Expense } from './entities/expense.entity.js';
import { Moneda } from '../sales/moneda.enum.js';
import { UserRole } from '../users/user-role.enum.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

describe('ExpensesService', () => {
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

  const baseExpense: Expense = {
    id: 'expense-1',
    ownerId: revendedorA.id,
    owner: { id: revendedorA.id, name: revendedorA.name, email: revendedorA.email },
    descripcion: 'Hosting',
    monto: 10,
    moneda: Moneda.PEN,
    tasaCambio: 1,
    montoPEN: 10,
    metodoPago: 'Yape',
    fecha: '2026-01-05',
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Expense;

  const OWNED_SELECT = {
    id: true,
    ownerId: true,
    descripcion: true,
    monto: true,
    moneda: true,
    tasaCambio: true,
    montoPEN: true,
    metodoPago: true,
    fecha: true,
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
  let expensesService: ExpensesService;

  beforeEach(() => {
    repo = {
      create: vi.fn((dto) => ({ ...dto })),
      save: vi.fn(async (entity) => entity),
      update: vi.fn(async () => ({ affected: 1 })),
      findOne: vi.fn(),
      find: vi.fn(),
    };
    expensesService = new ExpensesService(repo as unknown as Repository<Expense>);
  });

  describe('create', () => {
    it('calcula montoPEN = monto * tasaCambio, con ownerId del usuario autenticado', async () => {
      const result = await expensesService.create(
        {
          descripcion: 'Hosting',
          monto: 10,
          moneda: Moneda.USD,
          tasaCambio: 3.8,
          metodoPago: 'Yape',
          fecha: '2026-01-05',
        },
        revendedorA,
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          montoPEN: 38,
          tasaCambio: 3.8,
          ownerId: revendedorA.id,
        }),
      );
      expect(result.montoPEN).toBe(38);
    });

    it('usa tasaCambio=1 por defecto si no se envía', async () => {
      await expensesService.create(
        {
          descripcion: 'Hosting',
          monto: 10,
          moneda: Moneda.PEN,
          metodoPago: 'Yape',
          fecha: '2026-01-05',
        },
        revendedorA,
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ montoPEN: 10, tasaCambio: 1 }),
      );
    });
  });

  it('filtra por activo al listar (sin scope)', async () => {
    repo.find.mockResolvedValue([baseExpense]);

    await expensesService.findAll({ activo: true });

    expect(repo.find).toHaveBeenCalledWith({
      where: { activo: true },
      order: { fecha: 'DESC' },
    });
  });

  it('lanza NotFoundException si el gasto no existe (findOne sin scope)', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(expensesService.findOne('no-existe')).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('findAllOwned', () => {
    it('un REVENDEDOR queda acotado a su propio ownerId, sin importar el query', async () => {
      repo.find.mockResolvedValue([baseExpense]);

      await expensesService.findAllOwned({ activo: true }, revendedorA);

      expect(repo.find).toHaveBeenCalledWith({
        where: { activo: true, ownerId: revendedorA.id },
        relations: { owner: true },
        select: OWNED_SELECT,
        order: { fecha: 'DESC' },
      });
    });

    it('un ADMIN ve todo, sin filtro de ownerId', async () => {
      repo.find.mockResolvedValue([baseExpense]);

      await expensesService.findAllOwned({}, admin);

      expect(repo.find).toHaveBeenCalledWith({
        where: {},
        relations: { owner: true },
        select: OWNED_SELECT,
        order: { fecha: 'DESC' },
      });
    });

    it('siempre incluye el owner {id, name, email}, para admin y para revendedor por igual', async () => {
      repo.find.mockResolvedValue([baseExpense]);

      const [resultAdmin] = await expensesService.findAllOwned({}, admin);
      const [resultRevendedor] = await expensesService.findAllOwned({}, revendedorA);

      expect(resultAdmin.owner).toEqual({
        id: revendedorA.id,
        name: revendedorA.name,
        email: revendedorA.email,
      });
      expect(resultRevendedor.owner).toEqual(resultAdmin.owner);
    });
  });

  describe('findOneOwned', () => {
    it('el dueño puede ver su propio gasto, con el owner {id, name, email} poblado', async () => {
      repo.findOne.mockResolvedValue(baseExpense);

      const result = await expensesService.findOneOwned(baseExpense.id, revendedorA);

      expect(result).toBe(baseExpense);
      expect(result.owner).toEqual({
        id: revendedorA.id,
        name: revendedorA.name,
        email: revendedorA.email,
      });
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: baseExpense.id },
        relations: { owner: true },
        select: OWNED_SELECT,
      });
    });

    it('otro REVENDEDOR recibe NotFoundException (404, no 403) sobre un gasto ajeno', async () => {
      repo.findOne.mockResolvedValue(baseExpense);

      await expect(
        expensesService.findOneOwned(baseExpense.id, revendedorB),
      ).rejects.toThrow(NotFoundException);
    });

    it('el ADMIN puede ver el gasto de cualquiera, con el mismo owner poblado que ve el dueño', async () => {
      repo.findOne.mockResolvedValue(baseExpense);

      const result = await expensesService.findOneOwned(baseExpense.id, admin);

      expect(result).toBe(baseExpense);
      expect(result.owner).toEqual({
        id: revendedorA.id,
        name: revendedorA.name,
        email: revendedorA.email,
      });
    });

    it('lanza NotFoundException si el gasto no existe', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(expensesService.findOneOwned('no-existe', admin)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('recalcula montoPEN si cambia el monto', async () => {
      repo.findOne.mockResolvedValue({ ...baseExpense });

      await expensesService.update('expense-1', { monto: 20 }, revendedorA);

      expect(repo.update).toHaveBeenCalledWith(
        'expense-1',
        expect.objectContaining({ montoPEN: 20 }),
      );
    });

    it('recalcula montoPEN si cambia la tasaCambio', async () => {
      repo.findOne.mockResolvedValue({ ...baseExpense, monto: 10 });

      await expensesService.update('expense-1', { tasaCambio: 2 }, revendedorA);

      expect(repo.update).toHaveBeenCalledWith(
        'expense-1',
        expect.objectContaining({ montoPEN: 20 }),
      );
    });

    it('no toca montoPEN si no cambian monto ni tasaCambio', async () => {
      repo.findOne.mockResolvedValue({ ...baseExpense });

      await expensesService.update('expense-1', { descripcion: 'Otro' }, revendedorA);

      const payload = repo.update.mock.calls[0][1];
      expect(payload).not.toHaveProperty('montoPEN');
    });

    it('un REVENDEDOR no puede tocar un gasto ajeno (404)', async () => {
      repo.findOne.mockResolvedValue(baseExpense);

      await expect(
        expensesService.update('expense-1', { descripcion: 'Otro' }, revendedorB),
      ).rejects.toThrow(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  it('softDelete pone activo en false sin borrar el registro', async () => {
    repo.findOne.mockResolvedValue({ ...baseExpense, activo: true });

    const result = await expensesService.softDelete(baseExpense.id, revendedorA);

    expect(result.activo).toBe(false);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ activo: false }),
    );
  });

  it('softDelete: un REVENDEDOR no puede desactivar un gasto ajeno (404)', async () => {
    repo.findOne.mockResolvedValue(baseExpense);

    await expect(
      expensesService.softDelete(baseExpense.id, revendedorB),
    ).rejects.toThrow(NotFoundException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('reactivate pone activo en true', async () => {
    repo.findOne.mockResolvedValue({ ...baseExpense, activo: false });

    const result = await expensesService.reactivate(baseExpense.id, revendedorA);

    expect(result.activo).toBe(true);
  });

  it('reactivate: un REVENDEDOR no puede reactivar un gasto ajeno (404)', async () => {
    repo.findOne.mockResolvedValue(baseExpense);

    await expect(
      expensesService.reactivate(baseExpense.id, revendedorB),
    ).rejects.toThrow(NotFoundException);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
