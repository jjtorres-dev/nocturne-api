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
import { Moneda } from '../../sales/moneda.enum.js';

// Igual que UpdateSaleDto: clienteId/comboId/asignaciones no son editables
// por PATCH a propósito, esa reasignación tiene que pasar por las
// validaciones de exclusividad (desactivar + crear un combo nuevo).
export class UpdateComboSaleDto {
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
