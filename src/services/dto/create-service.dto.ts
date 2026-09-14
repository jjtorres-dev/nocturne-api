import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';
import { ServiceType } from '../service-type.enum.js';

export class CreateServiceDto {
  @IsString()
  @MinLength(1)
  nombre: string;

  @IsEnum(ServiceType)
  tipo: ServiceType;

  @IsNumber({ maxDecimalPlaces: 1 })
  @IsPositive()
  duracionMeses: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  pantallasMax?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  precioBase: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
