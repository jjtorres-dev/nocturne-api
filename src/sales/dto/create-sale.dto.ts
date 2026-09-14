import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { Moneda } from '../moneda.enum.js';

export class CreateSaleDto {
  @IsUUID()
  clienteId: string;

  @IsUUID()
  cuentaId: string;

  @IsOptional()
  @IsUUID()
  perfilId?: string;

  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  precio: number;

  @IsEnum(Moneda)
  moneda: Moneda;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  tasaCambio?: number;

  @IsString()
  @MinLength(1)
  metodoPago: string;

  @IsOptional()
  @IsBoolean()
  renovacionAutomatica?: boolean;
}
