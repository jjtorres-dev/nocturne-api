import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';
import { Moneda } from '../moneda.enum.js';

// clienteId/cuentaId/perfilId no son editables por PATCH a propósito: esa
// reasignación tiene que pasar por las validaciones de exclusividad de
// SalesService (assertPerfilLibre/assertCuentaLibre) y por la
// sincronización del clienteId en Perfil/Cuenta, que un
// `repository.update(id, dto)` genérico no dispara. Para reasignar, se
// desactiva la venta (libera el perfil/cuenta) y se crea una nueva.
export class UpdateSaleDto {
  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaFin?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  precio?: number;

  @IsOptional()
  @IsEnum(Moneda)
  moneda?: Moneda;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  tasaCambio?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  metodoPago?: string;

  @IsOptional()
  @IsBoolean()
  renovacionAutomatica?: boolean;
}
