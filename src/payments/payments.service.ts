import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async sumMontoPEN(desde: string, hasta: string): Promise<number> {
    const result = await this.paymentsRepository
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.montoPEN), 0)', 'total')
      .where('payment.fecha BETWEEN :desde AND :hasta', { desde, hasta })
      .getRawOne<{ total: string }>();
    return round2(parseFloat(result?.total ?? '0'));
  }

  async sumMontoPENByServicio(
    desde: string,
    hasta: string,
  ): Promise<ServicioIngreso[]> {
    const rows = await this.paymentsRepository
      .createQueryBuilder('payment')
      .innerJoin('payment.venta', 'venta')
      .select('venta.servicioId', 'servicioId')
      .addSelect('SUM(payment.montoPEN)', 'ingresos')
      .where('payment.fecha BETWEEN :desde AND :hasta', { desde, hasta })
      .groupBy('venta.servicioId')
      .getRawMany<{ servicioId: string; ingresos: string }>();
    return rows.map((row) => ({
      servicioId: row.servicioId,
      ingresos: round2(parseFloat(row.ingresos)),
    }));
  }

  async sumMontoPENByMetodoPago(
    desde: string,
    hasta: string,
  ): Promise<MetodoPagoIngreso[]> {
    const rows = await this.paymentsRepository
      .createQueryBuilder('payment')
      .select('payment.metodoPago', 'metodoPago')
      .addSelect('SUM(payment.montoPEN)', 'ingresos')
      .where('payment.fecha BETWEEN :desde AND :hasta', { desde, hasta })
      .groupBy('payment.metodoPago')
      .getRawMany<{ metodoPago: string; ingresos: string }>();
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
  ): Promise<PeriodoIngreso[]> {
    const rows = await this.paymentsRepository
      .createQueryBuilder('payment')
      .select(
        `to_char(date_trunc('${groupBy}', payment.fecha), 'YYYY-MM-DD')`,
        'periodo',
      )
      .addSelect('SUM(payment.montoPEN)', 'ingresos')
      .where('payment.fecha BETWEEN :desde AND :hasta', { desde, hasta })
      .groupBy('periodo')
      .orderBy('periodo', 'ASC')
      .getRawMany<{ periodo: string; ingresos: string }>();
    return rows.map((row) => ({
      periodo: row.periodo,
      ingresos: round2(parseFloat(row.ingresos)),
    }));
  }
}
