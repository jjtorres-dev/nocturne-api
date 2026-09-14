import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from './entities/contact.entity.js';
import { ContactsService } from './contacts.service.js';
import { ContactsController } from './contacts.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Contact])],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
