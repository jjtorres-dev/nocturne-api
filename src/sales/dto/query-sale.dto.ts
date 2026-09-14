import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { VencimientoFiltro } from '../vencimiento.enum.js';

export class QuerySaleDto {
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsOptional()
  @IsUUID()
  servicioId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsEnum(VencimientoFiltro)
  vencimiento?: VencimientoFiltro;

  // Solo tiene efecto junto con `vencimiento` (define el borde entre
  // por_vencer y al_dia). Default 3 se aplica en el service, no acá.
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  diasAlerta?: number;
}
