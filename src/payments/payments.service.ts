import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Payment } from './entities/payment.entity.js';
import type { CreatePaymentInput } from './create-payment.input.js';
import { round2 } from '../common/round2.js';
import { TimelineGroupBy } from '../common/timeline-group-by.enum.js';

export interface ServicioIngreso {
  servicioId: string;
  ingresos: number;
}

export interface MetodoPagoIngreso {
  metodoPago: string;
  ingresos: number;
}

export interface PeriodoIngreso {
  periodo: string;
  ingresos: number;
}

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
  ) {}

  // montoPEN se calcula acá (no lo manda el llamador) para que el redondeo
  // de monto*tasaCambio viva en un solo lugar, igual que Sale.precioPEN.
  create(input: CreatePaymentInput): Promise<Payment> {
    const payment = this.paymentsRepository.create({
      ...input,
      montoPEN: round2(input.monto * input.tasaCambio),
    });
    return this.paymentsRepository.save(payment);
  }

  // ownerId undefined = sin filtro (vista "todo el negocio" del admin, ver
  // AccountingService.resolveOwnerId). Un Payment no tiene columna
  // ownerId propia (Fase B7 — ver comentario en la entidad): se filtra vía
  // sale.ownerId O ventaCombo.ownerId, nunca ambos a la vez (CHECK
  // constraint de Fase 6 garantiza que solo uno de los dos FK está
  // poblado). leftJoin a ambas relaciones porque cada Payment usa una sola.
  private applyOwnerFilter(
    qb: SelectQueryBuilder<Payment>,
    ownerId: string | undefined,
  ): void {
    if (!ownerId) {
      return;
    }
    qb.leftJoin('payment.venta', 'ownerVenta')
      .leftJoin('payment.ventaCombo', 'ownerVentaCombo')
      .andWhere(
        '(ownerVenta.ownerId = :ownerId OR ownerVentaCombo.ownerId = :ownerId)',
        { ownerId },
      );
  }

  async sumMontoPEN(
    desde: string,
    hasta: string,
    ownerId?: string,
  ): Promise<number> {
    const qb = this.paymentsRepository
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.montoPEN), 0)', 'total')
      .where('payment.fecha BETWEEN :desde AND :hasta', { desde, hasta });
    this.applyOwnerFilter(qb, ownerId);
    const result = await qb.getRawOne<{ total: string }>();
    return round2(parseFloat(result?.total ?? '0'));
  }

  // Sin cambios en el join a `venta` (ya existía, innerJoin porque solo las
  // ventas sueltas tienen un servicioId propio — las de combo no
  // contribuyen a este desglose, mismo criterio de Fase 6): el filtro de
  // ownerId acá va directo sobre `venta.ownerId`, sin necesitar
  // ventaCombo.
  async sumMontoPENByServicio(
    desde: string,
    hasta: string,
    ownerId?: string,
  ): Promise<ServicioIngreso[]> {
    const qb = this.paymentsRepository
      .createQueryBuilder('payment')
      .innerJoin('payment.venta', 'venta')
      .select('venta.servicioId', 'servicioId')
      .addSelect('SUM(payment.montoPEN)', 'ingresos')
      .where('payment.fecha BETWEEN :desde AND :hasta', { desde, hasta })
      .groupBy('venta.servicioId');
    if (ownerId) {
      qb.andWhere('venta.ownerId = :ownerId', { ownerId });
    }
    const rows = await qb.getRawMany<{ servicioId: string; ingresos: string }>();
    return rows.map((row) => ({
      servicioId: row.servicioId,
      ingresos: round2(parseFloat(row.ingresos)),
    }));
  }

  async sumMontoPENByMetodoPago(
    desde: string,
    hasta: string,
    ownerId?: string,
  ): Promise<MetodoPagoIngreso[]> {
    const qb = this.paymentsRepository
      .createQueryBuilder('payment')
      .select('payment.metodoPago', 'metodoPago')
      .addSelect('SUM(payment.montoPEN)', 'ingresos')
      .where('payment.fecha BETWEEN :desde AND :hasta', { desde, hasta })
      .groupBy('payment.metodoPago');
    this.applyOwnerFilter(qb, ownerId);
    const rows = await qb.getRawMany<{ metodoPago: string; ingresos: string }>();
    return rows.map((row) => ({
      metodoPago: row.metodoPago,
      ingresos: round2(parseFloat(row.ingresos)),
    }));
  }

  // `groupBy` se interpola directo (no como parámetro) porque siempre viene
  // de TimelineGroupBy, un enum de 3 valores fijos: no hay entrada de
  // usuario que llegue sin pasar antes por el DTO validado con @IsEnum.
  async sumMontoPENByPeriodo(
    desde: string,
    hasta: string,
    groupBy: TimelineGroupBy,
    ownerId?: string,
  ): Promise<PeriodoIngreso[]> {
    const qb = this.paymentsRepository
      .createQueryBuilder('payment')
      .select(
        `to_char(date_trunc('${groupBy}', payment.fecha), 'YYYY-MM-DD')`,
        'periodo',
      )
      .addSelect('SUM(payment.montoPEN)', 'ingresos')
      .where('payment.fecha BETWEEN :desde AND :hasta', { desde, hasta })
      .groupBy('periodo')
      .orderBy('periodo', 'ASC');
    this.applyOwnerFilter(qb, ownerId);
    const rows = await qb.getRawMany<{ periodo: string; ingresos: string }>();
    return rows.map((row) => ({
      periodo: row.periodo,
      ingresos: round2(parseFloat(row.ingresos)),
    }));
  }
}
