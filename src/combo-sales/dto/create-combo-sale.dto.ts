import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Moneda } from '../../sales/moneda.enum.js';
import { ComboSaleAsignacionDto } from './combo-sale-asignacion.dto.js';

export class CreateComboSaleDto {
  @IsUUID()
  clienteId: string;

  @IsUUID()
  comboId: string;

  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

  @IsNumber({ maxDecimalPlaces: 1 })
  @IsPositive()
  duracionMeses: number;

  // Opcional: si no viene, ComboSalesService usa Combo.precioCombo.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  precio?: number;

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

  // Exactamente una asignación por cada servicio del combo (ver
  // ComboSalesService.assertAsignacionesCubrenCombo).
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ComboSaleAsignacionDto)
  asignaciones: ComboSaleAsignacionDto[];
}
