import type { SearchResultItem } from '../common/search-result.js';

export interface SearchResponse {
  contactos: SearchResultItem[];
  cuentas: SearchResultItem[];
  servicios: SearchResultItem[];
  combos: SearchResultItem[];
  ventas: SearchResultItem[];
  ventasCombo: SearchResultItem[];
  gastos: SearchResultItem[];
}
