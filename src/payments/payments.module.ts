import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity.js';
import { PaymentsService } from './payments.service.js';

// Sin controller: Payment no tiene endpoints propios, lo crea SalesService
// automáticamente al crear/renovar una venta (ver PROGRESS.md Fase 5).
@Module({
  imports: [TypeOrmModule.forFeature([Payment])],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
