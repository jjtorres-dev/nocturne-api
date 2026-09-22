import { UserRole } from '../users/user-role.enum.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

// Shape común de un resultado del buscador global (ver src/search/): `label`
// es el campo que matcheó, con contexto breve si aplica (ej. Cuentas:
// "correo — Servicio"). `ownerName` es un campo aparte (nunca metido dentro
// de `label`, que puede traer cualquier texto del usuario incluido saltos de
// línea) y solo viene presente cuando quien busca es admin.
export interface SearchResultItem {
  id: string;
  label: string;
  ownerName?: string;
}

// Solo para ADMIN: un REVENDEDOR ya sabe que todo lo que le devuelve el
// buscador es suyo, así que ni siquiera se le manda el campo.
export function resolveOwnerName(
  ownerName: string | undefined,
  currentUser: AuthenticatedUser,
): string | undefined {
  return currentUser.role === UserRole.ADMIN ? ownerName : undefined;
}
