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
import { UserRole } from '../users/user-role.enum.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

const GROUP_BY_DEFAULT = TimelineGroupBy.DAY;

// Valor especial de `viewOwnerId` (solo ADMIN): sin filtro de ownerId, la
// vista de "todo el negocio" sumando todos los usuarios.
const VIEW_ALL = 'all';

@Injectable()
export class AccountingService {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly expensesService: ExpensesService,
    private readonly accountsService: AccountsService,
    private readonly servicesService: ServicesService,
  ) {}

  async summary(
    desdeInput: string | undefined,
    hastaInput: string | undefined,
    currentUser: AuthenticatedUser,
    viewOwnerId?: string,
  ): Promise<AccountingSummary> {
    const ownerId = this.resolveOwnerId(currentUser, viewOwnerId);
    const { desde, hasta } = resolveRango(desdeInput, hastaInput);
    const [ingresos, inversion, gastos] = await Promise.all([
      this.paymentsService.sumMontoPEN(desde, hasta, ownerId),
      this.accountsService.sumCosto(desde, hasta, ownerId),
      this.expensesService.sumMontoPEN(desde, hasta, ownerId),
    ]);
    return {
      ingresos,
      inversion,
      gastos,
      ganancia: round2(ingresos - inversion - gastos),
    };
  }

  async byService(
    desdeInput: string | undefined,
    hastaInput: string | undefined,
    currentUser: AuthenticatedUser,
    viewOwnerId?: string,
  ): Promise<ServiceBreakdown[]> {
    const ownerId = this.resolveOwnerId(currentUser, viewOwnerId);
    const { desde, hasta } = resolveRango(desdeInput, hastaInput);
    const [ingresosPorServicio, inversionPorServicio, servicios] =
      await Promise.all([
        this.paymentsService.sumMontoPENByServicio(desde, hasta, ownerId),
        this.accountsService.sumCostoByServicio(desde, hasta, ownerId),
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
    desdeInput: string | undefined,
    hastaInput: string | undefined,
    currentUser: AuthenticatedUser,
    viewOwnerId?: string,
  ): Promise<PaymentMethodBreakdown[]> {
    const ownerId = this.resolveOwnerId(currentUser, viewOwnerId);
    const { desde, hasta } = resolveRango(desdeInput, hastaInput);
    const [ingresosPorMetodo, gastosPorMetodo] = await Promise.all([
      this.paymentsService.sumMontoPENByMetodoPago(desde, hasta, ownerId),
      this.expensesService.sumMontoPENByMetodoPago(desde, hasta, ownerId),
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
    desdeInput: string | undefined,
    hastaInput: string | undefined,
    currentUser: AuthenticatedUser,
    groupBy: TimelineGroupBy = GROUP_BY_DEFAULT,
    viewOwnerId?: string,
  ): Promise<TimelinePoint[]> {
    const ownerId = this.resolveOwnerId(currentUser, viewOwnerId);
    const { desde, hasta } = resolveRango(desdeInput, hastaInput);
    const [ingresosPorPeriodo, gastosPorPeriodo] = await Promise.all([
      this.paymentsService.sumMontoPENByPeriodo(desde, hasta, groupBy, ownerId),
      this.expensesService.sumMontoPENByPeriodo(desde, hasta, groupBy, ownerId),
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

  // Multi-usuario — Fase B7. Resuelve el ownerId efectivo para los 4
  // reportes:
  // - REVENDEDOR: siempre su propio id, sin importar qué mande
  //   `viewOwnerId` — se ignora en silencio (nunca se le confirma ni con
  //   un error que la opción existe).
  // - ADMIN sin `viewOwnerId`: por defecto ve exactamente lo mismo que
  //   vería como si fuera un revendedor más (solo lo suyo) — Contabilidad
  //   nunca expone el negocio completo por accidente.
  // - ADMIN con `viewOwnerId=<uuid>`: filtra por ese dueño en vez del
  //   propio (vista "ver como").
  // - ADMIN con `viewOwnerId=all`: sin filtro — la vista de "todo el
  //   negocio", suma de todos los usuarios.
  private resolveOwnerId(
    currentUser: AuthenticatedUser,
    viewOwnerId: string | undefined,
  ): string | undefined {
    if (currentUser.role !== UserRole.ADMIN) {
      return currentUser.id;
    }
    if (!viewOwnerId) {
      return currentUser.id;
    }
    if (viewOwnerId === VIEW_ALL) {
      return undefined;
    }
    return viewOwnerId;
  }
}
