import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VentaCombo } from './entities/venta-combo.entity.js';
import { ComboSalesService } from './combo-sales.service.js';
import { ComboSalesController } from './combo-sales.controller.js';
import { ContactsModule } from '../contacts/contacts.module.js';
import { CombosModule } from '../combos/combos.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([VentaCombo]), ContactsModule, CombosModule],
  controllers: [ComboSalesController],
  providers: [ComboSalesService],
  exports: [ComboSalesService],
})
export class ComboSalesModule {}
