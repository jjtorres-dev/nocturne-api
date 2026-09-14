import { Injectable } from '@nestjs/common';
import { PaymentsService } from '../payments/payments.service.js';
import { ExpensesService } from '../expenses/expenses.service.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { ServicesService } from '../services/services.service.js';
import { TimelineGroupBy } from '../common/timeline-group-by.enum.js';
import { round2 } from '../common/round2.js';
import { resolveRango } from './date-range.util.js';
import type { AccountingSummary } from './accounting-summary.js';
import type { ServiceBreakdown } from './service-breakdown.js';
import type { PaymentMethodBreakdown } from './payment-method-breakdown.js';
import type { TimelinePoint } from './timeline-point.js';

const GROUP_BY_DEFAULT = TimelineGroupBy.DAY;

@Injectable()
export class AccountingService {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly expensesService: ExpensesService,
    private readonly accountsService: AccountsService,
    private readonly servicesService: ServicesService,
  ) {}

  async summary(desdeInput?: string, hastaInput?: string): Promise<AccountingSummary> {
    const { desde, hasta } = resolveRango(desdeInput, hastaInput);
    const [ingresos, inversion, gastos] = await Promise.all([
      this.paymentsService.sumMontoPEN(desde, hasta),
      this.accountsService.sumCosto(desde, hasta),
      this.expensesService.sumMontoPEN(desde, hasta),
    ]);
    return {
      ingresos,
      inversion,
      gastos,
      ganancia: round2(ingresos - inversion - gastos),
    };
  }

  async byService(
    desdeInput?: string,
    hastaInput?: string,
  ): Promise<ServiceBreakdown[]> {
    const { desde, hasta } = resolveRango(desdeInput, hastaInput);
    const [ingresosPorServicio, inversionPorServicio, servicios] =
      await Promise.all([
        this.paymentsService.sumMontoPENByServicio(desde, hasta),
        this.accountsService.sumCostoByServicio(desde, hasta),
        this.servicesService.findAll({}),
      ]);

    const nombreById = new Map(servicios.map((s) => [s.id, s.nombre]));
    const ingresosById = new Map(
      ingresosPorServicio.map((r) => [r.servicioId, r.ingresos]),
    );
    const inversionById = new Map(
      inversionPorServicio.map((r) => [r.servicioId, r.inversion]),
    );
    const servicioIds = new Set([
      ...ingresosById.keys(),
      ...inversionById.keys(),
    ]);

    return Array.from(servicioIds).map((servicioId) => {
      const ingresos = ingresosById.get(servicioId) ?? 0;
      const inversion = inversionById.get(servicioId) ?? 0;
      return {
        servicioId,
        nombre: nombreById.get(servicioId) ?? servicioId,
        inversion,
        ingresos,
        ganancia: round2(ingresos - inversion),
      };
    });
  }

  async byPaymentMethod(
    desdeInput?: string,
    hastaInput?: string,
  ): Promise<PaymentMethodBreakdown[]> {
    const { desde, hasta } = resolveRango(desdeInput, hastaInput);
    const [ingresosPorMetodo, gastosPorMetodo] = await Promise.all([
      this.paymentsService.sumMontoPENByMetodoPago(desde, hasta),
      this.expensesService.sumMontoPENByMetodoPago(desde, hasta),
    ]);

    const ingresosByMetodo = new Map(
      ingresosPorMetodo.map((r) => [r.metodoPago, r.ingresos]),
    );
    const gastosByMetodo = new Map(
      gastosPorMetodo.map((r) => [r.metodoPago, r.gastos]),
    );
    const metodos = new Set([
      ...ingresosByMetodo.keys(),
      ...gastosByMetodo.keys(),
    ]);

    return Array.from(metodos).map((metodoPago) => {
      const ingresos = ingresosByMetodo.get(metodoPago) ?? 0;
      const gastos = gastosByMetodo.get(metodoPago) ?? 0;
      return {
        metodoPago,
        ingresos,
        gastos,
        neto: round2(ingresos - gastos),
      };
    });
  }

  async timeline(
    desdeInput?: string,
    hastaInput?: string,
    groupBy: TimelineGroupBy = GROUP_BY_DEFAULT,
  ): Promise<TimelinePoint[]> {
    const { desde, hasta } = resolveRango(desdeInput, hastaInput);
    const [ingresosPorPeriodo, gastosPorPeriodo] = await Promise.all([
      this.paymentsService.sumMontoPENByPeriodo(desde, hasta, groupBy),
      this.expensesService.sumMontoPENByPeriodo(desde, hasta, groupBy),
    ]);

    const ingresosByPeriodo = new Map(
      ingresosPorPeriodo.map((r) => [r.periodo, r.ingresos]),
    );
    const gastosByPeriodo = new Map(
      gastosPorPeriodo.map((r) => [r.periodo, r.gastos]),
    );
    const periodos = Array.from(
      new Set([...ingresosByPeriodo.keys(), ...gastosByPeriodo.keys()]),
    ).sort();

    return periodos.map((periodo) => {
      const ingresos = ingresosByPeriodo.get(periodo) ?? 0;
      const gastos = gastosByPeriodo.get(periodo) ?? 0;
      return {
        periodo,
        ingresos,
        gastos,
        ganancia: round2(ingresos - gastos),
      };
    });
  }
}
