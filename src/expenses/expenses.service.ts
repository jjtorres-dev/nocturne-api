import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from './entities/expense.entity.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { UpdateExpenseDto } from './dto/update-expense.dto.js';
import { QueryExpenseDto } from './dto/query-expense.dto.js';
import { round2 } from '../common/round2.js';
import { TimelineGroupBy } from '../common/timeline-group-by.enum.js';
import { UserRole } from '../users/user-role.enum.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

export interface MetodoPagoGasto {
  metodoPago: string;
  gastos: number;
}

export interface PeriodoGasto {
  periodo: string;
  gastos: number;
}

// Se agrega siempre a las respuestas de findOneOwned/findAllOwned (admin o
// REVENDEDOR, sin condicional por rol): solo id/name/email del dueño, nunca
// el resto de User (ni por accidente el password_hash) — mismo criterio que
// Servicios/Contactos/Cuentas/Ventas/Combos.
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
  owner: {
    id: true,
    name: true,
    email: true,
  },
} as const;

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
  ) {}

  create(dto: CreateExpenseDto, currentUser: AuthenticatedUser): Promise<Expense> {
    const tasaCambio = dto.tasaCambio ?? 1;
    const expense = this.expensesRepository.create({
      ...dto,
      ownerId: currentUser.id,
      tasaCambio,
      montoPEN: round2(dto.monto * tasaCambio),
      activo: true,
    });
    return this.expensesRepository.save(expense);
  }

  // Sin scope de ownership: uso interno de otros módulos (AccountingService,
  // vía sumMontoPEN/sumMontoPENByMetodoPago/sumMontoPENByPeriodo más abajo,
  // que hoy agregan sobre todos los gastos sin ningún concepto de usuario
  // HTTP). Nunca exponer este método (ni findOne) directo en el controller
  // — ver findAllOwned/findOneOwned para eso.
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

  // Punto de entrada para el controller: un REVENDEDOR SIEMPRE queda
  // acotado a lo suyo acá, sin depender de que el cliente mande el filtro
  // correcto — la seguridad vive en el backend.
  findAllOwned(
    query: QueryExpenseDto,
    currentUser: AuthenticatedUser,
  ): Promise<Expense[]> {
    const where: Partial<Pick<Expense, 'activo' | 'ownerId'>> = {};
    if (query.activo !== undefined) {
      where.activo = query.activo;
    }
    if (currentUser.role === UserRole.REVENDEDOR) {
      where.ownerId = currentUser.id;
    }
    return this.expensesRepository.find({
      where,
      relations: { owner: true },
      select: OWNED_SELECT,
      order: { fecha: 'DESC' },
    });
  }

  // Un REVENDEDOR pidiendo un gasto ajeno recibe 404, no 403: no hay que
  // confirmarle que el recurso existe si no es suyo.
  async findOneOwned(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<Expense> {
    const expense = await this.expensesRepository.findOne({
      where: { id },
      relations: { owner: true },
      select: OWNED_SELECT,
    });
    if (
      !expense ||
      (currentUser.role === UserRole.REVENDEDOR &&
        expense.ownerId !== currentUser.id)
    ) {
      throw new NotFoundException(`Gasto ${id} no encontrado`);
    }
    return expense;
  }

  async update(
    id: string,
    dto: UpdateExpenseDto,
    currentUser: AuthenticatedUser,
  ): Promise<Expense> {
    // Ver nota en ServicesService.update: nunca Object.assign(entity, dto).
    const expense = await this.findOneOwned(id, currentUser);
    const updatePayload: Partial<Expense> = { ...dto };
    if (dto.monto !== undefined || dto.tasaCambio !== undefined) {
      const monto = dto.monto ?? expense.monto;
      const tasaCambio = dto.tasaCambio ?? expense.tasaCambio;
      updatePayload.montoPEN = round2(monto * tasaCambio);
    }
    await this.expensesRepository.update(id, updatePayload);
    return this.findOneOwned(id, currentUser);
  }

  async softDelete(id: string, currentUser: AuthenticatedUser): Promise<Expense> {
    const expense = await this.findOneOwned(id, currentUser);
    expense.activo = false;
    return this.expensesRepository.save(expense);
  }

  async reactivate(id: string, currentUser: AuthenticatedUser): Promise<Expense> {
    const expense = await this.findOneOwned(id, currentUser);
    expense.activo = true;
    return this.expensesRepository.save(expense);
  }

  // ownerId undefined = sin filtro (vista "todo el negocio" del admin, ver
  // AccountingService.resolveOwnerId).
  async sumMontoPEN(
    desde: string,
    hasta: string,
    ownerId?: string,
  ): Promise<number> {
    const qb = this.expensesRepository
      .createQueryBuilder('expense')
      .select('COALESCE(SUM(expense.montoPEN), 0)', 'total')
      .where('expense.activo = true')
      .andWhere('expense.fecha BETWEEN :desde AND :hasta', { desde, hasta });
    if (ownerId) {
      qb.andWhere('expense.ownerId = :ownerId', { ownerId });
    }
    const result = await qb.getRawOne<{ total: string }>();
    return round2(parseFloat(result?.total ?? '0'));
  }

  async sumMontoPENByMetodoPago(
    desde: string,
    hasta: string,
    ownerId?: string,
  ): Promise<MetodoPagoGasto[]> {
    const qb = this.expensesRepository
      .createQueryBuilder('expense')
      .select('expense.metodoPago', 'metodoPago')
      .addSelect('SUM(expense.montoPEN)', 'gastos')
      .where('expense.activo = true')
      .andWhere('expense.fecha BETWEEN :desde AND :hasta', { desde, hasta })
      .groupBy('expense.metodoPago');
    if (ownerId) {
      qb.andWhere('expense.ownerId = :ownerId', { ownerId });
    }
    const rows = await qb.getRawMany<{ metodoPago: string; gastos: string }>();
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
    ownerId?: string,
  ): Promise<PeriodoGasto[]> {
    const qb = this.expensesRepository
      .createQueryBuilder('expense')
      .select(
        `to_char(date_trunc('${groupBy}', expense.fecha), 'YYYY-MM-DD')`,
        'periodo',
      )
      .addSelect('SUM(expense.montoPEN)', 'gastos')
      .where('expense.activo = true')
      .andWhere('expense.fecha BETWEEN :desde AND :hasta', { desde, hasta })
      .groupBy('periodo')
      .orderBy('periodo', 'ASC');
    if (ownerId) {
      qb.andWhere('expense.ownerId = :ownerId', { ownerId });
    }
    const rows = await qb.getRawMany<{ periodo: string; gastos: string }>();
    return rows.map((row) => ({
      periodo: row.periodo,
      gastos: round2(parseFloat(row.gastos)),
    }));
  }
}
