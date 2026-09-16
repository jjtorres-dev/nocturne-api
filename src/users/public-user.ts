// Forma de usuario expuesta por la API: nunca incluye password_hash.
import type { UserRole } from './user-role.enum.js';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
