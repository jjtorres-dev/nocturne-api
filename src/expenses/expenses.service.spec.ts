import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { ExpensesService } from './expenses.service.js';
import { Expense } from './entities/expense.entity.js';
import { Moneda } from '../sales/moneda.enum.js';

describe('ExpensesService', () => {
  const baseExpense: Expense = {
    id: 'expense-1',
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
    it('calcula montoPEN = monto * tasaCambio', async () => {
      const result = await expensesService.create({
        descripcion: 'Hosting',
        monto: 10,
        moneda: Moneda.USD,
        tasaCambio: 3.8,
        metodoPago: 'Yape',
        fecha: '2026-01-05',
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ montoPEN: 38, tasaCambio: 3.8 }),
      );
      expect(result.montoPEN).toBe(38);
    });

    it('usa tasaCambio=1 por defecto si no se envía', async () => {
      await expensesService.create({
        descripcion: 'Hosting',
        monto: 10,
        moneda: Moneda.PEN,
        metodoPago: 'Yape',
        fecha: '2026-01-05',
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ montoPEN: 10, tasaCambio: 1 }),
      );
    });
  });

  it('filtra por activo al listar', async () => {
    repo.find.mockResolvedValue([baseExpense]);

    await expensesService.findAll({ activo: true });

    expect(repo.find).toHaveBeenCalledWith({
      where: { activo: true },
      order: { fecha: 'DESC' },
    });
  });

  it('lanza NotFoundException si el gasto no existe', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(expensesService.findOne('no-existe')).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('update', () => {
    it('recalcula montoPEN si cambia el monto', async () => {
      repo.findOne.mockResolvedValue({ ...baseExpense });

      await expensesService.update('expense-1', { monto: 20 });

      expect(repo.update).toHaveBeenCalledWith(
        'expense-1',
        expect.objectContaining({ montoPEN: 20 }),
      );
    });

    it('recalcula montoPEN si cambia la tasaCambio', async () => {
      repo.findOne.mockResolvedValue({ ...baseExpense, monto: 10 });

      await expensesService.update('expense-1', { tasaCambio: 2 });

      expect(repo.update).toHaveBeenCalledWith(
        'expense-1',
        expect.objectContaining({ montoPEN: 20 }),
      );
    });

    it('no toca montoPEN si no cambian monto ni tasaCambio', async () => {
      repo.findOne.mockResolvedValue({ ...baseExpense });

      await expensesService.update('expense-1', { descripcion: 'Otro' });

      const payload = repo.update.mock.calls[0][1];
      expect(payload).not.toHaveProperty('montoPEN');
    });
  });

  it('softDelete pone activo en false sin borrar el registro', async () => {
    repo.findOne.mockResolvedValue({ ...baseExpense, activo: true });

    const result = await expensesService.softDelete(baseExpense.id);

    expect(result.activo).toBe(false);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ activo: false }),
    );
  });

  it('reactivate pone activo en true', async () => {
    repo.findOne.mockResolvedValue({ ...baseExpense, activo: false });

    const result = await expensesService.reactivate(baseExpense.id);

    expect(result.activo).toBe(true);
  });
});
