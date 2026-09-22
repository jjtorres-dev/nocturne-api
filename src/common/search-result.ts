// Shape común de un resultado del buscador global (ver src/search/): `label`
// es el campo que matcheó, con contexto breve si aplica (ej. Cuentas:
// "correo — Servicio").
export interface SearchResultItem {
  id: string;
  label: string;
}
