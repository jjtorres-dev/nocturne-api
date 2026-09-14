import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './entities/account.entity.js';
import { Profile } from './profiles/entities/profile.entity.js';
import { AccountsService } from './accounts.service.js';
import { AccountsController } from './accounts.controller.js';
import { ServicesModule } from '../services/services.module.js';
import { ContactsModule } from '../contacts/contacts.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Account, Profile]),
    ServicesModule,
    ContactsModule,
  ],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
