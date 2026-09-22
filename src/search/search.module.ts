import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { ServicesModule } from '../services/services.module.js';
import { CombosModule } from '../combos/combos.module.js';
import { SalesModule } from '../sales/sales.module.js';
import { ComboSalesModule } from '../combo-sales/combo-sales.module.js';
import { ExpensesModule } from '../expenses/expenses.module.js';
import { SearchService } from './search.service.js';
import { SearchController } from './search.controller.js';

// Sin repos propios: el buscador global compone los métodos `search()` que
// ya viven en cada dominio (mismo patrón que AccountingModule con los
// reportes), no lee las tablas de otros módulos directo.
@Module({
  imports: [
    ContactsModule,
    AccountsModule,
    ServicesModule,
    CombosModule,
    SalesModule,
    ComboSalesModule,
    ExpensesModule,
  ],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
