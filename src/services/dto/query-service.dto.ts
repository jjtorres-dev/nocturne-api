import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ServiceType } from '../service-type.enum.js';

export class QueryServiceDto {
  @IsOptional()
  @IsEnum(ServiceType)
  tipo?: ServiceType;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  activo?: boolean;
}
