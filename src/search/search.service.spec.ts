import { SearchService } from './search.service.js';
import type { ContactsService } from '../contacts/contacts.service.js';
import type { AccountsService } from '../accounts/accounts.service.js';
import type { ServicesService } from '../services/services.service.js';
import type { CombosService } from '../combos/combos.service.js';
import type { SalesService } from '../sales/sales.service.js';
import type { ComboSalesService } from '../combo-sales/combo-sales.service.js';
import type { ExpensesService } from '../expenses/expenses.service.js';
import { UserRole } from '../users/user-role.enum.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

describe('SearchService', () => {
  const revendedorA: AuthenticatedUser = {
    id: 'revendedor-a',
    email: 'a@nocturne.dev',
    name: 'Revendedor A',
    role: UserRole.REVENDEDOR,
  };

  let contactsService: { search: ReturnType<typeof vi.fn> };
  let accountsService: { search: ReturnType<typeof vi.fn> };
  let servicesService: { search: ReturnType<typeof vi.fn> };
  let combosService: { search: ReturnType<typeof vi.fn> };
  let salesService: { search: ReturnType<typeof vi.fn> };
  let comboSalesService: { search: ReturnType<typeof vi.fn> };
  let expensesService: { search: ReturnType<typeof vi.fn> };
  let searchService: SearchService;

  beforeEach(() => {
    contactsService = { search: vi.fn().mockResolvedValue([{ id: 'c1', label: 'Juan' }]) };
    accountsService = {
      search: vi.fn().mockResolvedValue([{ id: 'a1', label: 'a@b.com — Netflix' }]),
    };
    servicesService = { search: vi.fn().mockResolvedValue([{ id: 's1', label: 'Netflix' }]) };
    combosService = { search: vi.fn().mockResolvedValue([{ id: 'co1', label: 'Combo A' }]) };
    salesService = { search: vi.fn().mockResolvedValue([{ id: 'v1', label: 'V-00001' }]) };
    comboSalesService = { search: vi.fn().mockResolvedValue([{ id: 'vc1', label: 'C-00001' }]) };
    expensesService = { search: vi.fn().mockResolvedValue([{ id: 'g1', label: 'Hosting' }]) };

    searchService = new SearchService(
      contactsService as unknown as ContactsService,
      accountsService as unknown as AccountsService,
      servicesService as unknown as ServicesService,
      combosService as unknown as CombosService,
      salesService as unknown as SalesService,
      comboSalesService as unknown as ComboSalesService,
      expensesService as unknown as ExpensesService,
    );
  });

  it('busca en las 7 categorías en paralelo y arma la respuesta con las claves esperadas', async () => {
    const result = await searchService.search('net', revendedorA);

    expect(contactsService.search).toHaveBeenCalledWith('net', revendedorA);
    expect(accountsService.search).toHaveBeenCalledWith('net', revendedorA);
    expect(servicesService.search).toHaveBeenCalledWith('net', revendedorA);
    expect(combosService.search).toHaveBeenCalledWith('net', revendedorA);
    expect(salesService.search).toHaveBeenCalledWith('net', revendedorA);
    expect(comboSalesService.search).toHaveBeenCalledWith('net', revendedorA);
    expect(expensesService.search).toHaveBeenCalledWith('net', revendedorA);

    expect(result).toEqual({
      contactos: [{ id: 'c1', label: 'Juan' }],
      cuentas: [{ id: 'a1', label: 'a@b.com — Netflix' }],
      servicios: [{ id: 's1', label: 'Netflix' }],
      combos: [{ id: 'co1', label: 'Combo A' }],
      ventas: [{ id: 'v1', label: 'V-00001' }],
      ventasCombo: [{ id: 'vc1', label: 'C-00001' }],
      gastos: [{ id: 'g1', label: 'Hosting' }],
    });
  });
});
