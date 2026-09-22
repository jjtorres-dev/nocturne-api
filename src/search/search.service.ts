import { Injectable } from '@nestjs/common';
import { ContactsService } from '../contacts/contacts.service.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { ServicesService } from '../services/services.service.js';
import { CombosService } from '../combos/combos.service.js';
import { SalesService } from '../sales/sales.service.js';
import { ComboSalesService } from '../combo-sales/combo-sales.service.js';
import { ExpensesService } from '../expenses/expenses.service.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import type { SearchResponse } from './search-response.js';

@Injectable()
export class SearchService {
  constructor(
    private readonly contactsService: ContactsService,
    private readonly accountsService: AccountsService,
    private readonly servicesService: ServicesService,
    private readonly combosService: CombosService,
    private readonly salesService: SalesService,
    private readonly comboSalesService: ComboSalesService,
    private readonly expensesService: ExpensesService,
  ) {}

  // Cada categoría hace su propio LIMIT 5 acotado por ownerId (ver
  // <Modulo>Service.search) — Promise.all en vez de secuencial porque son 7
  // queries independientes, no hay por qué esperarlas una a una.
  async search(
    term: string,
    currentUser: AuthenticatedUser,
  ): Promise<SearchResponse> {
    const [contactos, cuentas, servicios, combos, ventas, ventasCombo, gastos] =
      await Promise.all([
        this.contactsService.search(term, currentUser),
        this.accountsService.search(term, currentUser),
        this.servicesService.search(term, currentUser),
        this.combosService.search(term, currentUser),
        this.salesService.search(term, currentUser),
        this.comboSalesService.search(term, currentUser),
        this.expensesService.search(term, currentUser),
      ]);
    return { contactos, cuentas, servicios, combos, ventas, ventasCombo, gastos };
  }
}
