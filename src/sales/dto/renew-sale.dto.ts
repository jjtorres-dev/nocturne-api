import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';
import { Moneda } from '../moneda.enum.js';

// Todo opcional a propósito: sin body, renew() debe comportarse igual que
// antes de la Fase 5 (solo extiende fechaFin), usando los valores actuales
// de la venta para el Payment de renovación.
export class RenewSaleDto {
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
}
