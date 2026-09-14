import type { ValueTransformer } from 'typeorm';
import { decrypt, encrypt } from './encryption.js';

// Transformer para columnas TypeORM que deben guardarse cifradas en reposo
// (credenciales de cuentas, PIN de perfiles). Se aplica igual que cualquier
// otro transformer de columna, sin tocar el resto de la lógica de negocio.
export const encryptedColumnTransformer: ValueTransformer = {
  to: (value?: string | null) =>
    value === null || value === undefined ? value : encrypt(value),
  from: (value?: string | null) =>
    value === null || value === undefined ? value : decrypt(value),
};
