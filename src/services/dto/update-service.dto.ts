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

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nombre?: string;

  @IsOptional()
  @IsEnum(ServiceType)
  tipo?: ServiceType;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @IsPositive()
  duracionMeses?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  pantallasMax?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  precioBase?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
