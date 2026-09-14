import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale } from './entities/sale.entity.js';
import { SalesService } from './sales.service.js';
import { SalesController } from './sales.controller.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { ProfilesModule } from '../accounts/profiles/profiles.module.js';
import { ServicesModule } from '../services/services.module.js';
import { ContactsModule } from '../contacts/contacts.module.js';
import { PaymentsModule } from '../payments/payments.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale]),
    AccountsModule,
    ProfilesModule,
    ServicesModule,
    ContactsModule,
    PaymentsModule,
  ],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
