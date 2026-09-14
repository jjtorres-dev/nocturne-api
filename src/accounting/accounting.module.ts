import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service.js';
import { AccountingController } from './accounting.controller.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { ExpensesModule } from '../expenses/expenses.module.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { ServicesModule } from '../services/services.module.js';

@Module({
  imports: [PaymentsModule, ExpensesModule, AccountsModule, ServicesModule],
  controllers: [AccountingController],
  providers: [AccountingService],
})
export class AccountingModule {}
