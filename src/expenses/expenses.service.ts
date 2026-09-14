import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from './entities/expense.entity.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { UpdateExpenseDto } from './dto/update-expense.dto.js';
import { QueryExpenseDto } from './dto/query-expense.dto.js';
import { round2 } from '../common/round2.js';
import { TimelineGroupBy } from '../common/timeline-group-by.enum.js';

export interface MetodoPagoGasto {
  metodoPago: string;
  gastos: number;
}

export interface PeriodoGasto {
  periodo: string;
  gastos: number;
}

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

  async sumMontoPEN(desde: string, hasta: string): Promise<number> {
    const result = await this.expensesRepository
      .createQueryBuilder('expense')
      .select('COALESCE(SUM(expense.montoPEN), 0)', 'total')
      .where('expense.activo = true')
      .andWhere('expense.fecha BETWEEN :desde AND :hasta', { desde, hasta })
      .getRawOne<{ total: string }>();
    return round2(parseFloat(result?.total ?? '0'));
  }

  async sumMontoPENByMetodoPago(
    desde: string,
    hasta: string,
  ): Promise<MetodoPagoGasto[]> {
    const rows = await this.expensesRepository
      .createQueryBuilder('expense')
      .select('expense.metodoPago', 'metodoPago')
      .addSelect('SUM(expense.montoPEN)', 'gastos')
      .where('expense.activo = true')
      .andWhere('expense.fecha BETWEEN :desde AND :hasta', { desde, hasta })
      .groupBy('expense.metodoPago')
      .getRawMany<{ metodoPago: string; gastos: string }>();
    return rows.map((row) => ({
      metodoPago: row.metodoPago,
      gastos: round2(parseFloat(row.gastos)),
    }));
  }

  // Ver nota equivalente en PaymentsService.sumMontoPENByPeriodo sobre por
  // qué `groupBy` se interpola directo en vez de como parámetro.
  async sumMontoPENByPeriodo(
    desde: string,
    hasta: string,
    groupBy: TimelineGroupBy,
  ): Promise<PeriodoGasto[]> {
    const rows = await this.expensesRepository
      .createQueryBuilder('expense')
      .select(
        `to_char(date_trunc('${groupBy}', expense.fecha), 'YYYY-MM-DD')`,
        'periodo',
      )
      .addSelect('SUM(expense.montoPEN)', 'gastos')
      .where('expense.activo = true')
      .andWhere('expense.fecha BETWEEN :desde AND :hasta', { desde, hasta })
      .groupBy('periodo')
      .orderBy('periodo', 'ASC')
      .getRawMany<{ periodo: string; gastos: string }>();
    return rows.map((row) => ({
      periodo: row.periodo,
      gastos: round2(parseFloat(row.gastos)),
    }));
  }
}
