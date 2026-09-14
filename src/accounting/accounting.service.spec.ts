import { AccountingService } from './accounting.service.js';
import { TimelineGroupBy } from '../common/timeline-group-by.enum.js';
import type { PaymentsService } from '../payments/payments.service.js';
import type { ExpensesService } from '../expenses/expenses.service.js';
import type { AccountsService } from '../accounts/accounts.service.js';
import type { ServicesService } from '../services/services.service.js';

describe('AccountingService', () => {
  let paymentsService: {
    sumMontoPEN: ReturnType<typeof vi.fn>;
    sumMontoPENByServicio: ReturnType<typeof vi.fn>;
    sumMontoPENByMetodoPago: ReturnType<typeof vi.fn>;
    sumMontoPENByPeriodo: ReturnType<typeof vi.fn>;
  };
  let expensesService: {
    sumMontoPEN: ReturnType<typeof vi.fn>;
    sumMontoPENByMetodoPago: ReturnType<typeof vi.fn>;
    sumMontoPENByPeriodo: ReturnType<typeof vi.fn>;
  };
  let accountsService: {
    sumCosto: ReturnType<typeof vi.fn>;
    sumCostoByServicio: ReturnType<typeof vi.fn>;
  };
  let servicesService: { findAll: ReturnType<typeof vi.fn> };
  let accountingService: AccountingService;

  const DESDE = '2026-01-01';
  const HASTA = '2026-01-31';

  beforeEach(() => {
    paymentsService = {
      sumMontoPEN: vi.fn().mockResolvedValue(0),
      sumMontoPENByServicio: vi.fn().mockResolvedValue([]),
      sumMontoPENByMetodoPago: vi.fn().mockResolvedValue([]),
      sumMontoPENByPeriodo: vi.fn().mockResolvedValue([]),
    };
    expensesService = {
      sumMontoPEN: vi.fn().mockResolvedValue(0),
      sumMontoPENByMetodoPago: vi.fn().mockResolvedValue([]),
      sumMontoPENByPeriodo: vi.fn().mockResolvedValue([]),
    };
    accountsService = {
      sumCosto: vi.fn().mockResolvedValue(0),
      sumCostoByServicio: vi.fn().mockResolvedValue([]),
    };
    servicesService = { findAll: vi.fn().mockResolvedValue([]) };

    accountingService = new AccountingService(
      paymentsService as unknown as PaymentsService,
      expensesService as unknown as ExpensesService,
      accountsService as unknown as AccountsService,
      servicesService as unknown as ServicesService,
    );
  });

  describe('summary', () => {
    it('ganancia = ingresos - inversion - gastos', async () => {
      paymentsService.sumMontoPEN.mockResolvedValue(500);
      accountsService.sumCosto.mockResolvedValue(200);
      expensesService.sumMontoPEN.mockResolvedValue(50);

      const result = await accountingService.summary(DESDE, HASTA);

      expect(result).toEqual({
        ingresos: 500,
        inversion: 200,
        gastos: 50,
        ganancia: 250,
      });
      expect(paymentsService.sumMontoPEN).toHaveBeenCalledWith(DESDE, HASTA);
      expect(accountsService.sumCosto).toHaveBeenCalledWith(DESDE, HASTA);
      expect(expensesService.sumMontoPEN).toHaveBeenCalledWith(DESDE, HASTA);
    });
  });

  describe('byService', () => {
    it('combina ingresos e inversion por servicio, con ganancia = ingresos - inversion', async () => {
      paymentsService.sumMontoPENByServicio.mockResolvedValue([
        { servicioId: 's1', ingresos: 300 },
        { servicioId: 's2', ingresos: 100 },
      ]);
      accountsService.sumCostoByServicio.mockResolvedValue([
        { servicioId: 's1', inversion: 100 },
        { servicioId: 's3', inversion: 50 },
      ]);
      servicesService.findAll.mockResolvedValue([
        { id: 's1', nombre: 'Netflix' },
        { id: 's2', nombre: 'Disney+' },
        { id: 's3', nombre: 'HBO Max' },
      ]);

      const result = await accountingService.byService(DESDE, HASTA);

      expect(result).toEqual([
        { servicioId: 's1', nombre: 'Netflix', inversion: 100, ingresos: 300, ganancia: 200 },
        { servicioId: 's2', nombre: 'Disney+', inversion: 0, ingresos: 100, ganancia: 100 },
        { servicioId: 's3', nombre: 'HBO Max', inversion: 50, ingresos: 0, ganancia: -50 },
      ]);
    });
  });

  describe('byPaymentMethod', () => {
    it('combina ingresos y gastos por método, con neto = ingresos - gastos', async () => {
      paymentsService.sumMontoPENByMetodoPago.mockResolvedValue([
        { metodoPago: 'Yape', ingresos: 300 },
        { metodoPago: 'Efectivo', ingresos: 50 },
      ]);
      expensesService.sumMontoPENByMetodoPago.mockResolvedValue([
        { metodoPago: 'Yape', gastos: 80 },
        { metodoPago: 'Transferencia', gastos: 20 },
      ]);

      const result = await accountingService.byPaymentMethod(DESDE, HASTA);

      expect(result).toEqual([
        { metodoPago: 'Yape', ingresos: 300, gastos: 80, neto: 220 },
        { metodoPago: 'Efectivo', ingresos: 50, gastos: 0, neto: 50 },
        { metodoPago: 'Transferencia', ingresos: 0, gastos: 20, neto: -20 },
      ]);
    });
  });

  describe('timeline', () => {
    it('combina ingresos y gastos por periodo, ordenado y con ganancia = ingresos - gastos', async () => {
      paymentsService.sumMontoPENByPeriodo.mockResolvedValue([
        { periodo: '2026-01-02', ingresos: 100 },
        { periodo: '2026-01-01', ingresos: 50 },
      ]);
      expensesService.sumMontoPENByPeriodo.mockResolvedValue([
        { periodo: '2026-01-01', gastos: 10 },
        { periodo: '2026-01-03', gastos: 5 },
      ]);

      const result = await accountingService.timeline(
        DESDE,
        HASTA,
        TimelineGroupBy.DAY,
      );

      expect(result).toEqual([
        { periodo: '2026-01-01', ingresos: 50, gastos: 10, ganancia: 40 },
        { periodo: '2026-01-02', ingresos: 100, gastos: 0, ganancia: 100 },
        { periodo: '2026-01-03', ingresos: 0, gastos: 5, ganancia: -5 },
      ]);
      expect(paymentsService.sumMontoPENByPeriodo).toHaveBeenCalledWith(
        DESDE,
        HASTA,
        TimelineGroupBy.DAY,
      );
    });

    it('usa groupBy=day por defecto si no se especifica', async () => {
      await accountingService.timeline(DESDE, HASTA);

      expect(paymentsService.sumMontoPENByPeriodo).toHaveBeenCalledWith(
        DESDE,
        HASTA,
        TimelineGroupBy.DAY,
      );
    });
  });
});
