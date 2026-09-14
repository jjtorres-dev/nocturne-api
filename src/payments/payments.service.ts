import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from './entities/payment.entity.js';
import type { CreatePaymentInput } from './create-payment.input.js';
import { round2 } from '../common/round2.js';

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
}
