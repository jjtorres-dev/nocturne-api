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

export class CreateExpenseDto {
  @IsString()
  @MinLength(1)
  descripcion: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  monto: number;

  @IsEnum(Moneda)
  moneda: Moneda;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  tasaCambio?: number;

  @IsString()
  @MinLength(1)
  metodoPago: string;

  @IsDateString()
  fecha: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
