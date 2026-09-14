import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from './entities/expense.entity.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { UpdateExpenseDto } from './dto/update-expense.dto.js';
import { QueryExpenseDto } from './dto/query-expense.dto.js';
import { round2 } from '../common/round2.js';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
  ) {}

  create(dto: CreateExpenseDto): Promise<Expense> {
    const tasaCambio = dto.tasaCambio ?? 1;
    const expense = this.expensesRepository.create({
      ...dto,
      tasaCambio,
      montoPEN: round2(dto.monto * tasaCambio),
      activo: true,
    });
    return this.expensesRepository.save(expense);
  }

  findAll(query: QueryExpenseDto): Promise<Expense[]> {
    const where: Partial<Pick<Expense, 'activo'>> = {};
    if (query.activo !== undefined) {
      where.activo = query.activo;
    }
    return this.expensesRepository.find({ where, order: { fecha: 'DESC' } });
  }

  async findOne(id: string): Promise<Expense> {
    const expense = await this.expensesRepository.findOne({ where: { id } });
    if (!expense) {
      throw new NotFoundException(`Gasto ${id} no encontrado`);
    }
    return expense;
  }

  async update(id: string, dto: UpdateExpenseDto): Promise<Expense> {
    // Ver nota en ServicesService.update: nunca Object.assign(entity, dto).
    const expense = await this.findOne(id);
    const updatePayload: Partial<Expense> = { ...dto };
    if (dto.monto !== undefined || dto.tasaCambio !== undefined) {
      const monto = dto.monto ?? expense.monto;
      const tasaCambio = dto.tasaCambio ?? expense.tasaCambio;
      updatePayload.montoPEN = round2(monto * tasaCambio);
    }
    await this.expensesRepository.update(id, updatePayload);
    return this.findOne(id);
  }

  async softDelete(id: string): Promise<Expense> {
    const expense = await this.findOne(id);
    expense.activo = false;
    return this.expensesRepository.save(expense);
  }

  async reactivate(id: string): Promise<Expense> {
    const expense = await this.findOne(id);
    expense.activo = true;
    return this.expensesRepository.save(expense);
  }
}
