import type { ValueTransformer } from 'typeorm';

// pg/TypeORM devuelven las columnas "decimal" como string para no perder
// precisión. Acá se opta por trabajar con number en la app (los valores de
// negocio no requieren precisión arbitraria) y se convierte en ambas
// direcciones.
export const decimalTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) =>
    value === null || value === undefined ? value : parseFloat(value),
};
