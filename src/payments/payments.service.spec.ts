import type { Repository } from 'typeorm';
import { PaymentsService } from './payments.service.js';
import { Payment } from './entities/payment.entity.js';
import { PaymentType } from './payment-type.enum.js';
import { Moneda } from '../sales/moneda.enum.js';

describe('PaymentsService', () => {
  let repo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let paymentsService: PaymentsService;

  beforeEach(() => {
    repo = {
      create: vi.fn((data) => ({ ...data })),
      save: vi.fn(async (entity) => entity),
    };
    paymentsService = new PaymentsService(repo as unknown as Repository<Payment>);
  });

  it('calcula montoPEN = monto * tasaCambio', async () => {
    const result = await paymentsService.create({
      ventaId: 'sale-1',
      monto: 10,
      moneda: Moneda.PEN,
      tasaCambio: 3.5,
      metodoPago: 'Yape',
      fecha: '2026-01-05',
      tipo: PaymentType.VENTA_INICIAL,
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ montoPEN: 35 }),
    );
    expect(result.montoPEN).toBe(35);
  });

  it('usa tasaCambio=1 tal cual (no asume default acá, lo decide el llamador)', async () => {
    await paymentsService.create({
      ventaId: 'sale-1',
      monto: 12.5,
      moneda: Moneda.PEN,
      tasaCambio: 1,
      metodoPago: 'Yape',
      fecha: '2026-01-05',
      tipo: PaymentType.VENTA_INICIAL,
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ montoPEN: 12.5 }),
    );
  });

  it('redondea montoPEN a 2 decimales', async () => {
    await paymentsService.create({
      ventaId: 'sale-1',
      monto: 10,
      moneda: Moneda.USD,
      tasaCambio: 3.333,
      metodoPago: 'Yape',
      fecha: '2026-01-05',
      tipo: PaymentType.RENOVACION,
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ montoPEN: 33.33 }),
    );
  });
});
